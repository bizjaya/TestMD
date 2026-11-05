// The checklist as the panel draws it: one table per "##" part, a row per heading, block label, item and paragraph
// under it. Pure functions on text: no VS Code here.
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { BOX, blockLabel, ItemKind, ItemState } from './markdown';
import { maxPictureNumber, readChecklist } from './model';
import { headingSlugs, inlinePlain } from './slug';

export interface NoteView {
  /** no = the current reason for a No; old = a struck earlier reason; note = a 📝 note. */
  type: 'no' | 'old' | 'note';
  date: string;
  who: string;
  html: string;
  /** Pictures under it: label (img3) and path as written in the .md, relative to it. */
  pics: { label: string; path: string }[];
}
export interface HeadingRow { k: 'h'; id: string; level: number; line: number; num: string; title: string; done: boolean; pills: string; intro: string }
export interface BlockRow { k: 'b'; num: string; label: string; kind: ItemKind }
export interface ItemRow { k: 'i'; line: number; num: string; html: string; kind: ItemKind; state: ItemState; notes: NoteView[] }
export interface ProseRow { k: 'p'; html: string; outro: boolean }
export type Row = HeadingRow | BlockRow | ItemRow | ProseRow;
export interface Part {
  id: string; line: number; num: string; title: string; done: boolean;
  /** What sits between the part's heading and its first sub-heading. */
  intro: string[];
  rows: Row[];
  /** True when the part holds checklist items, and is drawn as a table. */
  table: boolean;
}
export interface Outline { title: string; parts: Part[]; pictureMax: number }

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

export function buildOutline(text: string, stepLabels: string[]): Outline {
  const tokens = md.parse(text, {});
  const slugs = headingSlugs(tokens);
  const items = new Map(readChecklist(text, stepLabels).items.map(it => [it.line, it]));
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
