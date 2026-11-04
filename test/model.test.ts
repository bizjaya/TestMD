import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer, doneable, markDone, readChecklist, stats } from '../src/core/model';
import { createRenderer } from '../src/core/markdown';

const LABELS = ['Do', 'Steps'];
const DOC = [
  '<nav class="doc-toc">',
  '<a class="l2" href="#11-sign-in">1.1 · Sign in</a>',
  '</nav>',
  '',
  '### 1.1 Sign in',
  '',
  '**1.1.1 · Do**',
  '- [ ] **1.1.1.1** Open the page.',
  '- [x] **1.1.1.2** Press **Sign in**.',
  '',
  '**1.1.2 · Pass when**',
  '- [ ] **1.1.2.1** <mark>The dashboard opens.</mark>',
  '- [ ] **1.1.2.2** <mark>Your name shows.</mark>',
  '',
  'See [1.1](#11-sign-in).',
  '',
].join('\n');

const who = 'Ann', date = '2026-11-04';
const answer = (text: string, line: number, action: 'yes' | 'no' | 'clear' | 'tick' | 'untick', reason?: string) =>
  applyAnswer(text, { line, action, reason, who, date }, LABELS);

test('steps and checks are told apart by their block label', () => {
  const list = readChecklist(DOC, LABELS);
  assert.deepEqual(list.items.map(i => [i.line, i.kind, i.state]), [
    [7, 'step', 'none'], [8, 'step', 'yes'], [11, 'check', 'none'], [12, 'check', 'none'],
  ]);
  assert.deepEqual(stats(list), { yes: 0, no: 0, open: 2, steps: 2, ticked: 1 });
});

test('a No leaves the box empty and writes the reason under the check', () => {
  const out = answer(DOC, 11, 'no', 'It showed an error.\nCode 500.');
  const lines = out.split('\n');
  assert.equal(lines[11], '- [ ] **1.1.2.1** <mark>The dashboard opens.</mark>');
  assert.equal(lines[12], '  - ❌ **No** · 2026-11-04 · Ann — It showed an error.');
  assert.equal(lines[13], '    Code 500.');
  assert.equal(readChecklist(out, LABELS).items.find(i => i.line === 11)?.state, 'no');
});

test('Yes after No ticks the box and strikes the old reason', () => {
  const no = answer(DOC, 11, 'no', 'Broken.');
  const yes = answer(no, 11, 'yes');
  const lines = yes.split('\n');
  assert.equal(lines[11], '- [x] **1.1.2.1** <mark>The dashboard opens.</mark>');
  assert.equal(lines[12], '  - ~~❌ **No** · 2026-11-04 · Ann — Broken.~~');
  assert.equal(readChecklist(yes, LABELS).items.find(i => i.line === 11)?.state, 'yes');
});

test('a second No strikes the first and adds the new one below it', () => {
  const out = answer(answer(DOC, 12, 'no', 'First.'), 12, 'no', 'Second.');
  const lines = out.split('\n');
  assert.equal(lines[13], '  - ~~❌ **No** · 2026-11-04 · Ann — First.~~');
  assert.equal(lines[14], '  - ❌ **No** · 2026-11-04 · Ann — Second.');
});

test('a No needs a reason; a stale line is refused', () => {
  assert.throws(() => answer(DOC, 11, 'no', '  '), /why/);
  assert.throws(() => answer(DOC, 4, 'yes'), /changed/);
});

test('CRLF files keep CRLF', () => {
  const crlf = DOC.replace(/\n/g, '\r\n');
  const out = answer(crlf, 7, 'tick');
  assert.ok(out.includes('- [x] **1.1.1.1** Open the page.\r\n'));
  assert.ok(!/[^\r]\n/.test(out));
});

