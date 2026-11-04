// TestMD find — Ctrl+F inside VS Code's Markdown preview, the way a browser does it.
// Highlights every match (CSS Custom Highlight API, so the page's DOM is never touched), scrolls the current one into
// the middle of the view (the page or the floating menu), shows "3 of 17". Enter / F3 next, Shift+Enter / Shift+F3 back,
// Esc closes. Matching ignores case unless "Aa" is on, and a space matches any run of white space, as a browser does.
(() => {
  'use strict';
  if (window.__testMdFind) return;
  window.__testMdFind = true;
  if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight !== 'function') return;

  const HL_ALL = 'bzf-all';
  const HL_CUR = 'bzf-cur';
  const MAX_MATCHES = 5000;
  const SEP = '\u0000'; // between blocks: a match never runs from one paragraph into the next
  const INLINE = new Set(['inline', 'inline-block', 'inline-flex', 'inline-grid', 'contents', 'ruby', 'ruby-text']);

  const state = { open: false, query: '', matchCase: false, ranges: [], index: -1 };
  let bar, input, counter, caseBtn, rerunTimer;

  // ── The bar ──────────────────────────────────────────────────────────────────────────────────────────────────
  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (text) node.textContent = text;
    return node;
  }

  function buildBar() {
    bar = el('div', { id: 'bzf-bar', role: 'search', hidden: '' });
    input = el('input', { type: 'text', placeholder: 'Find', 'aria-label': 'Find in page', spellcheck: 'false' });
    counter = el('span', { class: 'bzf-count', 'aria-live': 'polite' });
    caseBtn = el('button', { type: 'button', class: 'bzf-case', title: 'Match case', 'aria-pressed': 'false' }, 'Aa');
    const prev = el('button', { type: 'button', title: 'Previous (Shift+Enter)' }, '↑');
    const next = el('button', { type: 'button', title: 'Next (Enter)' }, '↓');
    const close = el('button', { type: 'button', title: 'Close (Esc)' }, '✕');
    bar.append(input, counter, caseBtn, prev, next, close);
    // Outside <body>: the preview rewrites the body when the file changes; the bar must survive that.
    document.documentElement.appendChild(bar);

    input.addEventListener('input', () => { state.query = input.value; search(true); });
    input.addEventListener('keydown', onInputKey);
    caseBtn.addEventListener('click', () => {
      state.matchCase = !state.matchCase;
      caseBtn.setAttribute('aria-pressed', String(state.matchCase));
      search(true);
      input.focus();
    });
    prev.addEventListener('click', () => { step(-1); input.focus(); });
    next.addEventListener('click', () => { step(1); input.focus(); });
    close.addEventListener('click', closeBar);
  }

  function onInputKey(e) {
    // Keep every key typed here away from the preview host, so copy, paste and undo behave as in any text box.
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'F3') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); closeBar(); }
    else if (isFindKey(e)) { e.preventDefault(); input.select(); }
  }

  function openBar() {
    if (!bar) buildBar();
    const picked = String(window.getSelection() || '').trim();
    if (picked && !picked.includes('\n') && picked.length < 200) input.value = picked;
    bar.hidden = false;
    state.open = true;
    input.focus();
    input.select();
    state.query = input.value;
    search(true);
  }

  function closeBar() {
    if (!bar) return;
    bar.hidden = true;
    state.open = false;
    clearHighlights();
    const cur = state.ranges[state.index];
    if (cur) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(cur); } // leave the match selected
    state.ranges = [];
    state.index = -1;
  }

  // ── Text of the page ─────────────────────────────────────────────────────────────────────────────────────────
  function collectText() {
    const blockOf = new Map();
    const visible = new Map();
    const blockFor = (node) => {
      for (let e = node.parentElement; e; e = e.parentElement) {
        if (!blockOf.has(e)) blockOf.set(e, !INLINE.has(getComputedStyle(e).display));
        if (blockOf.get(e)) return e;
      }
      return document.body;
    };
    const isShown = (parent) => {
      if (!visible.has(parent)) visible.set(parent, parent.checkVisibility ? parent.checkVisibility() : true);
      return visible.get(parent);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || !n.nodeValue) return NodeFilter.FILTER_REJECT;
        if (p.closest('script, style, noscript, #bzf-bar')) return NodeFilter.FILTER_REJECT;
        return isShown(p) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const segs = [];
    let text = '';
    let lastBlock = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const block = blockFor(n);
      if (lastBlock && block !== lastBlock) text += SEP;
      lastBlock = block;
      segs.push({ node: n, start: text.length });
      text += n.nodeValue;
    }
    return { text, segs };
  }

  function pointAt(segs, pos, isEnd) {
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { // last segment that starts at or before pos (for an end, strictly before)
      const mid = (lo + hi + 1) >> 1;
      if (isEnd ? segs[mid].start < pos : segs[mid].start <= pos) lo = mid; else hi = mid - 1;
    }
    return { node: segs[lo].node, offset: pos - segs[lo].start };
  }

  function toPattern(query, matchCase) {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^\\S\\u0000]+');
    return new RegExp(escaped, matchCase ? 'g' : 'gi');
  }

  // ── Search, highlight, scroll ────────────────────────────────────────────────────────────────────────────────
  function search(jump) {
    clearHighlights();
    const anchor = state.ranges[state.index];
    state.ranges = [];
    state.index = -1;
    if (!state.query.trim()) { counter.textContent = ''; return; }

    const { text, segs } = collectText();
    const re = toPattern(state.query, state.matchCase);
    for (let m = re.exec(text); m && state.ranges.length < MAX_MATCHES; m = re.exec(text)) {
      if (!m[0]) { re.lastIndex++; continue; }
      const a = pointAt(segs, m.index, false);
      const b = pointAt(segs, m.index + m[0].length, true);
      const r = document.createRange();
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
      state.ranges.push(r);
    }
    if (!state.ranges.length) { counter.textContent = 'No results'; bar.classList.add('bzf-none'); return; }
    bar.classList.remove('bzf-none');

    // Start from the first match at or below the top of the view (a browser does the same), or near the old one.
    const from = anchor ? anchor.getBoundingClientRect().top : 0;
    const i = state.ranges.findIndex(r => r.getBoundingClientRect().top >= from - 1);
    state.index = i < 0 ? 0 : i;
    CSS.highlights.set(HL_ALL, new Highlight(...state.ranges));
    show(jump);
  }

  function step(dir) {
    if (!state.ranges.length) { search(true); return; }
    state.index = (state.index + dir + state.ranges.length) % state.ranges.length;
    show(true);
  }

  function show(jump) {
    const cur = state.ranges[state.index];
    const hl = new Highlight(cur);
    hl.priority = 1;
    CSS.highlights.set(HL_CUR, hl);
    counter.textContent = `${state.index + 1} of ${state.ranges.length}${state.ranges.length >= MAX_MATCHES ? '+' : ''}`;
    if (jump) scrollToRange(cur);
  }

  function scroller(node) {
    for (let e = node.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const oy = getComputedStyle(e).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight) return e;
    }
    return null;
  }

  function scrollToRange(range) {
    const box = scroller(range.startContainer);
    const r = range.getBoundingClientRect();
    if (box) {
      const b = box.getBoundingClientRect();
      box.scrollTop += (r.top - b.top) - (box.clientHeight / 2);
      return;
    }
    window.scrollBy(0, r.top - window.innerHeight / 2);
  }

  function clearHighlights() {
    CSS.highlights.delete(HL_ALL);
    CSS.highlights.delete(HL_CUR);
  }

  // The preview re-renders while you edit the .md: search again so the highlights follow the new text.
  new MutationObserver((records) => {
    if (!state.open || !state.query.trim()) return;
    if (records.every(r => bar && bar.contains(r.target))) return;
    clearTimeout(rerunTimer);
    rerunTimer = setTimeout(() => search(false), 250);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // ── Keys ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function isFindKey(e) {
    return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F');
  }

  // Capture phase on window runs before the preview host's own listener, so stopping here keeps VS Code's find box shut.
  window.addEventListener('keydown', (e) => {
    if (isFindKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); openBar(); return; }
    if (!state.open) return;
    const nextKey = e.key === 'F3' || ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G'));
    if (nextKey) { e.preventDefault(); e.stopImmediatePropagation(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeBar(); }
  }, true);
})();
