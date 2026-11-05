// TestMD panel: draws the checklist as one table per part, sends each answer to the extension (which writes it into
// the .md), and keeps your place, folds and open boxes across every redraw.
(() => {
'use strict';
const vscode = acquireVsCodeApi();
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; };
const MAX_SIDE = 1600;

const I = {
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>',
  x: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  do: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/></svg>',
  look: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  pass: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
  pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 4 4H6l4-4-1-6ZM12 14v7"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/></svg>',
  collapse: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 4 5 5 5-5M7 20l5-5 5 5"/></svg>',
  copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  expand: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 9 5-5 5 5M7 15l5 5 5-5"/></svg>',
};

// ── State ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// ui: the panel's preferences, kept by the extension for every checklist. view: this checklist's folds, open notes and
// unsaved boxes, kept by the webview across redraws.
const ui = { toc: true, panel: false, pinned: true, filter: 'all', foldDone: true, openNotes: false, leafTop: 0, tocOpen: {} };
const saved = vscode.getState() || {};
const view = { folded: saved.folded || {}, open: saved.open || {}, scroll: saved.scroll || null };
const forms = {}; // item key -> { type: 'no' | 'note', text, pics: [{ src, data, ext, failed }] }
let doc = null;   // the latest render message
let themeSetting = 'auto';
let colors = {};
let tocW = 280;
let who = '', today = '';
let parts = [], items = [], heads = [], blocks = [], allRows = [];
let first = true;
const content = $('#content');
const main = $('#main');
const leaf = $('#leaf');

function keepView() { clearTimeout(keepT); vscode.setState({ folded: view.folded, open: view.open, scroll: view.scroll }); }
// Scrolling only moves the kept place: write it once the scrolling stops, not on every frame.
let keepT = 0;
function keepViewSoon() { clearTimeout(keepT); keepT = setTimeout(keepView, 400); }
let uiTimer = 0;
function saveUi() { clearTimeout(uiTimer); uiTimer = setTimeout(() => vscode.postMessage({ type: 'ui', value: ui }), 250); }
/** Write HTML only when it changed, so a refresh leaves untouched parts of the page alone. */
function setHtml(el, html) { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } }

// A render from the extension usually follows an answer and changes a row or two. Each row gets a shape (what it is
// and where) and a signature (what it says, its line number aside): when every shape matches the page already drawn,
// only the rows whose signature changed are drawn again.
// A heading is known by its number when it has one: marking it done changes its id (the slug gains "-done"), not what it is.
const shapeOf = r => r.k === 'h' ? `h|${r.num || r.id}|${r.level}` : r.k === 'b' ? `b|${r.num}|${r.kind}` : r.k === 'i' ? `i|${r.num}|${r.kind}` : 'p';
const sigOf = r => JSON.stringify(r, (k, v) => (k === 'line' || k === 'sig' || k === 'shape') ? undefined : v);
const partSig = p => JSON.stringify([p.id, p.num, p.title, p.done, p.intro, p.table, p.rows.length]);
function stamp(outline) {
  outline.parts.forEach(p => { p.sig = partSig(p); p.rows.forEach(r => { r.shape = shapeOf(r); r.sig = sigOf(r); }); });
}
const DATA = { h: ['id', 'title', 'done', 'pills', 'intro'], b: ['label'], i: ['html', 'state', 'notes'], p: ['html', 'outro'] };
/** Patch the page in place from a new outline of the same shape. False when the shape differs. */
function patch(outline) {
  if (!parts.length || outline.parts.length !== parts.length) return false;
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i], b = outline.parts[i];
    if (a.sig !== b.sig || a.rows.length !== b.rows.length) return false;
    for (let j = 0; j < a.rows.length; j++) if (a.rows[j].shape !== b.rows[j].shape || (!a.table && a.rows[j].sig !== b.rows[j].sig)) return false;
  }
  let headsChanged = false;
  parts.forEach((p, i) => {
    const np = outline.parts[i];
    p.line = np.line;
    p.rows.forEach((r, j) => {
      const n = np.rows[j];
      if (n.line !== undefined) r.line = n.line;
      if (n.sig === r.sig) return;
      r.sig = n.sig;
      if (r.k === 'h' && n.id !== r.id && r.id in view.folded) { view.folded[n.id] = view.folded[r.id]; delete view.folded[r.id]; keepView(); }
      const doneNow = r.k === 'h' && n.done && !r.done;
      for (const k of DATA[r.k]) r[k] = n[k];
      // A test marked done outside the panel (by hand, by git) folds like one marked here, unless you folded it yourself.
      if (doneNow && view.folded[r.id] === undefined) r.folded = ui.foldDone;
      if (r.k === 'i') { if (r.el) redrawItem(r); return; }
      if (r.k === 'h') { r.plain = plain(r.title); headsChanged = true; }
      if (r.el && r.el.tagName === 'TR') {
        const t = document.createElement('tbody');
        t.innerHTML = rowHtml(r);
        const row = t.firstElementChild;
        r.el.replaceWith(row); r.el = row;
        if (r.k === 'h') r.ansEl = row.querySelector('[data-hans]');
        if (r.k === 'b') r.ansEl = row.querySelector('[data-bans]');
      }
    });
  });
  if (headsChanged) { drawToc(); spyPart = spyHead = undefined; }
  refresh();
  return true;
}

// ── The model: parts -> rows; headings, blocks and items wired to each other ────────────────────────────────────────
function build(outline) {
  parts = outline.parts; items = []; heads = []; blocks = []; allRows = [];
  parts.forEach((p, pi) => {
    p.idx = pi;
    const stack = [];
    let cur = null;
    const levels = p.rows.filter(r => r.k === 'h').map(r => r.level);
    const minLevel = levels.length ? Math.min(...levels) : 3;
    const ordinal = new Map();
    p.rows.forEach((r, ri) => {
      r.part = p; r.gid = allRows.length; allRows.push(r);
      if (r.k === 'h') {
        while (stack.length && stack[stack.length - 1].level >= r.level) stack.pop();
        r.parent = stack[stack.length - 1] || null; r.rel = r.level - minLevel; r.items = []; r.kids = [];
        if (r.parent) r.parent.kids.push(r);
        const nx = p.rows[ri + 1];
        r.body = !!nx && !(nx.k === 'h' && nx.level <= r.level);
        stack.push(r); heads.push(r); cur = null;
      } else if (r.k === 'b') {
        r.items = []; r.head = stack[stack.length - 1] || null; r.rel = r.head ? r.head.rel : 0; cur = r; blocks.push(r);
      } else if (r.k === 'i') {
        r.block = cur; r.head = stack[stack.length - 1] || null; r.rel = r.head ? r.head.rel : 0;
        const hk = (r.head && r.head.id) || p.id || 'top';
        const n = (ordinal.get(hk) || 0) + 1; ordinal.set(hk, n);
        r.key = r.num || `${hk}#${n}`;
        stack.forEach(h => h.items.push(r)); if (cur) cur.items.push(r);
        r.ix = items.length; items.push(r);
      } else { r.head = stack[stack.length - 1] || null; r.rel = r.head ? r.head.rel : 0; }
    });
    p.items = p.rows.filter(r => r.k === 'i');
    p.heads = p.rows.filter(r => r.k === 'h');
  });
  heads.forEach(h => { h.group = h.kids.length > 0 && !h.items.some(it => it.head === h); h.plain = plain(h.title); });
  parts.forEach(p => { p.plain = plain(p.title || (doc && doc.title) || ''); });
  heads.forEach(h => { h.folded = view.folded[h.id] !== undefined ? view.folded[h.id] : (h.done && ui.foldDone); });
  items.forEach(it => { it.open = !!view.open[it.key]; it.form = forms[it.key] || null; });
}
const isTest = h => !h.group && (h.items.length > 0 || h.done);

// ── Counting ──────────────────────────────────────────────────────────────────────────────────────────────────────
function tally(list) {
  const t = { steps: 0, ticked: 0, checks: 0, yes: 0, no: 0, todo: 0, notes: 0, answered: 0, total: list.length };
  for (const it of list) {
    if (it.kind === 'step') { t.steps++; if (it.state === 'yes') t.ticked++; }
    else { t.checks++; if (it.state === 'yes') t.yes++; else if (it.state === 'no') t.no++; else t.todo++; }
    if (it.state !== 'none') t.answered++;
    t.notes += it.notes.filter(n => n.type !== 'old').length;
  }
  return t;
}
const pct = (a, b) => (a / Math.max(1, b) * 100).toFixed(2);

