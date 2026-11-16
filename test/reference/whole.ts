// The outline and the answer as TestMD made them before it read a checklist a piece at a time: the whole text parsed at
// once, on every call. Kept only so the tests can check the piece-at-a-time code gives the very same results.
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { BOX, blockLabel, createRenderer, ItemKind, ItemState } from '../../src/core/markdown';
import { maxPictureNumber } from '../../src/core/model';
import type { Answer } from '../../src/core/model';
import type { BlockRow, HeadingRow, NoteView, Outline, Part, Row } from '../../src/core/outline';
import { headingSlugs, inlinePlain } from '../../src/core/slug';

export interface Item { line: number; end: number; kind: ItemKind; state: ItemState; }

/** readChecklist as it was: a new renderer and a parse of the whole text. Items only. */
export function wholeItems(text: string, stepLabels: string[]): Item[] {
  const md = createRenderer({ interactive: true, stepLabels });
  const tokens = md.parse(text, {});
  const items: Item[] = [];
  for (const t of tokens) {
    if (t.type === 'list_item_open' && t.attrGet('data-td-line') !== null && t.map) {
      const cls = (t.attrGet('class') ?? '').split(/\s+/);
      items.push({ line: t.map[0], end: t.map[1], kind: cls.includes('td-step') ? 'step' : 'check',
        state: cls.includes('td-yes') ? 'yes' : cls.includes('td-no') ? 'no' : 'none' });
    }
  }
  return items;
}

/** Every heading's line and level, from the whole text. */
export function wholeSections(text: string): { line: number; level: number; title: string }[] {
  return new MarkdownIt({ html: true }).parse(text, {}).flatMap((t, i, all) =>
    t.type === 'heading_open' && t.map ? [{ line: t.map[0], level: Number(t.tag.slice(1)), title: all[i + 1].content }] : []);
}

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
const PILL = /<span class="pill[^"]*">[^<]*<\/span>/g;
const ONLY_PILLS = /^(\s*<span class="pill[^"]*">[^<]*<\/span>\s*)+$/;
const ITALIC = /^\*(?!\*)[\s\S]*\*$/;
const NUM = /^\*\*((?:[A-Z]|\d+)(?:\.\d+)*)\*\*\s*/;
const LABEL_NUM = /^((?:[A-Z]|\d+)(?:\.\d+)*)\s*·\s*(.+)$/;
const IMG = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const NOTE_HEAD = /^(?:❌|📝)\s*\*\*(?:No|Note)\*\*\s*·\s*([^·]+?)\s*·\s*([^—]+?)\s*(?:—\s*([\s\S]*))?$/;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
const render = (tokens: Token[], a: number, b: number) => md.renderer.render(tokens.slice(a, b), md.options, {});

/** "16.2 A title" → number and title; "Part 16 · A title" → 16 and the title. */
function splitHeading(raw: string): { num: string; title: string; done: boolean; pills: string } {
  const pills: string[] = [];
  let s = raw.trim().replace(PILL, m => { pills.push(m); return ''; }).trim();
  const donePill = pills.some(p => /pill success/.test(p) && />\s*Done\s*</i.test(p));
  const struck = /^~~[\s\S]*~~$/.test(s);
  s = s.replace(/^~~|~~$/g, '').trim();
  let num = '', title = s, m: RegExpExecArray | null;
  if ((m = /^Part (\d+)\s*·\s*(.+)$/.exec(s))) { num = m[1]; title = m[2]; }
  else if ((m = /^((?:[A-Z]|\d+)(?:\.\d+)+)\s+(?:·\s*)?(.+)$/.exec(s))) { num = m[1]; title = m[2]; }
  return { num, title: md.renderInline(title), done: struck || donePill, pills: pills.filter(p => !/>\s*Done\s*</i.test(p)).join(' ') };
}

function noteOf(content: string): NoteView {
  const pics: NoteView['pics'] = [];
  const body = content.replace(IMG, (_all, label: string, p: string) => { pics.push({ label, path: safeDecode(p) }); return ''; }).trim();
  const struck = /^~~/.test(body);
  const clean = body.replace(/^~~/, '').replace(/~~$/, '').trim();
  const type: NoteView['type'] = clean.startsWith('❌') ? (struck ? 'old' : 'no') : 'note';
  const m = NOTE_HEAD.exec(clean);
  return m
    ? { type, date: m[1], who: m[2], html: md.renderInline(m[3] ?? ''), pics }
    : { type, date: '', who: '', html: md.renderInline(clean), pics };
}

/** The end of the block that opens at `i` (a list, a table, a blockquote …): the index of its closing token. */
function blockEnd(tokens: Token[], i: number): number {
  const t = tokens[i];
  if (t.nesting !== 1) return i;
  const close = t.type.replace(/_open$/, '_close');
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    if (tokens[j].type === t.type) depth++;
    else if (tokens[j].type === close && --depth === 0) return j;
  }
  return tokens.length - 1;
}

