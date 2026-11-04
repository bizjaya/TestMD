// The checklist read from a .md, and every change TestMD makes to it. Pure functions on text: no VS Code here.
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { createRenderer, ItemKind, ItemState } from './markdown';
import { headingSlugs } from './slug';

export interface Item { line: number; end: number; kind: ItemKind; state: ItemState; }
export interface Section { line: number; level: number; title: string; done: boolean; items: Item[]; }
export interface Checklist { items: Item[]; sections: Section[]; }

export type Action = 'yes' | 'no' | 'clear' | 'tick' | 'untick';
export interface Answer { action: Action; line: number; reason?: string; who: string; date: string; }

const BOX_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/;
const REASON_LINE = /^(\s*[-*+]\s+)(❌.*)$/;
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
      const reason = (a.reason ?? '').trim();
      if (!reason) throw new Error('Say why it does not work.');
      setBox(false);
      strikeReasons(lines, item.line, item.end);
      const indent = ' '.repeat(m[1].length);
      const [first, ...rest] = reason.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const add = [`${indent}- ❌ **No** · ${a.date} · ${a.who} — ${first}`, ...rest.map(r => `${indent}  ${r}`)];
      lines.splice(lastContentLine(lines, item.line, item.end) + 1, 0, ...add);
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