// ── Drawing ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** A button that copies "16.2.1.1 - Go to …" (or "Part 16 - …"), to paste where you report. */
function copyBtn(num, text, part) {
  const words = plain(text).replace(/\s+/g, ' ').trim();
  const label = num ? `${part ? 'Part ' : ''}${num} - ${words}` : words;
  return `<button class="cp" type="button" data-act="copy" data-copy="${esc(label)}" title="Copy: ${esc(label)}" aria-label="Copy the number and words">${I.copy}</button>`;
}
function headTitle(h) {
  return `<span class="tt">${h.title}</span>${h.done ? '<span class="pill success">Done</span>' : ''}${h.pills ? ' ' + h.pills : ''}${h.group ? '' : copyBtn(h.num, h.title)}`;
}
function rowHtml(r) {
  const sub = r.rel > 0 ? ' sub' : '';
  if (r.k === 'h') {
    const cls = `r-h${sub}${r.group ? ' group' : ''}${r.done ? ' done' : ''}${r.folded ? ' folded' : ''}${r.body ? '' : ' empty'}`;
    return `<tr class="${cls}" data-g="${r.gid}" id="${esc(r.id)}"><td class="c-num" data-act="fold"><div class="hnw"><button class="chev" type="button" data-act="fold" aria-label="Fold or open">${I.chev}</button><span>${esc(r.num)}</span></div></td>`
      + `<td class="c-text" data-act="fold"><div class="h-title">${headTitle(r)}</div>${r.intro ? `<div class="h-intro">${r.intro}</div>` : ''}</td>`
      + `<td class="c-ans" data-hans="${r.gid}"></td></tr>`;
  }
  if (r.k === 'b') {
    const pass = /pass/i.test(r.label) ? ' pass' : '';
    const ico = r.kind === 'step' ? I.do : pass ? I.pass : I.look;
    return `<tr class="r-b k-${r.kind}${pass}${sub}" data-g="${r.gid}"><td class="c-num">${esc(r.num)}</td><td class="c-text"><span class="bi">${ico}</span>${esc(r.label)}</td><td class="c-ans" data-bans="${r.gid}"></td></tr>`;
  }
  if (r.k === 'i') return itemHtml(r) + noteRowHtml(r);
  return `<tr class="r-p${r.outro ? ' outro' : ''}" data-g="${r.gid}"><td></td><td colspan="2"><div class="md">${r.html}</div></td></tr>`;
}
const itemClass = it => `r-i s-${it.state} k-${it.kind}${it.rel > 0 ? ' sub' : ''}`;
function itemHtml(it) {
  return `<tr class="${itemClass(it)}" data-g="${it.gid}" data-key="${esc(it.key)}"><td class="c-num">${esc(it.num)}</td><td class="c-text">${it.html}${copyBtn(it.num, it.html)}</td><td class="c-ans">${ansHtml(it)}</td></tr>`;
}
function ansHtml(it) {
  const live = it.notes.filter(n => n.type !== 'old');
  const isNo = it.state === 'no';
  const nb = `<button class="nb${live.length ? ' has' : ''}${isNo ? ' isno' : ''}${it.open || it.form ? ' open' : ''}" type="button" data-act="notes" title="${live.length ? 'Show or hide the notes' : 'Add a note or a picture'}" aria-expanded="${!!(it.open || it.form)}">${I.note}${live.length ? `<span>${live.length}</span>` : ''}</button>`;
  if (it.kind === 'step') return `<span class="ans">${nb}<button class="tick${it.state === 'yes' ? ' on' : ''}" type="button" data-act="tick" aria-pressed="${it.state === 'yes'}" title="${it.state === 'yes' ? 'Done: click to undo' : 'Mark this step done'}">${I.check}</button></span>`;
  return `<span class="ans">${nb}<span class="yn"><button class="y${it.state === 'yes' ? ' on' : ''}" type="button" data-act="yes" aria-pressed="${it.state === 'yes'}">Yes</button><button class="n${isNo ? ' on' : ''}" type="button" data-act="no" aria-pressed="${isNo}">No</button></span></span>`;
}
function noteRowHtml(it) {
  return `<tr class="r-n${it.rel > 0 ? ' sub' : ''}" data-n="${it.gid}"><td class="c-num"></td><td class="nc" colspan="2">${notesHtml(it)}</td></tr>`;
}
function notesHtml(it) {
  const out = it.notes.map(n => {
    const name = n.type === 'note' ? 'Note' : 'No';
    const pics = n.pics.length ? `<div class="pics">${n.pics.map(p => picHtml(p)).join('')}</div>` : '';
    return `<div class="nt ${n.type}"><div class="nt-hd"><b>${name}</b>${n.date ? `<span>· ${esc(n.date)} · ${esc(n.who)}</span>` : ''}${n.type === 'old' ? '<span>· answered again since</span>' : ''}</div><div class="nt-tx">${n.html}</div>${pics}</div>`;
  });
  out.push(it.form ? formHtml(it) : '<button class="add-note" type="button" data-act="addnote">+ Note or picture</button>');
  return `<div class="notes">${out.join('')}</div>`;
}
function picHtml(p) {
  const saved = !p.pending;
  return `<span class="pic" role="button" tabindex="0" data-act="view" data-src="${esc(p.path)}" title="${esc(p.label)}: open"><img src="${esc(p.path)}" alt="${esc(p.label)}"><span class="pl">${esc(p.label)}</span>`
    + `${saved ? `<button class="px" type="button" data-act="delpic" data-path="${esc(p.path)}" aria-label="Delete ${esc(p.label)}">${I.x}</button>` : ''}</span>`;
}
function formHtml(it) {
  const f = it.form;
  const max = doc ? doc.outline.pictureMax : 0;
  const pend = f.pics.map((p, i) => `<span class="pic${p.failed ? ' failed' : ''}" data-act="view" data-src="${esc(p.src)}">${p.src ? `<img src="${esc(p.src)}" alt="">` : '<span class="hint">reading…</span>'}<span class="pl">img${max + i + 1}</span><button class="px" type="button" data-act="leaveout" data-i="${i}" aria-label="Leave out">${I.x}</button></span>`).join('');
  const isNo = f.type === 'no';
  return `<div class="form${isNo ? ' no' : ''}" data-form="${it.gid}"><textarea placeholder="${isNo ? 'What did you see instead?' : 'A note'} Paste or drop a screenshot here.">${esc(f.text)}</textarea>`
    + `<div class="pics">${pend}</div><div class="f-row"><button class="btn ${isNo ? 'save-no' : 'save-note'}" type="button" data-act="save">${isNo ? 'Save No' : 'Save note'}</button>`
    + `<button class="btn" type="button" data-act="cancel">Cancel</button><span class="hint">Ctrl+V pastes a picture · Ctrl+Enter saves · Esc cancels</span></div></div>`;
}
function foldBar(scope, id, what) {
  return `<div class="foldbar" role="group" aria-label="Fold ${what}">`
    + `<button type="button" data-fold="collapse" data-scope="${scope}" data-id="${id}" title="Collapse ${what}">${I.collapse}<span>Collapse${scope === 'all' ? ' all' : ''}</span></button>`
    + `<button type="button" data-fold="expand" data-scope="${scope}" data-id="${id}" title="Expand ${what}">${I.expand}<span>Expand${scope === 'all' ? ' all' : ''}</span></button></div>`;
}
function partHtml(p) {
  const cv = I.chev.replace('<svg', '<svg class="cv"');
  if (!p.table) {
    const body = p.intro.join('') + p.rows.map(r => r.k === 'h' ? `<h3 id="${esc(r.id)}">${r.title}</h3>${r.intro ? `<p>${r.intro}</p>` : ''}` : r.k === 'p' ? r.html : '').join('');
    if (!p.title) return `<section class="part" id="${esc(p.id)}" data-p="${p.idx}"><div class="md">${body}</div></section>`;
    return `<section class="part" id="${esc(p.id)}" data-p="${p.idx}"><details class="prose"><summary>${cv}<h2>${p.num ? `Part ${esc(p.num)} · ` : ''}${p.title}</h2><span class="hint">Read</span></summary><div class="md">${body}</div></details></section>`;
  }
  const about = p.intro.length ? `<details class="about"><summary>${cv}<b>About this part</b><span>${esc(plain(p.intro[0]).slice(0, 90))}…</span></summary><div class="md">${p.intro.join('')}</div></details>` : '';
  const eyebrow = p.num ? 'Part ' + esc(p.num) : '';
  return `<section class="part" id="${esc(p.id)}" data-p="${p.idx}"><div class="part-hd"><div class="ph">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h2>${p.title || esc(doc.title)}${p.title ? copyBtn(p.num, p.title, true) : ''}</h2></div>${foldBar('p', p.idx, 'every test in this part')}<div class="meter" data-meter="${p.idx}"></div></div>${about}`
    + `<table class="grid"><colgroup><col class="c1"><col><col class="c3"></colgroup><thead><tr><th>#</th><th>Step</th><th>Answer</th></tr></thead><tbody>${p.rows.map(rowHtml).join('')}</tbody></table></section>`;
}
function drawAll() {
  $('#docTitle').textContent = doc.title;
  $('#docTitle').title = doc.title;
  content.innerHTML = `<div class="docbar"><span class="hint">Collapse shows one row per test. Alt+click a test's arrow to fold or open every test of its level in that part.</span>${foldBar('all', 0, 'every test in every part')}</div>`
    + parts.map(partHtml).join('');
  // One pass over the page to find every row, instead of one search per row.
  allRows.forEach(r => { r.el = null; });
  content.querySelectorAll('tr[data-g]').forEach(tr => { allRows[+tr.dataset.g].el = tr; });
  content.querySelectorAll('tr[data-n]').forEach(tr => { allRows[+tr.dataset.n].nel = tr; });
  content.querySelectorAll('section[data-p]').forEach(s => { parts[+s.dataset.p].el = s; });
  heads.forEach(h => { if (!h.el && h.id) h.el = document.getElementById(h.id); h.ansEl = h.el && h.el.querySelector('[data-hans]'); });
  blocks.forEach(b => { b.ansEl = b.el && b.el.querySelector('[data-bans]'); });
  parts.forEach(p => { p.meterEl = p.el.querySelector('[data-meter]'); });
  spyPart = spyHead = undefined;
  drawToc();
  refresh();
}
function redrawItem(it) {
  const a = document.createElement('tbody');
  a.innerHTML = itemHtml(it) + noteRowHtml(it);
  const [row, nrow] = a.children;
  it.el.replaceWith(row); it.nel.replaceWith(nrow);
  it.el = row; it.nel = nrow;
}

