import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutline, HeadingRow, ItemRow, BlockRow } from '../src/core/outline';

const LABELS = ['Do', 'Steps'];
const DOC = [
  '# The book',
  '',
  '## Part 1 · Signing in',
  '',
  'What this part covers.',
  '',
  '### ~~1.1 Open the site~~ <span class="pill success">Done</span>',
  '',
  '### 1.2 Sign in',
  '<span class="pill info">Operator</span> <span class="pill muted">live</span>',
  '',
  '*Checks that you can sign in.*',
  '',
  '**1.2.1 · Do**',
  '- [x] **1.2.1.1** Open the page.',
  '- [ ] **1.2.1.2** Press **Sign in**.',
  '',
  '**1.2.2 · Pass when**',
  '- [ ] **1.2.2.1** <mark>The dashboard opens.</mark>',
  '  - ❌ **No** · 2026-11-05 · Ann — It showed an error, see img1.',
  '    ![img1](book.assets/a.webp)',
  '  - ~~❌ **No** · 2026-11-04 · Ann — Blank page.~~',
  '- [ ] **1.2.2.2** Your name shows.',
  '  - 📝 **Note** · 2026-11-05 · Ann — Slow, about 6 s.',
  '',
  '*If not: say what you saw.*',
  '',
  '## Known gaps',
  '',
  'Nothing yet.',
  '',
].join('\n');

test('a part per ##, rows for headings, blocks, items and prose', () => {
  const o = buildOutline(DOC, LABELS);
  assert.equal(o.title, 'The book');
  assert.equal(o.parts.length, 2);
  const [p1, p2] = o.parts;
  assert.equal(p1.num, '1');
  assert.equal(p1.title, 'Signing in');
  assert.equal(p1.table, true);
  assert.deepEqual(p1.intro.length, 1);
  assert.equal(p2.table, false);
  assert.deepEqual(p1.rows.map(r => r.k).join(''), 'hhbiibiip');
});

test('headings carry number, done, pills, intro and their line', () => {
  const [p1] = buildOutline(DOC, LABELS).parts;
  const [h1, h2] = p1.rows.filter((r): r is HeadingRow => r.k === 'h');
  assert.equal(h1.num, '1.1');
  assert.equal(h1.done, true);
  assert.equal(h1.id, '11-open-the-site-done');
  assert.equal(h2.num, '1.2');
  assert.equal(h2.line, 8);
  assert.match(h2.pills, /Operator/);
  assert.match(h2.intro, /Checks that you can sign in/);
});

test('items carry kind, state, line and their notes with pictures', () => {
  const [p1] = buildOutline(DOC, LABELS).parts;
  const blocks = p1.rows.filter((r): r is BlockRow => r.k === 'b');
  assert.deepEqual(blocks.map(b => [b.num, b.label, b.kind]), [['1.2.1', 'Do', 'step'], ['1.2.2', 'Pass when', 'check']]);
  const its = p1.rows.filter((r): r is ItemRow => r.k === 'i');
  assert.deepEqual(its.map(i => [i.num, i.kind, i.state, i.line]), [
    ['1.2.1.1', 'step', 'yes', 14], ['1.2.1.2', 'step', 'none', 15], ['1.2.2.1', 'check', 'no', 18], ['1.2.2.2', 'check', 'none', 22],
  ]);
  const no = its[2].notes;
  assert.deepEqual(no.map(n => n.type), ['no', 'old']);
  assert.equal(no[0].who, 'Ann');
  assert.deepEqual(no[0].pics, [{ label: 'img1', path: 'book.assets/a.webp' }]);
  assert.equal(its[3].notes[0].type, 'note');
});
