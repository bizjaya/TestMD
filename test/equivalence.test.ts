// The checklist is read a piece at a time and the pieces are kept between calls. These tests check that this gives
// exactly what reading the whole text at once gave (test/reference/whole.ts keeps that code): the same outline, key for
// key, on first read and after edits, and the same text after an answer or Mark test done.
//
// Besides the files here, set TESTMD_EXTRA_DOCS to folders or .md files (separated as in PATH) to check real
// checklists too; they are read only when they exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { OutlineBuilder } from '../src/core/outline';
import { applyAnswer, markDone } from '../src/core/model';
import { knownChunkAt } from '../src/core/chunks';
import type { Action } from '../src/core/model';
import { wholeApplyAnswer, wholeItems, wholeMarkDone, wholeOutline } from './reference/whole';

const LABEL_SETS = [['Do', 'Steps'], ['Do', 'Steps', 'Then']];

function mdFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return path.endsWith('.md') ? [path] : [];
  return readdirSync(path).filter(f => f.endsWith('.md')).map(f => join(path, f));
}

const extra = (process.env.TESTMD_EXTRA_DOCS ?? '').split(delimiter).filter(Boolean).flatMap(mdFiles);
const edge = readFileSync('test/fixtures/edge.md', 'utf8');
const DOCS: [string, string][] = [
  ...mdFiles('test/fixtures').map(f => [f, readFileSync(f, 'utf8')] as [string, string]),
  ['templates/checklist.md', readFileSync('templates/checklist.md', 'utf8')],
  ['edge.md with CRLF', edge.replace(/\n/g, '\r\n')],
  ['edge.md without its last line break', edge.replace(/\n$/, '')],
  ['a lone carriage return', '# Book\r## Part 1 · A\n\n- [ ] **1.1** One.\r- [ ] **1.2** Two.\n## Part 2 · B\n\n- [x] **2.1** Three.\n'],
  ['no headings at all', 'Just words.\n\n- [ ] One.\n- [x] Two.\n'],
  ['empty', ''],
  ...extra.map(f => [f, readFileSync(f, 'utf8')] as [string, string]),
];

const same = (actual: unknown, expected: unknown, what: string) => {
  assert.deepStrictEqual(actual, expected, what);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${what}: same keys in the same order`);
};

/** Edits another tool or a person makes to a checklist, each giving a new text from the old one. */
function edits(text: string, labels: string[]): [string, string][] {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const mid = Math.floor(lines.length / 2);
  const items = wholeItems(text, labels);
  const item = items[Math.floor(items.length / 2)];
  const at = (i: number, ...add: string[]) => { const l = [...lines]; l.splice(i, 0, ...add); return l.join(eol); };
  const out: [string, string][] = [
    ['one line\'s words', lines.map((l, i) => (i === mid ? `${l} (edited)` : l)).join(eol)],
    ['a line removed', lines.filter((_, i) => i !== mid).join(eol)],
    ['a part added at the end', [...lines, '', '## Part 99 · Added', '', '- [ ] **99.1** New.', ''].join(eol)],
    ['a part added in the middle', at(mid, '', '## Part 98 · Added in the middle', '', '- [ ] **98.1** New.', '')],
    ['a fence with headings in it added', at(mid, '', '```', '## not a part', '# nor this', '```', '')],
    ['a title added at the top', at(0, '# A new title', '')],
  ];
  if (item) {
    out.push(['an item added', at(item.end, '- [ ] An item another tool added.')]);
    try {
      out.push(['an item answered No', wholeApplyAnswer(text, { action: 'no', line: item.line, reason: 'Broken.', who: 'Ann', date: '2026-11-16' }, items)]);
    } catch { /* a text whose lines markdown-it counts differently (a lone carriage return) refuses it: no edit */ }
  }
  const head = lines.findIndex((l, i) => i > mid && /^#{3,6}\s+(?!~~)/.test(l));
  if (head >= 0) out.push(['a heading marked done', wholeMarkDone(text, head)]);
  return out;
}