// ── Counts on every surface ──────────────────────────────────────────────────────────────────────────────────────
function headAns(h) {
  if (!h.items.length) return '';
  if (h.done) return '<span class="pill success">Done</span>';
  const t = tally(h.items);
  if (t.answered === t.total && t.no === 0 && !h.group) return '<button class="markdone" type="button" data-act="markdone">Mark test done</button>';
  return `<span class="prog"><span>${t.answered} of ${t.total}${t.no ? ` · <span class="nos">${t.no} No</span>` : ''}</span><span class="bar"><i style="width:${pct(t.ticked + t.yes, t.total)}%"></i><i class="n" style="width:${pct(t.no, t.total)}%"></i></span></span>`;
}
function refresh() {
  heads.forEach(h => setHtml(h.ansEl, headAns(h)));
  blocks.forEach(b => {
    if (!b.ansEl) return;
    const t = tally(b.items);
    setHtml(b.ansEl, b.kind === 'step' ? `${t.ticked} of ${t.steps} done` : `${t.yes} Yes${t.no ? ` · ${t.no} No` : ''} of ${t.checks}`);
  });
  parts.forEach(p => {
    if (!p.meterEl) return;
    const t = tally(p.items);
    const tests = p.heads.filter(isTest);
    const done = tests.filter(h => h.done).length;
    setHtml(p.meterEl, `<div>${tests.length ? `<b>${done}</b> of ${tests.length} tests done · ` : ''}<b>${t.total - t.answered}</b> left</div><div class="bar"><i style="width:${pct(t.ticked + t.yes, t.total)}%"></i><i class="n" style="width:${pct(t.no, t.total)}%"></i></div>`);
    p.el.classList.toggle('done', tests.length > 0 && done === tests.length);
  });
  refreshToc(); refreshChip(); drawLeaf(); drawPanel(); applyVisibility();
}
function refreshChip() {
  const t = tally(items);
  const left = t.todo + (t.steps - t.ticked);
  const share = Math.round(t.answered / Math.max(1, t.total) * 100);
  const r = 9, c = 2 * Math.PI * r;
  setHtml($('#chip'), `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="${r}" fill="none" stroke="var(--line)" stroke-width="3.5"/><circle cx="12" cy="12" r="${r}" fill="none" stroke="var(--yes-fill)" stroke-width="3.5" stroke-dasharray="${c * share / 100} ${c}" transform="rotate(-90 12 12)" stroke-linecap="round"/></svg>`
    + `<span><b>${left}</b> <span class="cl">left</span>${t.no ? ` · <span class="no">${t.no} No</span>` : ''}</span>`);
  $('#chip').title = `${share}% answered: ${t.ticked} of ${t.steps} steps, ${t.yes + t.no} of ${t.checks} checks. Open the progress panel.`;
}

