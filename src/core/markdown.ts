// The checklist markdown-it plugin: finds "- [ ]" items, tells steps (a plain tick) from checks (Yes / No), reads each
// item's state from the .md, and draws its controls. The same plugin serves VS Code's own preview (read-only) and the
// TestMD panel (interactive).
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import { headingSlugs, inlinePlain } from './slug';

export type ItemKind = 'step' | 'check';
export type ItemState = 'none' | 'yes' | 'no';

export interface ChecklistOptions {
  interactive: boolean;
  stepLabels: string[];
}

export const BOX = /^\[( |x|X)\]\s+/;
export const REASON = /^❌/;
export const OLD_REASON = /^~~❌/;
export const NOTE = /^(?:~~)?📝/;

/** A short paragraph that starts in bold, or ends with a colon, is a block label: "**2.1 · Do**",
 *  "**2.1 · Pass when** *(after sending)*", "Steps:". The label is the bold part (or the whole line). */
function blockLabel(inline: Token): string | undefined {
  const src = inline.content.trim();
  if (src.length > 100) return undefined;
  const bold = /^(?:\*\*([^*]+)\*\*|__([^_]+)__)/.exec(src);
  if (bold) return (bold[1] ?? bold[2]).replace(/[:\s]+$/, '').trim();
  if (/:$/.test(src)) return inlinePlain(inline).replace(/[:\s]+$/, '').trim();
  return undefined;
}

function isStepLabel(label: string, stepLabels: string[]): boolean {
  const l = label.toLowerCase();
  return stepLabels.some(s => {
    const w = s.toLowerCase();
    return l === w || l.endsWith(' ' + w) || l.endsWith('·' + w) || l.endsWith('· ' + w);
  });
}

function closingIndex(tokens: Token[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i].type === 'list_item_open') depth++;
    else if (tokens[i].type === 'list_item_close' && --depth === 0) return i;
  }
  return tokens.length - 1;
}

function firstInline(tokens: Token[], from: number): number {
  // list_item_open, paragraph_open, inline
  return tokens[from + 1]?.type === 'paragraph_open' && tokens[from + 2]?.type === 'inline' ? from + 2 : -1;
}

function badge(kind: ItemKind, state: ItemState): string {
  const text = kind === 'step' ? (state === 'yes' ? '✓' : '&nbsp;') : state === 'yes' ? 'Yes' : state === 'no' ? 'No' : '?';
  return `<span class="td-badge td-${state}" title="Read-only here. To answer, press Run Checklist (the square with a tick) at the top right.">${text}</span>`;
}

const noteButton = (line: number) =>
  `<button class="td-notebtn" data-td-act="note" data-td-line="${line}" title="Add a note or a picture (paste with Ctrl+V)">Note</button>`;

function controls(kind: ItemKind, state: ItemState, line: number, interactive: boolean): string {
  if (!interactive) return badge(kind, state);
  if (kind === 'step') {
    const on = state === 'yes';
    return `<span class="td-ctl td-ctl-step"><button class="td-tick${on ? ' td-on' : ''}" data-td-act="${on ? 'untick' : 'tick'}" data-td-line="${line}" title="${on ? 'Done — click to undo' : 'Mark this step done'}">${on ? '✓' : ''}</button></span>`;
  }
  const yes = state === 'yes', no = state === 'no';
  return `<span class="td-ctl td-ctl-check">` +
    `<button class="td-yes${yes ? ' td-on' : ''}" data-td-act="${yes ? 'clear' : 'yes'}" data-td-line="${line}" title="${yes ? 'Yes — click to clear' : 'Yes, it works'}">Yes</button>` +
    `<button class="td-no${no ? ' td-on' : ''}" data-td-act="no" data-td-line="${line}" title="${no ? 'No — click to give a new reason' : 'No, and say why'}">No</button>` +
    `</span>`;
}

function checklistRule(opts: ChecklistOptions) {
  return (state: StateCore) => {
    const tokens = state.tokens;
    let mode: ItemKind = 'check';
    let listDepth = 0;
    const slugs = opts.interactive ? headingSlugs(tokens) : [];
    let h = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'heading_open') {
        mode = 'check';
        if (opts.interactive) {
          if (slugs[h]) t.attrSet('id', slugs[h]);
          if (t.map) t.attrSet('data-td-hline', String(t.map[0]));
        }
        h++;
        continue;
      }
      if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') { listDepth++; continue; }
      if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') { listDepth--; continue; }
      if (t.type === 'inline' && listDepth === 0 && tokens[i - 1]?.type === 'paragraph_open') {
        const label = blockLabel(t);
        if (label !== undefined) mode = isStepLabel(label, opts.stepLabels) ? 'step' : 'check';
        continue;
      }
      if (t.type !== 'list_item_open') continue;
      // Already drawn by another copy of this plugin (two versions loaded side by side until the editor restarts).
      if (/(?:^|\s)td-(?:item|reason|note)(?:\s|$)/.test(t.attrGet('class') ?? '')) continue;

      const inl = firstInline(tokens, i);
      if (inl < 0) continue;
      const inline = tokens[inl];
      const content = inline.content;
      if (REASON.test(content) || OLD_REASON.test(content)) {
        t.attrJoin('class', REASON.test(content) ? 'td-reason' : 'td-reason td-reason-old');
        continue;
      }
      if (NOTE.test(content)) { t.attrJoin('class', 'td-note'); continue; }
      const m = BOX.exec(content);
      if (!m || !t.map) continue;

      const close = closingIndex(tokens, i);
      let hasReason = false;
      for (let j = inl + 1; j < close; j++) {
        if (tokens[j].type === 'inline' && REASON.test(tokens[j].content)) { hasReason = true; break; }
      }
      const ticked = m[1] !== ' ';
      const kind: ItemKind = mode;
      const st: ItemState = ticked ? 'yes' : hasReason && kind === 'check' ? 'no' : 'none';
      const line = t.map[0];
      t.attrJoin('class', `td-item td-${kind} td-${st}`);
      t.attrSet('data-td-line', String(line));
      tokens[i - 1]?.type === 'bullet_list_open' && tokens[i - 1].attrJoin('class', 'td-list');

      // Drop the "[ ] " marker from the text, then put the controls in front.
      const first = inline.children?.[0];
      if (first && first.type === 'text') first.content = first.content.replace(BOX, '');
      const ctl = new state.Token('html_inline', '', 0);
      ctl.content = controls(kind, st, line, opts.interactive);
      inline.children?.unshift(ctl);
      if (opts.interactive) {
        const note = new state.Token('html_inline', '', 0);
        note.content = noteButton(line);
        inline.children?.push(note);
      }
    }
  };
}

export function checklistPlugin(md: MarkdownIt, opts: ChecklistOptions): void {
  if (md.core.ruler.getRules('').some(fn => (fn as { testmd?: boolean }).testmd)) return; // registered once per engine
  const rule = Object.assign(checklistRule(opts), { testmd: true });
  md.core.ruler.push('testmd_checklist', rule);
}

export function createRenderer(opts: ChecklistOptions): MarkdownIt {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  checklistPlugin(md, opts);
  return md;
}

