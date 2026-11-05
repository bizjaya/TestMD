// The checklist read from a .md, and every change TestMD makes to it. Pure functions on text: no VS Code here.
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { createRenderer, ItemKind, ItemState } from './markdown';
import { headingSlugs } from './slug';

export interface Item { line: number; end: number; kind: ItemKind; state: ItemState; }
export interface Section { line: number; level: number; title: string; done: boolean; items: Item[]; }
export interface Checklist { items: Item[]; sections: Section[]; }

export type Action = 'yes' | 'no' | 'clear' | 'tick' | 'untick' | 'note';
/** A picture under an item: its label (`img3`) and its path relative to the .md. */
export interface Picture { label: string; path: string; }
/** One answer. `reason` is the No's reason or the note's text. */
export interface Answer { action: Action; line: number; reason?: string; images?: Picture[]; who: string; date: string; }

const BOX_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/;
const REASON_LINE = /^(\s*[-*+]\s+)(❌.*)$/;
/** A reason (❌) or a note (📝) under an item, struck or not: the lines a new round clears. */
const ADDED_LINE = /^(\s*)[-*+]\s+(?:~~)?(?:❌|📝)/;
const DONE_PILL = '<span class="pill success">Done</span>';
const plainMd = new MarkdownIt({ html: true });

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');

function attr(t: Token, name: string): string | null { return t.attrGet(name); }

/** Read the checklist: its items (with kind and state) and the headings that hold them. */
export function readChecklist(text: string, stepLabels: string[]): Checklist {
  const md = createRenderer({ interactive: true, stepLabels });
  const tokens = md.parse(text, {});
  const items: Item[] = [];
  const sections: Section[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open' && t.map) {
      const title = tokens[i + 1]?.content ?? '';
      sections.push({ line: t.map[0], level: Number(t.tag.slice(1)), title, done: /^~~.*~~/.test(title.trim()), items: [] });
    }
    if (t.type === 'list_item_open' && attr(t, 'data-td-line') !== null && t.map) {
      const cls = (attr(t, 'class') ?? '').split(/\s+/);
      const kind: ItemKind = cls.includes('td-step') ? 'step' : 'check';
      const state: ItemState = cls.includes('td-yes') ? 'yes' : cls.includes('td-no') ? 'no' : 'none';
      const item = { line: t.map[0], end: t.map[1], kind, state };
      items.push(item);
      sections[sections.length - 1]?.items.push(item);
    }
  }
  return { items, sections };
}

/** A heading can be marked done when it, and every heading under it, holds only answered items, and at least one. */
export function doneable(list: Checklist): number[] {
  const out: number[] = [];
  list.sections.forEach((s, i) => {
    if (s.done) return;
    const all: Item[] = [...s.items];
    for (let j = i + 1; j < list.sections.length && list.sections[j].level > s.level; j++) all.push(...list.sections[j].items);
    if (all.length && all.every(it => it.state === 'yes')) out.push(s.line);
  });
  return out;
}

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

