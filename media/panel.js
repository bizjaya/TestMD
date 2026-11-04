// TestMD panel: draws the rendered checklist, sends each answer to the extension, keeps your place on every redraw.
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('td-root');
  const bar = document.getElementById('td-bar');
  let openForm = null; // { line, text } — a No being written survives a redraw
  let themeSetting = 'auto'; // auto | light | dark

  // ── Theme: Auto follows the editor; Light and Dark force the whole panel, menu included ──────────────────────
  function editorIsDark() {
    const c = document.body.classList;
    return c.contains('vscode-dark') || (c.contains('vscode-high-contrast') && !c.contains('vscode-high-contrast-light'));
  }
  function applyTheme() {
    document.documentElement.dataset.tmdTheme = themeSetting === 'auto' ? (editorIsDark() ? 'dark' : 'light') : themeSetting;
    bar.querySelectorAll('.tmd-theme button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === themeSetting)));
  }
  new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ── The splitter between the menu and the page ───────────────────────────────────────────────────────────────
  const TOC_DEFAULT = 248;
  const split = document.createElement('div');
  split.id = 'tmd-split';
  split.title = 'Drag to resize the menu · double-click to reset';
  split.hidden = true;
  document.body.appendChild(split);
  function setTocWidth(px) {
    const w = Math.round(Math.max(160, Math.min(px, window.innerWidth * 0.6)));
    document.documentElement.style.setProperty('--tmd-toc-w', `${w}px`);
    return w;
  }
  split.addEventListener('pointerdown', e => {
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    split.classList.add('tmd-dragging');
    document.body.classList.add('tmd-resizing');
  });
  split.addEventListener('pointermove', e => { if (split.hasPointerCapture(e.pointerId)) setTocWidth(e.clientX); });
  split.addEventListener('pointerup', e => {
    if (!split.hasPointerCapture(e.pointerId)) return;
    split.releasePointerCapture(e.pointerId);
    split.classList.remove('tmd-dragging');
    document.body.classList.remove('tmd-resizing');
    vscode.postMessage({ type: 'tocWidth', value: setTocWidth(e.clientX) });
  });
  split.addEventListener('dblclick', () => vscode.postMessage({ type: 'tocWidth', value: setTocWidth(TOC_DEFAULT) }));

  function render(msg) {
    const y = window.scrollY;
    if (msg.theme) themeSetting = msg.theme;
    if (msg.tocWidth) setTocWidth(msg.tocWidth);
    if (openForm) openForm.text = root.querySelector('.td-form textarea')?.value ?? openForm.text;
    root.innerHTML = msg.html;
    for (const line of msg.doneable) {
      const h = root.querySelector(`[data-td-hline="${line}"]`);
      if (!h) continue;
      const b = document.createElement('button');
      b.className = 'td-markdone';
      b.textContent = 'Mark test done';
      b.title = 'Every check here is Yes: strike the heading through and add the Done pill';
      b.dataset.tdMarkdone = String(line);
      h.appendChild(b);
    }
    if (openForm) showForm(openForm.line, openForm.text);
    split.hidden = !root.querySelector('.doc-toc');
    drawBar(msg.stats);
    applyTheme();
    window.scrollTo(0, y);
  }

  function drawBar(s) {
    const checks = s.yes + s.no + s.open;
    const parts = [];
    if (checks) parts.push(`<b>${s.yes}</b> Yes · <b class="td-bar-no">${s.no}</b> No · <b>${s.open}</b> to check`);
    if (s.steps) parts.push(`steps <b>${s.ticked}</b> of <b>${s.steps}</b>`);
    const themes = ['auto', 'light', 'dark'].map(v =>
      `<button data-theme="${v}" title="${v === 'auto' ? 'Follow the editor' : `Always ${v}`}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('');
    bar.innerHTML = `<span>${parts.join('<span class="td-bar-sep"></span>') || 'No checklist items in this file'}</span>` +
      `<span class="tmd-theme" role="group" aria-label="Theme">${themes}</span>`;
    bar.classList.toggle('td-bar-bad', s.no > 0);
  }

  function showForm(line, text) {
    root.querySelector('.td-form')?.remove();
    const li = root.querySelector(`li[data-td-line="${line}"]`);
    if (!li) { openForm = null; return; }
    const form = document.createElement('div');
    form.className = 'td-form';
    form.innerHTML = '<textarea rows="2" placeholder="What did you see instead? (Ctrl+Enter saves, Esc cancels)"></textarea>' +
      '<div class="td-form-row"><button class="td-save">Save No</button><button class="td-cancel">Cancel</button></div>';
    const ta = form.querySelector('textarea');
    ta.value = text || '';
    const firstList = li.querySelector(':scope > ul, :scope > ol');
    li.insertBefore(form, firstList);
    openForm = { line, text: ta.value };
    ta.focus();
    ta.addEventListener('input', () => { openForm.text = ta.value; });
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNo(); }
      if (e.key === 'Escape') { e.preventDefault(); closeForm(); }
    });
  }

  function closeForm() { root.querySelector('.td-form')?.remove(); openForm = null; }

  function saveNo() {
    if (!openForm) return;
    const reason = openForm.text.trim();
    if (!reason) { root.querySelector('.td-form textarea')?.focus(); return; }
    vscode.postMessage({ type: 'answer', action: 'no', line: openForm.line, reason });
    closeForm();
  }

  document.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const act = t.closest('[data-td-act]');
    if (act) {
      e.preventDefault();
      const line = Number(act.dataset.tdLine);
      if (act.dataset.tdAct === 'no') { showForm(line, ''); return; }
      vscode.postMessage({ type: 'answer', action: act.dataset.tdAct, line });
      return;
    }
    const theme = t.closest('.tmd-theme button');
    if (theme) {
      themeSetting = theme.dataset.theme;
      applyTheme();
      vscode.postMessage({ type: 'theme', value: themeSetting });
      return;
    }
    const done = t.closest('[data-td-markdone]');
    if (done) { e.preventDefault(); vscode.postMessage({ type: 'markDone', line: Number(done.dataset.tdMarkdone) }); return; }
    if (t.closest('.td-save')) { e.preventDefault(); saveNo(); return; }
    if (t.closest('.td-cancel')) { e.preventDefault(); closeForm(); return; }
    const a = t.closest('a[href]');
    if (a) {
      const href = a.getAttribute('href');
      e.preventDefault();
      if (href.startsWith('#')) {
        const el = document.getElementById(decodeURIComponent(href.slice(1)));
        if (el) el.scrollIntoView({ block: 'start' });
        return;
      }
      vscode.postMessage({ type: 'open', href });
    }
  });

  window.addEventListener('message', e => {
    if (e.data?.type === 'render') render(e.data);
    if (e.data?.type === 'theme') { themeSetting = e.data.theme; applyTheme(); }
  });
  vscode.postMessage({ type: 'ready' });
})();