/** Is the list that opens at `i` a list of checklist items (its first item starts with a box)? */
function isChecklist(tokens: Token[], i: number): boolean {
  if (tokens[i]?.type !== 'bullet_list_open' && tokens[i]?.type !== 'ordered_list_open') return false;
  const inl = tokens.slice(i, i + 5).find(t => t.type === 'inline');
  return !!inl && BOX.test(inl.content);
}

export function wholeOutline(text: string, stepLabels: string[]): Outline {
  const tokens = md.parse(text, {});
  const slugs = headingSlugs(tokens);
  const items = new Map(wholeItems(text, stepLabels).map(it => [it.line, it]));
  const out: Outline = { title: '', parts: [], pictureMax: maxPictureNumber(text) };
  let part: Part | undefined;
  let head: HeadingRow | undefined;
  let block: BlockRow | undefined;
  let after = false; // something other than pills and the intro already sits under the current heading
  let h = 0;

  const newPart = (id: string, line: number, num: string, title: string, done: boolean): Part => {
    part = { id, line, num, title, done, intro: [], rows: [], table: false };
    out.parts.push(part);
    head = undefined; block = undefined; after = false;
    return part;
  };
  const push = (row: Row) => { (part ?? newPart('', 0, '', '', false)).rows.push(row); };
  const prose = (html: string, outro: boolean) => {
    if (!head && part) part.intro.push(html); else push({ k: 'p', html, outro });
    after = true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.level !== 0) continue;
    if (t.type === 'heading_open') {
      const level = Number(t.tag.slice(1));
      const inline = tokens[i + 1];
      const id = slugs[h++] ?? '';
      const s = splitHeading(inline.content);
      const line = t.map?.[0] ?? 0;
      if (level === 1 && !out.title) out.title = inlinePlain(inline).replace(/^~~|~~$/g, '').trim();
      else if (level <= 2) newPart(id, line, s.num, s.title, s.done);
      else {
        head = { k: 'h', id, level, line, num: s.num, title: s.title, done: s.done, pills: s.pills, intro: '' };
        push(head); block = undefined; after = false;
      }
      i += 2;
      continue;
    }
    if (t.type === 'paragraph_open') {
      const inline = tokens[i + 1];
      const content = inline.content.trim();
      const close = i + 2;
      if (head && !after && ONLY_PILLS.test(content)) { head.pills += (head.pills ? ' ' : '') + content; i = close; continue; }
      if (head && !after && !head.intro && ITALIC.test(content)) { head.intro = md.renderInline(content); i = close; continue; }
      const label = blockLabel(inline);
      if (label !== undefined && isChecklist(tokens, close + 1)) {
        const m = LABEL_NUM.exec(label);
        block = { k: 'b', num: m ? m[1] : '', label: m ? m[2].trim() : label, kind: 'check' };
        push(block); after = true; i = close;
        continue;
      }
      prose(render(tokens, i, close + 1), ITALIC.test(content));
      i = close;
      continue;
    }
    if (isChecklist(tokens, i)) {
      const end = blockEnd(tokens, i);
      let first = true;
      for (let k = i + 1; k < end; k++) {
        const li = tokens[k];
        if (li.type !== 'list_item_open' || li.level !== 1) continue;
        const liEnd = blockEnd(tokens, k);
        const inl = tokens.slice(k, liEnd).find(x => x.type === 'inline');
        const it = li.map ? items.get(li.map[0]) : undefined;
        const raw = inl?.content ?? '';
        if (!it || !BOX.test(raw)) { push({ k: 'p', html: render(tokens, k, liEnd + 1).replace(/^<li>|<\/li>\s*$/g, ''), outro: false }); k = liEnd; continue; }
        let rest = raw.replace(BOX, '');
        const nm = NUM.exec(rest);
        if (nm) rest = rest.slice(nm[0].length);
        const notes: NoteView[] = [];
        const subs: string[] = [];
        for (let q = k + 1; q < liEnd; q++) {
          if (tokens[q].type !== 'list_item_open' || tokens[q].level !== 3) continue;
          const qEnd = blockEnd(tokens, q);
          const c = (tokens.slice(q, qEnd).find(x => x.type === 'inline')?.content ?? '').trim();
          if (/^(?:~~)?(?:❌|📝)/.test(c)) notes.push(noteOf(c));
          else subs.push(render(tokens, q, qEnd + 1));
          q = qEnd;
        }
        if (first && block) block.kind = it.kind;
        first = false;
        push({ k: 'i', line: it.line, num: nm ? nm[1] : '', html: md.renderInline(rest) + (subs.length ? `<ul class="sub">${subs.join('')}</ul>` : ''),
          kind: it.kind, state: it.state, notes });
        k = liEnd;
      }
      if (part) part.table = true;
      after = true; i = end;
      continue;
    }
    if (t.type === 'html_block' && /^<nav\b[^>]*doc-toc/.test(t.content.trim())) continue; // the book's own menu: the panel draws its own
    if (t.type === 'hr') continue;
    const end = blockEnd(tokens, i);
    prose(render(tokens, i, end + 1), false);
    i = end;
  }
  if (!out.title && out.parts[0]) out.title = out.parts[0].title.replace(/<[^>]+>/g, '');
  return out;
}