// ── Contents, and its own filter ─────────────────────────────────────────────────────────────────────────────────
const tocF = { q: '', show: 'all' };
function drawToc() {
  $('#tocTree').innerHTML = parts.map(p => {
    const kids = p.heads.filter(h => h.rel <= 2).map(h => `<a class="th lv${h.rel}${h.done ? ' done' : ''}" href="#${esc(h.id)}" data-h="${h.gid}"><span class="hn">${esc(h.num)}</span><span class="ht">${esc(h.plain)}</span>${h.done ? '<span class="pill success">Done</span>' : ''}<span data-tdot></span></a>`).join('');
    const open = ui.tocOpen[p.id || p.idx] ? ' open' : '';
    return `<div class="tp${open}" data-p="${p.idx}"><button class="tp-row" type="button" data-act="tpart">${kids ? `<span class="cv">${I.chev}</span>` : '<span class="cv" style="width:14px"></span>'}<span class="tn">${esc(p.num)}</span><span class="tt">${esc(p.plain)}</span><span class="tc" data-tc></span></button>${kids ? `<div class="tp-kids">${kids}</div>` : ''}</div>`;
  }).join('');
  parts.forEach(p => { p.tocEl = null; p.tocKids = []; });
  heads.forEach(h => { h.tocEl = null; });
  $$('#tocTree .tp').forEach(el => {
    const p = parts[+el.dataset.p];
    p.tocEl = el; p.tocTt = el.querySelector('.tp-row .tt'); p.tocTc = el.querySelector('[data-tc]'); p.tocTt._h = esc(p.plain);
  });
  $$('#tocTree .th').forEach(a => {
    const h = allRows[+a.dataset.h];
    h.tocEl = a; h.tocHt = a.querySelector('.ht'); h.tocDot = a.querySelector('[data-tdot]'); h.tocHt._h = esc(h.plain);
    h.part.tocKids.push(h);
  });
  tocActive = { p: null, h: null };
}
const headOpen = h => (isTest(h) ? !h.done : false) || h.items.some(it => it.state === 'none');
const headNo = h => h.items.some(it => it.state === 'no');
function refreshToc() {
  parts.forEach(p => {
    if (!p.tocTc) return;
    if (!p.table) { setHtml(p.tocTc, ''); return; }
    const tests = p.heads.filter(isTest);
    const done = tests.filter(h => h.done).length;
    const no = tally(p.items).no;
    p.tocTc.classList.toggle('all', !!tests.length && done === tests.length);
    setHtml(p.tocTc, `${no ? '<span class="dot" title="Has a No"></span> ' : ''}${tests.length ? `${done}/${tests.length}` : ''}`);
  });
  heads.forEach(h => { if (h.tocDot) setHtml(h.tocDot, headNo(h) ? '<span class="dot"></span>' : ''); });
  applyTocFilter();
}
function markText(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark class="tqm">' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}
function applyTocFilter() {
  const q = tocF.q.trim().toLowerCase();
  const on = !!q || tocF.show !== 'all';
  let count = 0;
  parts.forEach(p => {
    const el = p.tocEl; if (!el) return;
    const ptext = p.plain;
    const partHit = !q || (p.num + ' ' + ptext).toLowerCase().includes(q);
    let kids = 0;
    p.tocKids.forEach(h => {
      const htext = h.plain;
      const hitQ = !q || partHit || (h.num + ' ' + htext).toLowerCase().includes(q);
      const hitS = tocF.show === 'all' || (tocF.show === 'open' ? headOpen(h) : headNo(h));
      const vis = hitQ && hitS;
      h.tocEl.classList.toggle('hide', !vis);
      if (vis) kids++;
      setHtml(h.tocHt, q && vis && htext.toLowerCase().includes(q) ? markText(htext, q) : esc(htext));
    });
    const hasKids = p.tocKids.length > 0;
    const partS = tocF.show === 'all' || (tocF.show === 'open' ? p.heads.some(headOpen) : p.heads.some(headNo));
    const vis = !on || kids > 0 || (!hasKids && partHit && partS);
    el.classList.toggle('hide', !vis);
    el.classList.toggle('fopen', on && kids > 0);
    setHtml(p.tocTt, q && ptext.toLowerCase().includes(q) ? markText(ptext, q) : esc(ptext));
    if (vis) count += hasKids ? kids : 1;
  });
  $('#tocQc').textContent = on ? String(count) : '';
  $('#tocQx').hidden = !tocF.q;
  $('#tocEmpty').hidden = !on || count > 0;
}
$('#tocQ').addEventListener('input', e => { tocF.q = e.target.value; applyTocFilter(); });
$('#tocQ').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.target.value = ''; tocF.q = ''; applyTocFilter(); }
  if (e.key === 'Enter') { e.preventDefault(); const a = $('#tocTree .th:not(.hide)'); if (a) a.click(); else { const tp = $('#tocTree .tp:not(.hide) .tp-row'); if (tp) tp.click(); } }
});
$('#tocQx').addEventListener('click', () => { $('#tocQ').value = ''; tocF.q = ''; applyTocFilter(); $('#tocQ').focus(); });
$$('.tseg button').forEach(b => b.addEventListener('click', () => {
  tocF.show = b.dataset.tf;
  $$('.tseg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  applyTocFilter();
}));
$('#tocTree').addEventListener('click', e => {
  const row = e.target.closest('[data-act="tpart"]');
  if (row) {
    const el = row.parentElement, p = parts[+el.dataset.p];
    const was = el.classList.contains('open');
    el.classList.toggle('open', !was); ui.tocOpen[p.id || p.idx] = !was;
    if (!was || !el.querySelector('.tp-kids')) goTo(p.el, false, true);
    saveUi(); return;
  }
  const a = e.target.closest('a.th');
  if (a) { e.preventDefault(); const h = allRows[+a.dataset.h]; if (h.folded) { h.folded = false; view.folded[h.id] = false; applyVisibility(); keepView(); } goTo(h.el, false, true); }
});
$('#tocFold').addEventListener('click', () => { ui.tocOpen = {}; $$('#tocTree .tp').forEach(el => el.classList.remove('open')); saveUi(); });

// ── What shows: folds and the filter ─────────────────────────────────────────────────────────────────────────────
const match = it => ui.filter === 'all' || (ui.filter === 'todo' && it.state === 'none') || (ui.filter === 'no' && it.state === 'no')
  || (ui.filter === 'notes' && it.notes.some(n => n.type !== 'old'));
function hiddenByFold(r) { for (let h = r.k === 'h' ? r.parent : r.head; h; h = h.parent) if (h.folded) return true; return false; }
function applyVisibility() {
  const filtering = ui.filter !== 'all';
  parts.forEach(p => {
    if (!p.table) { p.el.hidden = filtering; return; }
    p.el.hidden = filtering && !p.items.some(match);
    p.rows.forEach(r => {
      let show = !hiddenByFold(r);
      if (show && filtering) {
        if (r.k === 'h' || r.k === 'b') show = r.items.some(match);
        else if (r.k === 'i') show = match(r);
        else show = false;
      }
      const el = r.el;
      if (el) el.classList.toggle('gone', !show);
      if (r.k === 'h' && el) el.classList.toggle('folded', !!r.folded);
      if (r.k === 'i') r.nel.classList.toggle('gone', !(show && (!!r.form || r.open || (ui.openNotes && r.notes.length > 0))));
    });
  });
}
function setFold(h, folded) { h.folded = folded; view.folded[h.id] = folded; }
function foldPart(p, collapse) {
  if (!p.table) { const d = p.el.querySelector('details.prose'); if (d && collapse) d.open = false; return; }
  p.heads.forEach(h => { if (h.body) setFold(h, collapse); });
  if (collapse) {
    p.items.forEach(it => { if (!it.form) { it.open = false; delete view.open[it.key]; } });
    const a = p.el.querySelector('details.about'); if (a) a.open = false;
  }
}

// ── Answering ────────────────────────────────────────────────────────────────────────────────────────────────────
// A row answered here changes before the file does, so it no longer matches what the extension last sent: forget its
// signature, and the next render draws it from the file whatever the file says, even if the write did not happen.
const post = (action, it, extra) => { it.sig = null; vscode.postMessage({ type: 'answer', action, line: it.line, ...(extra || {}) }); };
function strikeReasons(it) { it.notes.forEach(n => { if (n.type === 'no') n.type = 'old'; }); }
function act(it, what) {
  if (what === 'tick') { const on = it.state === 'yes'; post(on ? 'untick' : 'tick', it); it.state = on ? 'none' : 'yes'; }
  else if (what === 'yes') {
    const on = it.state === 'yes';
    post(on ? 'clear' : 'yes', it); strikeReasons(it); it.state = on ? 'none' : 'yes';
    if (it.form && it.form.type === 'no') closeForm(it);
  } else if (what === 'no') {
    if (it.state === 'no') { post('clear', it); strikeReasons(it); it.state = 'none'; }
    else if (it.form && it.form.type === 'no') closeForm(it);
    else { syncFormText(it); openForm(it, 'no'); }
  }
  redrawItem(it); refresh();
  if (it.form) focusForm(it);
}
function openForm(it, type) {
  const prev = it.form;
  it.form = forms[it.key] = { type, text: prev ? prev.text : '', pics: prev ? prev.pics : [] };
  it.open = true; view.open[it.key] = true; keepView();
}
function closeForm(it) { it.form = null; delete forms[it.key]; }
function focusForm(it) { requestAnimationFrame(() => { const ta = it.nel && it.nel.querySelector('textarea'); if (ta) ta.focus(); }); }
function syncFormText(it) { const ta = it.nel && it.nel.querySelector('textarea'); if (ta && it.form) it.form.text = ta.value; }
function saveForm(it) {
  const f = it.form; if (!f) return;
  if (f.pics.some(p => !p.src && !p.failed)) { toast('Still reading a picture…'); return; }
  const text = f.text.trim();
  const max = doc.outline.pictureMax;
  const pictures = f.pics.filter(p => p.data).map((p, i) => ({ label: `img${max + i + 1}`, data: p.data, ext: p.ext }));
  if (f.type === 'no' && !text) { toast('Say what you saw instead, then Save No.'); focusForm(it); return; }
  if (f.type === 'note' && !text && !pictures.length) { closeForm(it); redrawItem(it); applyVisibility(); return; }
  post(f.type, it, { reason: text, pictures });
  if (f.type === 'no') { strikeReasons(it); it.state = 'no'; }
  it.notes.push({ type: f.type, date: today, who, html: esc(text).replace(/\n/g, '<br>'), pics: pictures.map((p, i) => ({ label: p.label, path: f.pics.filter(x => x.data)[i].src, pending: true })) });
  closeForm(it); it.open = true; view.open[it.key] = true; keepView();
  redrawItem(it); refresh();
}

/** Shrink to at most 1,600 px on the longest side and encode as WebP (PNG if this editor cannot make WebP). */
async function encode(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.85));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  return { data: btoa(bin), ext };
}
function addPictures(it, files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length || !it.form) return;
  syncFormText(it);
  imgs.forEach(file => {
    const p = { src: '', data: '', ext: '', failed: false };
    it.form.pics.push(p);
    encode(file).then(({ data, ext }) => Object.assign(p, { data, ext, src: `data:image/${ext};base64,${data}` }))
      .catch(() => { p.failed = true; })
      .finally(() => { if (it.form) { syncFormText(it); redrawItem(it); applyVisibility(); focusForm(it); } });
  });
  redrawItem(it); applyVisibility(); focusForm(it);
}

