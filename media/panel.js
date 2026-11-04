// TestMD panel: draws the rendered checklist, sends each answer to the extension, keeps your place on every redraw.
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('td-root');
  const bar = document.getElementById('td-bar');
  let openForm = null; // { line, text } — a No being written survives a redraw

  function render(msg) {
    const y = window.scrollY;
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
    drawBar(msg.stats);
    window.scrollTo(0, y);
  }

  function drawBar(s) {
    const checks = s.yes + s.no + s.open;
    const parts = [];
    if (checks) parts.push(`<b>${s.yes}</b> Yes · <b class="td-bar-no">${s.no}</b> No · <b>${s.open}</b> to check`);
    if (s.steps) parts.push(`steps <b>${s.ticked}</b> of <b>${s.steps}</b>`);
    bar.innerHTML = parts.join('<span class="td-bar-sep"></span>') || 'No checklist items in this file';
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

  window.addEventListener('message', e => { if (e.data?.type === 'render') render(e.data); });
  vscode.postMessage({ type: 'ready' });
})();