for (const [name, text] of DOCS) {
  test(`outline of ${name}: the same as reading it whole`, () => {
    for (const labels of LABEL_SETS) same(new OutlineBuilder().build(text, labels), wholeOutline(text, labels), `${name} ${labels}`);
  });

  test(`outline of ${name} after edits: the kept pieces give the same as reading it whole`, () => {
    for (const labels of LABEL_SETS) {
      const builder = new OutlineBuilder();
      builder.build(text, labels);
      for (const [what, changed] of edits(text, labels)) {
        same(builder.build(changed, labels), wholeOutline(changed, labels), `${name}: ${what}`);
        same(builder.build(text, labels), wholeOutline(text, labels), `${name}: back from ${what}`);
      }
    }
  });

  test(`answers in ${name}: the same text as before`, () => {
    const labels = LABEL_SETS[0];
    new OutlineBuilder().build(text, labels); // the panel draws the checklist before anything is answered
    const items = wholeItems(text, labels);
    const run = (f: () => string) => { try { return f(); } catch (e) { return `throws: ${(e as Error).message}`; } };
    const who = 'Ann', date = '2026-11-16';
    let checked = 0;
    for (let i = 0; i < items.length; i += 7) {
      const it = items[i];
      const actions: Action[] = it.kind === 'step' ? ['tick', 'untick', 'note'] : ['yes', 'no', 'clear', 'note'];
      for (const action of actions) {
        const a = { action, line: it.line, reason: 'It showed an error.\nCode 500.', images: action === 'note' ? [{ label: 'img7', path: 'b.assets/my shot.webp' }] : [], who, date };
        assert.equal(run(() => applyAnswer(text, a, labels)), run(() => wholeApplyAnswer(text, a, items)), `${name}: ${action} on line ${it.line}`);
        checked++;
      }
    }
    // Lines that are not items are refused the same way.
    const lineCount = text.split(/\r?\n/).length;
    for (let line = 0; line < lineCount; line += 41) {
      if (items.some(it => it.line === line)) continue;
      const a = { action: 'yes' as Action, line, who, date };
      assert.equal(run(() => applyAnswer(text, a, labels)), run(() => wholeApplyAnswer(text, a, items)), `${name}: yes on line ${line}`);
    }
    // A text the outline never read is read whole, with the same result.
    const unseen = `${text}\n`;
    const unseenItems = wholeItems(unseen, labels);
    for (const it of unseenItems.slice(0, 3)) {
      const a = { action: 'yes' as Action, line: it.line, who, date };
      assert.equal(run(() => applyAnswer(unseen, a, labels)), run(() => wholeApplyAnswer(unseen, a, unseenItems)), `${name}: unseen text`);
    }
    assert.ok(checked > 0 || items.length === 0);
  });

  test(`Mark test done in ${name}: the same text as before`, () => {
    const lines = text.split(/\r?\n/);
    const heads = lines.map((l, i) => (/^#{1,6}\s/.test(l) ? i : -1)).filter(i => i >= 0);
    const step = Math.max(1, Math.ceil(heads.length / 12));
    const run = (f: () => string) => { try { return f(); } catch (e) { return `throws: ${(e as Error).message}`; } };
    for (let k = 0; k < heads.length; k += step) {
      assert.equal(run(() => markDone(text, heads[k])), run(() => wholeMarkDone(text, heads[k])), `${name}: line ${heads[k]}`);
    }
    if (lines.length > 3) assert.equal(run(() => markDone(text, 2)), run(() => wholeMarkDone(text, 2)), `${name}: not a heading`);
  });
}

test('the cuts are checked: a heading inside an HTML block, a comment, a fence or a table head is not a cut', () => {
  const lines = edge.split('\n');
  new OutlineBuilder().build(edge, LABEL_SETS[0]);
  const startOf = (needle: string) => knownChunkAt(edge, lines.findIndex(l => l.startsWith(needle)), lines.length)!.start;
  const lineOf = (needle: string) => lines.findIndex(l => l.startsWith(needle));
  assert.equal(startOf('## Part 3 · After the HTML block'), lineOf('## Part 3 · After the HTML block'));
  assert.equal(startOf('## Part 6 · Last'), lineOf('## Part 6 · Last'));
  assert.notEqual(startOf('## inside an HTML block'), lineOf('## inside an HTML block'));
  assert.notEqual(startOf('## still inside the comment'), lineOf('## still inside the comment'));
  assert.notEqual(startOf('## Part 4 | Table head'), lineOf('## Part 4 | Table head'));
  assert.notEqual(startOf('## still inside: the closing fence is shorter'), lineOf('## still inside: the closing fence is shorter'));
  assert.equal(startOf('# The edge book'), 0, 'the title, and the empty "#" before it, stay with the words before them');
  assert.equal(startOf('# A second H1 is a part'), lineOf('# A second H1 is a part'), 'a "#" after the title starts a part');
});