// ── Events on the page ───────────────────────────────────────────────────────────────────────────────────────────
content.addEventListener('click', e => {
  const fb = e.target.closest('[data-fold]');
  if (fb) {
    const collapse = fb.dataset.fold === 'collapse';
    (fb.dataset.scope === 'all' ? parts : [parts[+fb.dataset.id]]).forEach(p => foldPart(p, collapse));
    applyVisibility(); keepView();
    if (fb.dataset.scope === 'p') goTo(parts[+fb.dataset.id].el, false, true);
    return;
  }
  const link = e.target.closest('a[href]');
  if (link && !e.target.closest('[data-act="fold"] button')) {
    e.preventDefault();
    const href = link.getAttribute('href');
    if (href.startsWith('#')) { const el = document.getElementById(decodeURIComponent(href.slice(1))); if (el) goTo(el, false, true); }
    else vscode.postMessage({ type: 'open', href });
    return;
  }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'copy') { e.stopPropagation(); vscode.postMessage({ type: 'copy', text: btn.dataset.copy }); toast('Copied: ' + btn.dataset.copy.slice(0, 60)); return; }
  const tr = btn.closest('tr');
  const gid = tr ? +(tr.dataset.g ?? tr.dataset.n) : NaN;
  const r = allRows[gid];
  const a = btn.dataset.act;
  if (a === 'fold' && r && r.k === 'h') {
    if (e.target.closest('code, .pill') || !r.body) return;
    setFold(r, !r.folded);
    if (e.altKey) r.part.heads.forEach(h => { if (h.body && h.level === r.level) setFold(h, r.folded); });
    applyVisibility(); keepView(); return;
  }
  if (!r) return;
  if (a === 'tick' || a === 'yes' || a === 'no') { e.stopPropagation(); act(r, a); return; }
  if (a === 'markdone') {
    e.stopPropagation();
    vscode.postMessage({ type: 'markDone', line: r.line });
    r.done = true; r.sig = null; setFold(r, ui.foldDone); tr.querySelector('.h-title').innerHTML = headTitle(r); tr.classList.add('done'); refresh();
    return;
  }
  if (a === 'notes') {
    if (r.form) { syncFormText(r); closeForm(r); r.open = false; }
    else if (r.notes.length) r.open = !r.open;
    else openForm(r, 'note');
    if (r.open) view.open[r.key] = true; else delete view.open[r.key];
    keepView(); redrawItem(r); applyVisibility(); if (r.form) focusForm(r); return;
  }
  if (a === 'addnote') { openForm(r, 'note'); redrawItem(r); applyVisibility(); focusForm(r); return; }
  if (a === 'cancel') { closeForm(r); if (!r.notes.length) { r.open = false; delete view.open[r.key]; } redrawItem(r); applyVisibility(); return; }
  if (a === 'save') { syncFormText(r); saveForm(r); return; }
  if (a === 'leaveout') {
    e.stopPropagation(); syncFormText(r);
    const i = +btn.dataset.i, k = doc.outline.pictureMax + i + 1;
    r.form.pics.splice(i, 1);
    r.form.text = r.form.text.replace(/\bimg(\d+)\b/g, (m, d) => { const n = +d; return n === k ? '(picture left out)' : n > k ? 'img' + (n - 1) : m; });
    redrawItem(r); applyVisibility(); focusForm(r); return;
  }
  if (a === 'delpic') { e.stopPropagation(); vscode.postMessage({ type: 'deletePicture', path: btn.dataset.path }); return; }
  if (a === 'view') openPic(btn.dataset.src);
});
content.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pic[data-act="view"]')) { e.preventDefault(); openPic(e.target.dataset.src); return; }
  const ta = e.target.closest('textarea'); if (!ta) return;
  const it = allRows[+ta.closest('[data-form]').dataset.form];
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); it.form.text = ta.value; saveForm(it); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeForm(it); if (!it.notes.length) it.open = false; redrawItem(it); applyVisibility(); }
});
content.addEventListener('input', e => { const ta = e.target.closest('textarea'); if (ta) { const it = allRows[+ta.closest('[data-form]').dataset.form]; if (it.form) it.form.text = ta.value; } });
document.addEventListener('paste', e => {
  const form = e.target.closest && e.target.closest('[data-form]');
  const it = form ? allRows[+form.dataset.form] : items.find(x => x.form);
  if (!it || !it.form) return;
  const files = [...((e.clipboardData && e.clipboardData.files) || [])];
  if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); addPictures(it, files); }
});
content.addEventListener('dragover', e => { const f = e.target.closest('[data-form]'); if (f) { e.preventDefault(); f.classList.add('drop'); } });
content.addEventListener('dragleave', e => { const f = e.target.closest('[data-form]'); if (f) f.classList.remove('drop'); });
content.addEventListener('drop', e => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault(); f.classList.remove('drop'); addPictures(allRows[+f.dataset.form], e.dataTransfer.files);
});

// ── Going to a place ─────────────────────────────────────────────────────────────────────────────────────────────
function reveal(el) {
  const sec = el.closest('section.part');
  if (sec && sec.hidden) setFilter('all');
  const det = el.closest('details'); if (det) det.open = true;
  const tr = el.closest('tr');
  if (!tr) return;
  const r = allRows[+(tr.dataset.g ?? tr.dataset.n)];
  if (!r) return;
  let changed = false;
  for (let h = r.k === 'h' ? r.parent : r.head; h; h = h.parent) if (h.folded) { setFold(h, false); changed = true; }
  if (tr.dataset.n !== undefined && !r.open) { r.open = true; view.open[r.key] = true; changed = true; }
  if (ui.filter !== 'all' && tr.classList.contains('gone')) setFilter('all');
  if (changed) { applyVisibility(); keepView(); }
}
/** Scroll to a place. A heading or part from the contents goes to the top (a row just under its table's sticky header),
 * so the crumbs and the contents name it; a Find match or the next answer goes a third of the way down, with context. */
function goTo(el, flash, atTop) {
  if (!el) return;
  reveal(el);
  const mr = main.getBoundingClientRect(), er = el.getBoundingClientRect();
  main.scrollTop += er.top - mr.top - (atTop ? (el.tagName === 'TR' ? 52 : 12) : mr.height / 3);
  if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  if (innerWidth <= 900) setToc(false);
}
/** The first part still on screen below a line: measured part by part, so parts far above are never laid out. */
function partAt(line) {
  for (const p of parts) { if (!p.el || p.el.hidden) continue; if (p.el.getBoundingClientRect().bottom > line) return p; }
  return null;
}
function nextWhere(pred) {
  const list = items.filter(pred);
  if (!list.length) return null;
  const mr = main.getBoundingClientRect();
  const line = mr.top + mr.height / 3 + 4;
  const at = partAt(line);
  let anchor = null;
  if (at) {
    anchor = at.items.find(it => !it.el.classList.contains('gone') && it.el.getBoundingClientRect().top > line);
    if (!anchor) anchor = items.find(it => it.part.idx > at.idx && !it.el.classList.contains('gone'));
  }
  const from = anchor ? anchor.ix : items.length;
  return list.find(it => it.ix >= from) || list[0];
}