// ── applyAnswer and markDone as they were ────────────────────────────────────────────────────────────────────────────
const BOX_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/;
const REASON_LINE = /^(\s*[-*+]\s+)(❌.*)$/;
const DONE_PILL = '<span class="pill success">Done</span>';
const plainMd = new MarkdownIt({ html: true });

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');

function lastContentLine(lines: string[], start: number, end: number): number {
  let last = start;
  for (let i = start; i < Math.min(end, lines.length); i++) if (lines[i].trim()) last = i;
  return last;
}

function strikeReasons(lines: string[], start: number, end: number): void {
  for (let i = start + 1; i < Math.min(end, lines.length); i++) {
    const m = REASON_LINE.exec(lines[i]);
    if (m) lines[i] = `${m[1]}~~${m[2].trimEnd()}~~`;
  }
}

/** The lines of a reason or a note under an item: its first line, more text, then one picture per line. */
function addedLines(indent: string, head: string, a: Answer): string[] {
  const [first, ...rest] = (a.reason ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const pictures = (a.images ?? []).map(p => `${indent}  ![${p.label}](${p.path.replace(/ /g, '%20')})`);
  return [`${indent}- ${head} · ${a.date} · ${a.who}${first ? ` — ${first}` : ''}`, ...rest.map(r => `${indent}  ${r}`), ...pictures];
}

/** applyAnswer as it was, given the whole text's items (read once per text: the same list it read on every call). */
export function wholeApplyAnswer(text: string, a: Answer, items: Item[]): string {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const item = items.find(it => it.line === a.line);
  const m = BOX_LINE.exec(lines[a.line] ?? '');
  if (!item || !m) throw new Error('This checklist changed while you were answering; it has been reloaded.');
  const setBox = (on: boolean) => { lines[a.line] = lines[a.line].replace(BOX_LINE, `$1[${on ? 'x' : ' '}]`); };

  switch (a.action) {
    case 'tick': setBox(true); break;
    case 'untick': setBox(false); break;
    case 'yes': setBox(true); strikeReasons(lines, item.line, item.end); break;
    case 'clear': setBox(false); strikeReasons(lines, item.line, item.end); break;
    case 'no': {
      if (!(a.reason ?? '').trim()) throw new Error('Say why it does not work.');
      setBox(false);
      strikeReasons(lines, item.line, item.end);
      lines.splice(lastContentLine(lines, item.line, item.end) + 1, 0, ...addedLines(' '.repeat(m[1].length), '❌ **No**', a));
      break;
    }
    case 'note': {
      if (!(a.reason ?? '').trim() && !a.images?.length) throw new Error('Write a note or paste a picture first.');
      lines.splice(lastContentLine(lines, item.line, item.end) + 1, 0, ...addedLines(' '.repeat(m[1].length), '📝 **Note**', a));
      break;
    }
  }
  return lines.join(eol);
}

/** Strike a heading through, add the Done pill, and re-point every link to it in the same file. */
export function wholeMarkDone(text: string, headingLine: number): string {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const m = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[headingLine] ?? '');
  if (!m) throw new Error('That heading moved; the checklist has been reloaded.');
  if (/^~~/.test(m[2])) return text;
  const before = headingSlugs(plainMd.parse(text, {}));
  const index = plainMd.parse(text, {}).filter(t => t.type === 'heading_open' && t.map).findIndex(t => t.map![0] === headingLine);
  lines[headingLine] = `${m[1]} ~~${m[2].replace(/\s+—\s+done$/i, '')}~~ ${DONE_PILL}`;
  let out = lines.join(eol);
  const after = headingSlugs(plainMd.parse(out, {}));
  const oldSlug = before[index], newSlug = after[index];
  if (index >= 0 && oldSlug && newSlug && oldSlug !== newSlug) {
    const esc = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(["(])#${esc}(?=["')])`, 'g'), `$1#${newSlug}`);
  }
  // A menu entry linking to it gets the Done pill (and loses any other pill).
  if (newSlug) {
    const esc = newSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(<a [^>]*href="#${esc}"[^>]*>)(.*?)</a>`, 'g'), (all, open: string, inner: string) =>
      inner.includes('pill success') ? all : `${open}${inner.replace(/\s*<span class="pill[^"]*">[^<]*<\/span>/g, '')} ${DONE_PILL}</a>`);
  }
  return out;
}