test('Mark test done strikes the heading, adds the pill and re-points links', () => {
  let text = answer(DOC, 7, 'tick');
  text = answer(text, 11, 'yes');
  assert.deepEqual(doneable(readChecklist(text, LABELS)), []);
  text = answer(text, 12, 'yes');
  assert.deepEqual(doneable(readChecklist(text, LABELS)), [4]);
  const out = markDone(text, 4);
  assert.match(out, /^### ~~1\.1 Sign in~~ <span class="pill success">Done<\/span>$/m);
  assert.match(out, /<a class="l2" href="#11-sign-in-done">1\.1 · Sign in <span class="pill success">Done<\/span><\/a>/);
  assert.match(out, /See \[1\.1\]\(#11-sign-in-done\)\./);
  assert.deepEqual(doneable(readChecklist(out, LABELS)), []);
});

test('the panel renders controls; the preview renders badges', () => {
  const panel = createRenderer({ interactive: true, stepLabels: LABELS }).render(DOC);
  assert.match(panel, /data-td-act="yes" data-td-line="11"/);
  assert.match(panel, /data-td-act="untick" data-td-line="8"/);
  assert.match(panel, /<h3 id="11-sign-in" data-td-hline="4">/);
  assert.ok(!panel.includes('[ ]'));
  const preview = createRenderer({ interactive: false, stepLabels: LABELS }).render(answer(DOC, 12, 'no', 'Nope.'));
  assert.match(preview, /td-badge td-no"[^>]*>No</);
  assert.match(preview, /class="td-reason"/);
  assert.ok(!preview.includes('<button'));
});

test('a label that starts in bold counts; extra words after it do not hide it', () => {
  const doc = ['**2.1 · Do**', '- [ ] **2.1.1** Send it.', '', '**2.2 · Pass when** *(after sending)*', '- [ ] **2.2.1** It arrives.', ''].join('\n');
  assert.deepEqual(readChecklist(doc, LABELS).items.map(i => i.kind), ['step', 'check']);
});

test('two copies of the plugin draw each item once', async () => {
  const MarkdownIt = (await import('markdown-it')).default;
  const { checklistPlugin } = await import('../src/core/markdown');
  const md = new MarkdownIt({ html: true });
  checklistPlugin(md, { interactive: false, stepLabels: LABELS });
  checklistPlugin(md, { interactive: false, stepLabels: LABELS }); // the same engine twice
  md.core.ruler.push('older_copy', (md.core.ruler.getRules('').at(-1))!); // another copy under another name
  const html = md.render(DOC);
  assert.equal((html.match(/td-badge/g) ?? []).length, 4);
});

test('a note and a No carry pictures as lines under the item; a new round clears them', async () => {
  const { clearRound, archiveFolderName } = await import('../src/core/model');
  const pic = 'checklist.assets/3f2a.webp';
  let text = answer(DOC, 7, 'tick');
  text = applyAnswer(text, { line: 7, action: 'note', reason: 'Proof below.', images: [pic], who, date }, LABELS);
  text = applyAnswer(text, { line: 13, action: 'no', reason: 'No name shown.', images: ['checklist.assets/my shot.webp'], who, date }, LABELS);
  const lines = text.split('\n');
  assert.equal(lines[8], '  - 📝 **Note** · 2026-11-04 · Ann — Proof below.');
  assert.equal(lines[9], `    ![](${pic})`);
  assert.ok(lines.includes('  - ❌ **No** · 2026-11-04 · Ann — No name shown.'));
  assert.ok(lines.includes('    ![](checklist.assets/my%20shot.webp)'));
  assert.throws(() => applyAnswer(text, { line: 7, action: 'note', reason: ' ', images: [], who, date }, LABELS), /note or paste/);

  const html = createRenderer({ interactive: true, stepLabels: LABELS }).render(text);
  assert.match(html, /<li class="td-note">/);
  assert.match(html, /<img src="checklist.assets\/3f2a.webp"/);
  assert.match(html, /data-td-act="note" data-td-line="16"/);

  const fresh = clearRound(text, LABELS);
  assert.equal(fresh, DOC.replace('- [x] **1.1.1.2**', '- [ ] **1.1.1.2**'));
  assert.equal(archiveFolderName('ACT.E2ETEST', '2026-11-05', n => n === 'ACT.E2ETEST-2026-11-05'), 'ACT.E2ETEST-2026-11-05-2');
});