// ── Where you are: the crumbs, the contents highlight, the place kept across redraws ────────────────────────────────
// On each scroll frame: read where the page is first, then write only what changed.
let spyQueued = false;
let spyPart, spyHead;
let tocActive = { p: null, h: null };
main.addEventListener('scroll', () => { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } }, { passive: true });
function spy() {
  spyQueued = false;
  if (!doc) return;
  const mtop = main.getBoundingClientRect().top;
  const top = mtop + 90;
  let part = null, head = null;
  for (const p of parts) { if (p.el.hidden) continue; if (p.el.getBoundingClientRect().top <= top) part = p; else break; }
  if (part) for (const h of part.heads) { if (!h.el || h.el.classList.contains('gone')) continue; if (h.el.getBoundingClientRect().top <= top) head = h; else break; }
  view.scroll = anchorNow(mtop, part);
  keepViewSoon();
  if (part === spyPart && head === spyHead) return;
  spyPart = part; spyHead = head;
  const crumbs = [`<span>${esc(doc.file)}</span>`];
  if (part && part.title) crumbs.push(`<b>${part.num ? 'Part ' + esc(part.num) + ' · ' : ''}${part.title}</b>`);
  if (head) crumbs.push(`<span>${esc(head.num)} ${head.title}</span>`);
  setHtml($('#crumbs'), crumbs.join('<span class="sep">›</span>'));
  const tp = part ? part.tocEl : null, th = head ? head.tocEl : null;
  if (tocActive.p !== tp) { if (tocActive.p) tocActive.p.classList.remove('active'); if (tp) tp.classList.add('active'); }
  if (tocActive.h !== th) { if (tocActive.h) tocActive.h.classList.remove('active'); if (th) th.classList.add('active'); }
  tocActive = { p: tp, h: th };
  if (part && !ui.tocOpen[part.id || part.idx]) { ui.tocOpen[part.id || part.idx] = true; if (tp) tp.classList.add('open'); }
  const act = th || tp;
  if (act) { const toc = $('#toc'); const tr = toc.getBoundingClientRect(), ar = act.getBoundingClientRect(); if (ar.top < tr.top + 150 || ar.bottom > tr.bottom - 20) toc.scrollTop += ar.top - tr.top - tr.height / 3; }
}
/** The row at the top of the page and how far down it sits, to come back to after a redraw. Starts at the part above
 * the one in view, so the rows of earlier parts are never measured. */
function anchorNow(top = main.getBoundingClientRect().top, near = partAt(top)) {
  const from = near ? Math.max(0, near.idx - 1) : 0;
  for (let i = from; i < parts.length; i++) {
    const p = parts[i];
    if (!p.el || p.el.hidden) continue;
    for (const r of p.rows) {
      if (!r.el || r.el.classList.contains('gone')) continue;
      const b = r.el.getBoundingClientRect();
      if (b.bottom > top + 1) return { key: r.k === 'i' ? 'i:' + r.key : r.k === 'h' ? 'h:' + r.id : null, off: b.top - top, gid: r.gid };
    }
  }
  return null;
}
function restoreAnchor(a) {
  if (!a) return;
  let el = null;
  if (a.key && a.key.startsWith('i:')) el = content.querySelector(`tr[data-key="${CSS.escape(a.key.slice(2))}"]`);
  else if (a.key && a.key.startsWith('h:')) el = document.getElementById(a.key.slice(2));
  if (!el && allRows[a.gid]) el = allRows[a.gid].el;
  if (!el) return;
  main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - a.off;
}

// ── The contents: menu button, resize ────────────────────────────────────────────────────────────────────────────
function setToc(on) { ui.toc = on; $('#app').classList.toggle('toc-off', !on); $('#burger').setAttribute('aria-expanded', String(on)); saveUi(); }
$('#burger').addEventListener('click', () => setToc($('#app').classList.contains('toc-off')));
$('#scrim').addEventListener('click', () => setToc(false));
const split = $('#split');
function setTocWidth(px) { tocW = Math.round(Math.max(200, Math.min(px, Math.max(220, innerWidth * 0.5)))); document.documentElement.style.setProperty('--toc-w', tocW + 'px'); return tocW; }
split.addEventListener('pointerdown', e => {
  e.preventDefault(); split.setPointerCapture(e.pointerId); split.classList.add('drag'); $('#app').classList.add('resizing');
  const move = ev => setTocWidth(ev.clientX);
  const up = () => { split.removeEventListener('pointermove', move); split.classList.remove('drag'); $('#app').classList.remove('resizing'); vscode.postMessage({ type: 'tocWidth', value: tocW }); };
  split.addEventListener('pointermove', move); split.addEventListener('pointerup', up, { once: true });
});
split.addEventListener('dblclick', () => vscode.postMessage({ type: 'tocWidth', value: setTocWidth(280) }));

// ── The leaf and its panel ───────────────────────────────────────────────────────────────────────────────────────
function drawLeaf() {
  const t = tally(items);
  const left = t.todo + (t.steps - t.ticked);
  setHtml(leaf, `${I.list}<span class="lt">Checklist</span><span class="lb" title="${left} left to answer">${left}</span>${t.no ? `<span class="lb no" title="${t.no} No">${t.no}</span>` : ''}${t.notes ? `<span class="lb nt" title="${t.notes} notes">${t.notes}</span>` : ''}`);
  leaf.title = `${left} left · ${t.no} No · ${t.notes} notes. Open the progress panel; drag to move.`;
}
function setPanel(on) { ui.panel = on; $('#app').classList.toggle('panel-open', on); leaf.setAttribute('aria-expanded', String(on)); if (on) drawPanel(); saveUi(); }
function setPinned(on) { ui.pinned = on; $('#app').classList.toggle('pinned', on); drawPanel(); saveUi(); }
let leafDrag = null;
leaf.addEventListener('pointerdown', e => { leafDrag = { y: e.clientY, top: leaf.getBoundingClientRect().top, moved: false }; leaf.setPointerCapture(e.pointerId); });
leaf.addEventListener('pointermove', e => {
  if (!leafDrag) return;
  const dy = e.clientY - leafDrag.y;
  if (Math.abs(dy) > 4) leafDrag.moved = true;
  if (leafDrag.moved) { const top = Math.max(64, Math.min(innerHeight - leaf.offsetHeight - 8, leafDrag.top + dy)); leaf.style.setProperty('--leaf-top', top + 'px'); ui.leafTop = top; }
});
leaf.addEventListener('pointerup', () => { const d = leafDrag; leafDrag = null; if (!d) return; if (d.moved) saveUi(); else setPanel(!ui.panel); });
leaf.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPanel(!ui.panel); } });
$('#chip').addEventListener('click', () => setPanel(!ui.panel));