/** Apply one answer. Throws when the line is no longer a checklist item (the file changed under the panel). */
export function applyAnswer(text: string, a: Answer, stepLabels: string[]): string {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const item = readChecklist(text, stepLabels).items.find(it => it.line === a.line);
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
export function markDone(text: string, headingLine: number): string {
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

export interface Stats { yes: number; no: number; open: number; steps: number; ticked: number; }

export function stats(list: Checklist): Stats {
  const s: Stats = { yes: 0, no: 0, open: 0, steps: 0, ticked: 0 };
  for (const it of list.items) {
    if (it.kind === 'step') { s.steps++; if (it.state === 'yes') s.ticked++; continue; }
    if (it.state === 'yes') s.yes++; else if (it.state === 'no') s.no++; else s.open++;
  }
  return s;
}

/** A new round: every box empty, every reason and note (with its pictures) gone. Headings marked done stay. */
export function clearRound(text: string, stepLabels: string[]): string {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const drop = new Set<number>();
  for (const it of readChecklist(text, stepLabels).items) {
    lines[it.line] = lines[it.line].replace(BOX_LINE, '$1[ ]');
    for (let i = it.line + 1; i < Math.min(it.end, lines.length); i++) {
      const m = ADDED_LINE.exec(lines[i]);
      if (!m) continue;
      drop.add(i);
      const indent = m[1].length;
      for (let j = i + 1; j < lines.length && lines[j].trim() && lines[j].search(/\S/) > indent; j++) drop.add(j);
    }
  }
  return lines.filter((_, i) => !drop.has(i)).join(eol);
}

/** The folder a finished round is archived to: <doc>-<date>, then -2, -3 … if that name is taken. */
export function archiveFolderName(docBase: string, date: string, taken: (name: string) => boolean): string {
  const base = `${docBase}-${date}`;
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
}

// ── Pictures: img1, img2 … across the whole checklist ────────────────────────────────────────────────────────────────
const PICTURE = /!\[img(\d+)\]\(([^)\s]+)\)/g;
const PICTURE_LINE = /^\s*!\[img(\d+)\]\(([^)\s]+)\)\s*$/;
export const DELETED_MENTION = '*(picture deleted)*';
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** The highest picture number in the checklist (0 when it has none): the next picture is this + 1. */
export function maxPictureNumber(text: string): number {
  let max = 0;
  for (const m of text.matchAll(PICTURE)) max = Math.max(max, Number(m[1]));
  return max;
}

/** The lines of every reason and note: the marker line and its deeper-indented lines below it. */
function addedBlockLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const m = ADDED_LINE.exec(lines[i]);
    if (!m) continue;
    out.add(i);
    for (let j = i + 1; j < lines.length && lines[j].trim() && lines[j].search(/\S/) > m[1].length; j++) out.add(j);
  }
  return out;
}

/**
 * Close the gaps: the pictures keep their order and become img1 … imgN again. Every "imgN" word in a reason or a note
 * follows its picture; a word naming a deleted picture becomes "*(picture deleted)*".
 */
export function renumberPictures(text: string, deleted: number[] = []): string {
  const numbers = [...new Set([...text.matchAll(PICTURE)].map(m => Number(m[1])))].sort((a, b) => a - b);
  const map = new Map(numbers.map((n, i) => [n, i + 1]));
  if (!deleted.length && numbers.every((n, i) => n === i + 1)) return text;
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  for (const i of addedBlockLines(lines)) {
    lines[i] = lines[i].replace(/\bimg(\d+)\b/g, (word, d: string) => {
      const n = Number(d);
      if (map.has(n)) return `img${map.get(n)}`;
      return deleted.includes(n) ? DELETED_MENTION : word;
    });
  }
  return lines.join(eol);
}

/** Take one picture out of its note or reason (a note left with no text and no picture goes too), then renumber. */
export function removePicture(text: string, path: string): { text: string; label?: string } {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex(l => { const m = PICTURE_LINE.exec(l); return !!m && safeDecode(m[2]) === path; });
  if (at < 0) return { text };
  const number = Number(PICTURE_LINE.exec(lines[at])![1]);
  lines.splice(at, 1);
  // The note it belonged to: the nearest note or reason line above it.
  for (let i = at - 1; i >= 0; i--) {
    const m = ADDED_LINE.exec(lines[i]);
    if (!m) continue;
    const rest = lines.slice(i + 1).findIndex(l => !l.trim() || l.search(/\S/) <= m[1].length);
    const block = lines.slice(i + 1, rest < 0 ? lines.length : i + 1 + rest);
    const emptyNote = /📝 \*\*Note\*\* · [^—]*$/.test(lines[i]) && !block.length;
    if (emptyNote) lines.splice(i, 1);
    break;
  }
  return { text: renumberPictures(lines.join(eol), [number]), label: `img${number}` };
}

/** The picture files (names in `folder`) that the checklist still links to. */
export function linkedPictureFiles(text: string, folder: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const path = safeDecode(m[1]);
    if (path.startsWith(`${folder}/`)) out.add(path.slice(folder.length + 1));
  }
  return out;
}