// Colours: one per role, for light and dark alike (testmd.colors). Softer shades are mixed from it with the page
// colour, and the text on a filled colour turns dark or light to stay readable.
const ROLES = [
  { key: 'primary', label: 'Primary', hint: 'Buttons, links, the selected option, the menu highlight' },
  { key: 'secondary', label: 'Secondary', hint: 'The CHECKLIST leaf, part labels, the logo' },
  { key: 'yes', label: 'Tick and Yes', hint: 'Done steps, Yes, the progress bars' },
  { key: 'no', label: 'No', hint: 'No answers and their rows' },
  { key: 'note', label: 'Notes', hint: 'Note buttons and note cards' },
  { key: 'mark', label: 'Pass highlight', hint: 'The highlighted pass conditions' },
  { key: 'find', label: 'Find matches', hint: 'Find, and the contents filter' },
  { key: 'test', label: 'Test rows', hint: 'A tint on the row of each test in the tables' },
];
const DEF = {
  light: { primary: '#0969da', secondary: '#0969da', yes: '#1f883d', no: '#cf222e', note: '#8250df', mark: '#fff3a3', find: '#ffd33d', test: '#8c959f' },
  dark: { primary: '#1f6feb', secondary: '#1f6feb', yes: '#238636', no: '#da3633', note: '#a371f7', mark: '#5c4a00', find: '#9e6a03', test: '#8c959f' },
};
const PRESETS = [
  { name: 'Blue (default)', primary: null, secondary: null },
  { name: 'Violet', primary: '#7c3aed', secondary: '#7c3aed' },
  { name: 'Emerald', primary: '#047857', secondary: '#10b981' },
  { name: 'Amber', primary: '#b45309', secondary: '#d97706' },
  { name: 'Rose', primary: '#be123c', secondary: '#e11d48' },
  { name: 'Slate', primary: '#475569', secondary: '#334155' },
];
const HEX = /^#[0-9a-f]{6}$/i;
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ink = hex => { const L = lum(hex); return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#1f2328'; };
const mix = (col, share, other) => `color-mix(in srgb, ${col} ${share}%, var(${other}))`;
function applyColors() {
  const c = {};
  for (const r of ROLES) if (HEX.test(colors[r.key] || '')) c[r.key] = colors[r.key];
  const v = [];
  if (c.primary) v.push(`--accent: ${c.primary}; --on-accent: ${ink(c.primary)}; --link: ${mix(c.primary, 80, '--fg')}; --accent-soft: ${mix(c.primary, 15, '--bg')};`);
  if (c.secondary) v.push(`--second: ${c.secondary}; --on-second: ${ink(c.secondary)};`);
  if (c.yes) v.push(`--yes-fill: ${c.yes}; --on-yes: ${ink(c.yes)}; --yes: ${mix(c.yes, 80, '--fg')}; --yes-line: ${mix(c.yes, 70, '--bg')}; --yes-soft: ${mix(c.yes, 14, '--bg')};`);
  if (c.no) v.push(`--no-fill: ${c.no}; --on-no: ${ink(c.no)}; --no: ${mix(c.no, 82, '--fg')}; --no-line: ${mix(c.no, 65, '--bg')}; --no-tint: ${mix(c.no, 16, '--bg')}; --no-soft: ${mix(c.no, 7, '--bg')};`);
  if (c.note) v.push(`--note: ${c.note}; --on-note: ${ink(c.note)}; --note-soft: ${mix(c.note, 12, '--bg')}; --note-line: ${mix(c.note, 55, '--bg')};`);
  if (c.mark) v.push(`--mark: ${c.mark}; --mark-ink: ${ink(c.mark)};`);
  if (c.find) v.push(`--find: ${c.find}; --find-cur: ${mix(c.find, 60, '--no-fill')};`);
  if (c.test) v.push(`--head-bg: ${mix(c.test, 14, '--bg')};`);
  let st = document.getElementById('tmd-colors');
  if (!st) { st = document.createElement('style'); st.id = 'tmd-colors'; document.head.appendChild(st); }
  st.textContent = v.length ? `:root:root:root { ${v.join(' ')} }` : '';
}
function colorsHtml() {
  const d = DEF[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];
  const sw = PRESETS.map((pr, i) => {
    const on = (pr.primary || null) === (colors.primary || null) && (pr.secondary || null) === (colors.secondary || null);
    return `<button class="sws${on ? ' on' : ''}" type="button" data-preset="${i}" title="${esc(pr.name)}" style="--sw:${pr.primary || d.primary};--sw2:${pr.secondary || d.secondary}"></button>`;
  }).join('');
  const roles = ROLES.map(r => `<label class="role"><span class="rl"><b>${r.label}</b><small>${r.hint}</small></span>`
    + `${colors[r.key] ? `<button class="rr" type="button" data-rreset="${r.key}" title="Back to the default">Default</button>` : ''}`
    + `<input type="color" data-role="${r.key}" value="${HEX.test(colors[r.key] || '') ? colors[r.key] : d[r.key]}" aria-label="${r.label} colour"></label>`).join('');
  return `<div class="swatches">${sw}</div><div class="roles">${roles}</div>`
    + `${Object.keys(colors).length ? '<button class="linkbtn" type="button" data-pact="rcolors">Reset every colour</button>' : ''}`
    + '<p class="hint">One colour per role, for light and dark alike. Kept in the <code>testmd.colors</code> setting, so a team can share them in <code>.vscode/settings.json</code>.</p>';
}
function saveColors() { applyColors(); vscode.postMessage({ type: 'colors', value: colors }); drawPanel(); }

// The progress panel is drawn only while it is open; opening it draws it.
function drawPanel() {
  if (!doc || !ui.panel) return;
  const t = tally(items);
  const left = t.todo + (t.steps - t.ticked);
  const seg = (name, val, label, cur) => `<button type="button" data-${name}="${val}" aria-pressed="${cur === val}">${label}</button>`;
  const list = parts.filter(p => p.table).map(p => {
    const pt = tally(p.items);
    const l = pt.total - pt.answered;
    return `<button class="pli" type="button" data-goto="${p.idx}"><span class="pn">${esc(p.num || '·')}</span><span class="pt2">${p.title || esc(doc.title)}</span><span class="pc">${l ? `${l} left` : '<span style="color:var(--yes)">all answered</span>'}${pt.no ? ` · <span class="no">${pt.no} No</span>` : ''}</span><span class="bar"><i style="width:${pct(pt.ticked + pt.yes, pt.total)}%"></i><i class="n" style="width:${pct(pt.no, pt.total)}%"></i></span></button>`;
  }).join('');
  const body = $('#panel .pn-body');
  const keep = body ? body.scrollTop : 0;
  $('#panel').innerHTML = `<div class="pn-hd"><div class="pt"><div class="eyebrow">This round</div><h3>Progress</h3></div>
    <button class="ib" type="button" data-pact="pin" aria-pressed="${ui.pinned}" title="${ui.pinned ? 'Unpin: lie over the page' : 'Pin: keep it open beside the page'}">${I.pin}</button>
    <button class="ib" type="button" data-pact="close" title="Close (Esc)">${I.close}</button></div>
    <div class="pn-body">
      <div class="stats"><button class="st yes" type="button" data-filter="all" title="Show everything"><b>${t.yes + t.ticked}</b><span>Yes / done</span></button>
        <button class="st no${ui.filter === 'no' ? ' on' : ''}" type="button" data-filter="no" title="Show only the No answers"><b>${t.no}</b><span>No</span></button>
        <button class="st${ui.filter === 'todo' ? ' on' : ''}" type="button" data-filter="todo" title="Show only what is left"><b>${left}</b><span>Left</span></button></div>
      <div class="pn-line"><span>Steps ticked</span><b>${t.ticked} of ${t.steps}</b></div>
      <div class="bar"><i style="width:${pct(t.ticked, t.steps)}%"></i></div>
      <div class="pn-line"><span>Checks answered</span><b>${t.yes + t.no} of ${t.checks}</b></div>
      <div class="bar"><i style="width:${pct(t.yes, t.checks)}%"></i><i class="n" style="width:${pct(t.no, t.checks)}%"></i></div>
      <div class="pn-acts"><button class="btn primary" type="button" data-pact="next">Next to answer ↓</button><button class="btn" type="button" data-pact="nextno" ${t.no ? '' : 'disabled'}>Next No ↓</button></div>
      <div class="pn-sec">Show</div>
      <div class="seg">${seg('filter', 'all', 'All', ui.filter)}${seg('filter', 'todo', 'Left', ui.filter)}${seg('filter', 'no', 'No', ui.filter)}${seg('filter', 'notes', 'Notes', ui.filter)}</div>
      <div class="pn-sec">Parts</div><div class="plist">${list}</div>
      <div class="pn-sec">View</div>
      <label class="sw">Fold tests marked done<input type="checkbox" data-sw="foldDone" ${ui.foldDone ? 'checked' : ''}></label>
      <label class="sw">Open every note<input type="checkbox" data-sw="openNotes" ${ui.openNotes ? 'checked' : ''}></label>
      <div class="pn-sec">Theme</div>
      <div class="seg">${seg('theme', 'auto', 'Auto', themeSetting)}${seg('theme', 'light', 'Light', themeSetting)}${seg('theme', 'dark', 'Dark', themeSetting)}</div>
      <div class="pn-sec">Colours</div>
      ${colorsHtml()}
    </div>
    <div class="pn-foot"><button class="btn danger" type="button" data-pact="archive">Archive round…</button>
      <p class="hint">Copies this checklist and its pictures to <code>archive/</code>, then clears every answer for the next round.</p></div>`;
  const nb = $('#panel .pn-body'); if (nb) nb.scrollTop = keep;
}
$('#panel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.filter) { setFilter(ui.filter === b.dataset.filter && b.classList.contains('st') ? 'all' : b.dataset.filter); return; }
  if (b.dataset.theme) { themeSetting = b.dataset.theme; applyTheme(); vscode.postMessage({ type: 'theme', value: themeSetting }); drawPanel(); return; }
  if (b.dataset.goto) { goTo(parts[+b.dataset.goto].el, false, true); return; }
  if (b.dataset.preset !== undefined) {
    const pr = PRESETS[+b.dataset.preset];
    const c = { ...colors };
    if (pr.primary) { c.primary = pr.primary; c.secondary = pr.secondary; } else { delete c.primary; delete c.secondary; }
    colors = c; saveColors(); return;
  }
  if (b.dataset.rreset) { e.preventDefault(); const c = { ...colors }; delete c[b.dataset.rreset]; colors = c; saveColors(); return; }
  const a = b.dataset.pact;
  if (a === 'close') setPanel(false);
  if (a === 'pin') setPinned(!ui.pinned);
  if (a === 'rcolors') { colors = {}; saveColors(); }
  if (a === 'next') { const it = nextWhere(x => x.state === 'none'); if (it) goTo(it.el, true); else toast('Nothing left to answer'); }
  if (a === 'nextno') { const it = nextWhere(x => x.state === 'no'); if (it) goTo(it.el, true); }
  if (a === 'archive') vscode.postMessage({ type: 'archive' });
});
// The colour picker sends a value per mouse move: restyle the page at most once a frame.
let colorQueued = false;
$('#panel').addEventListener('input', e => {
  const role = e.target.dataset && e.target.dataset.role; if (!role) return;
  colors = { ...colors, [role]: e.target.value };
  if (!colorQueued) { colorQueued = true; requestAnimationFrame(() => { colorQueued = false; applyColors(); }); }
});
$('#panel').addEventListener('change', e => {
  if (e.target.dataset.role) { saveColors(); return; }
  const sw = e.target.dataset.sw; if (!sw) return;
  ui[sw] = e.target.checked;
  if (sw === 'foldDone') heads.forEach(h => { if (h.done) setFold(h, ui.foldDone); });
  applyVisibility(); saveUi(); keepView();
});
function setFilter(f) { ui.filter = f; drawPanel(); applyVisibility(); saveUi(); if (findState.q) runFind(false); }

// ── Theme: Auto follows the editor; Light and Dark force the whole panel ─────────────────────────────────────────
function editorIsDark() {
  const c = document.body.classList;
  return c.contains('vscode-dark') || (c.contains('vscode-high-contrast') && !c.contains('vscode-high-contrast-light'));
}
function applyTheme() {
  document.documentElement.dataset.theme = themeSetting === 'auto' ? (editorIsDark() ? 'dark' : 'light') : themeSetting;
}
new MutationObserver(() => { applyTheme(); drawPanel(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// ── Find (Ctrl+F) ────────────────────────────────────────────────────────────────────────────────────────────────
const findIn = $('#findIn');
const findState = { q: '', marks: [], cur: -1, matchCase: false };
function clearFind() {
  findState.marks.forEach(m => { if (m.isConnected) m.replaceWith(document.createTextNode(m.textContent)); });
  content.normalize(); findState.marks = []; findState.cur = -1;
}
function runFind(jump) {
  clearFind();
  const q = findState.q;
  const fc = $('#findCount');
  if (q.length < 2) { fc.textContent = ''; fc.className = 'fc'; return; }
  const needle = findState.matchCase ? q : q.toLowerCase();
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest('button, textarea, .c-ans, .meter, summary span, .docbar') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const hits = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const hay = findState.matchCase ? n.data : n.data.toLowerCase();
    let i = hay.indexOf(needle);
    if (i < 0) continue;
    const spots = [];
    while (i >= 0) { spots.push(i); i = hay.indexOf(needle, i + needle.length); }
    hits.push([n, spots]);
  }
  for (const [n, spots] of hits) {
    let node = n, offset = 0;
    for (const s of spots) {
      const mid = node.splitText(s - offset);
      const rest = mid.splitText(q.length);
      const m = document.createElement('mark'); m.className = 'fm'; m.textContent = mid.data; mid.replaceWith(m);
      findState.marks.push(m); node = rest; offset = s + q.length;
    }
  }
  if (!findState.marks.length) { fc.textContent = 'No results'; fc.className = 'fc none'; return; }
  const mr = main.getBoundingClientRect();
  findState.cur = jump ? Math.max(0, findState.marks.findIndex(m => m.getBoundingClientRect().top >= mr.top)) : -1;
  showFind();
}
function showFind() {
  const fc = $('#findCount'); fc.className = 'fc';
  const n = findState.marks.length;
  fc.textContent = findState.cur >= 0 ? `${findState.cur + 1} of ${n}` : `${n} found`;
  findState.marks.forEach((m, i) => m.classList.toggle('cur', i === findState.cur));
  if (findState.cur >= 0) goTo(findState.marks[findState.cur], false);
}
function stepFind(d) { if (!findState.marks.length) return; findState.cur = (findState.cur + d + findState.marks.length) % findState.marks.length; showFind(); }
let findT = 0;
findIn.addEventListener('input', () => { clearTimeout(findT); findT = setTimeout(() => { findState.q = findIn.value; runFind(true); }, 160); });
findIn.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); if (findState.q !== findIn.value) { findState.q = findIn.value; runFind(true); } else stepFind(e.shiftKey ? -1 : 1); }
  if (e.key === 'Escape') { findIn.value = ''; findState.q = ''; clearFind(); $('#findCount').textContent = ''; findIn.blur(); }
});
$('#findNext').addEventListener('click', () => stepFind(1));
$('#findPrev').addEventListener('click', () => stepFind(-1));
$('#findCase').addEventListener('click', e => { findState.matchCase = !findState.matchCase; e.currentTarget.setAttribute('aria-pressed', String(findState.matchCase)); runFind(true); });

// ── Picture viewer, toast, keys ──────────────────────────────────────────────────────────────────────────────────
function openPic(src) { const lb = $('#lightbox'); lb.querySelector('img').src = src; lb.hidden = false; }
$('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); findIn.focus(); findIn.select(); return; }
  if (e.key === 'Escape') {
    if (!$('#lightbox').hidden) { $('#lightbox').hidden = true; return; }
    if (ui.panel && !ui.pinned && document.activeElement !== findIn) setPanel(false);
  }
});

// ── From the extension ───────────────────────────────────────────────────────────────────────────────────────────
window.addEventListener('message', ({ data: m }) => {
  if (m.type === 'theme') { themeSetting = m.theme; applyTheme(); drawPanel(); return; }
  if (m.type === 'colors') { colors = m.colors || {}; applyColors(); drawPanel(); return; }
  if (m.type !== 'render') return;
  if (first) {
    Object.assign(ui, m.ui || {});
    themeSetting = m.theme || 'auto';
    colors = m.colors || {};
    if (m.tocWidth) setTocWidth(m.tocWidth);
    if (ui.leafTop) leaf.style.setProperty('--leaf-top', ui.leafTop + 'px');
    if (innerWidth <= 900) ui.toc = false;
    $('#app').classList.toggle('toc-off', !ui.toc);
    $('#app').classList.toggle('panel-open', !!ui.panel);
    $('#app').classList.toggle('pinned', !!ui.pinned);
    applyTheme(); applyColors();
  }
  const titleChanged = !doc || doc.title !== m.title;
  doc = m; who = m.who || ''; today = m.today || '';
  items.forEach(it => { if (it.form) forms[it.key] = it.form; });
  stamp(m.outline);
  if (!first && !titleChanged && patch(m.outline)) {
    // Same rows as on the page: the changed ones were drawn again in place, nothing moved. The page's rows are the
    // model now, so the message's own copy of every row is let go.
    doc = { ...m, outline: { title: m.outline.title, pictureMax: m.outline.pictureMax, parts: [] } };
    if (findState.q) runFind(false);
    spy();
    return;
  }
  const anchor = first ? view.scroll : anchorNow();
  build(m.outline);
  drawAll();
  if (findState.q) runFind(false);
  restoreAnchor(anchor);
  first = false;
  spy();
});
applyTheme();
vscode.postMessage({ type: 'ready' });
})();
