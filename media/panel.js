// TestMD panel: draws the rendered checklist, sends each answer to the extension, keeps your place on every redraw.
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('td-root');
  const bar = document.getElementById('td-bar');
  let openForm = null; // the open No or note box (see showForm)
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
    if (openForm) showForm(openForm.line, openForm.mode, openForm);
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
      `<span class="tmd-theme" role="group" aria-label="Theme">${themes}</span>` +
      '<button class="tmd-archive" data-td-archive title="Copy this round (answers, notes, pictures) to archive/ and clear the checklist">Archive round</button>';
    bar.classList.toggle('td-bar-bad', s.no > 0);
  }

  // ── The box under an item: a No's reason, or a note; both take pasted or dropped pictures ────────────────────
  // openForm = { line, mode: 'no' | 'note', text, pictures: [{ id, path, src, failed }] } — survives a redraw.
  const MAX_SIDE = 1600;

  function showForm(line, mode, keep) {
    root.querySelector('.td-form')?.remove();
    const li = root.querySelector(`li[data-td-line="${line}"]`);
    if (!li) { openForm = null; return; }
    openForm = keep || { line, mode, text: '', pictures: [] };
    const no = openForm.mode === 'no';
    const form = document.createElement('div');
    form.className = `td-form ${no ? 'td-form-no' : 'td-form-note'}`;
    form.innerHTML =
      `<textarea rows="2" placeholder="${no ? 'What did you see instead?' : 'A note for this item'} — paste a picture with Ctrl+V. Ctrl+Enter saves, Esc cancels."></textarea>` +
      '<div class="td-pics"></div>' +
      `<div class="td-form-row"><button class="td-save">${no ? 'Save No' : 'Save note'}</button><button class="td-cancel">Cancel</button>` +
      '<span class="td-form-hint">Pictures are saved beside the checklist and linked from it.</span></div>';
    const ta = form.querySelector('textarea');
    ta.value = openForm.text;
    li.insertBefore(form, li.querySelector(':scope > ul, :scope > ol'));
    drawPictures();
    ta.focus();
    ta.addEventListener('input', () => { openForm.text = ta.value; });
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveForm(); }
      if (e.key === 'Escape') { e.preventDefault(); closeForm(); }
    });
    ta.addEventListener('paste', e => {
      const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      files.forEach(addPicture);
    });
    form.addEventListener('dragover', e => { e.preventDefault(); form.classList.add('td-drop'); });
    form.addEventListener('dragleave', () => form.classList.remove('td-drop'));
    form.addEventListener('drop', e => {
      e.preventDefault();
      form.classList.remove('td-drop');
      [...(e.dataTransfer?.files ?? [])].filter(f => f.type.startsWith('image/')).forEach(addPicture);
    });
  }

  function drawPictures() {
    const box = root.querySelector('.td-form .td-pics');
    if (!box || !openForm) return;
    box.innerHTML = '';
    openForm.pictures.forEach(p => {
      const cell = document.createElement('span');
      cell.className = `td-pic${p.src ? '' : ' td-pic-wait'}${p.failed ? ' td-pic-failed' : ''}`;
      cell.innerHTML = p.src ? `<img src="${p.src}" alt="">` : `<span>${p.failed ? 'not saved' : 'saving…'}</span>`;
      const x = document.createElement('button');
      x.className = 'td-pic-x';
      x.title = 'Leave this picture out';
      x.textContent = '×';
      x.addEventListener('click', ev => {
        ev.preventDefault();
        openForm.pictures = openForm.pictures.filter(q => q !== p);
        drawPictures();
      });
      cell.appendChild(x);
      box.appendChild(cell);
    });
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
    return { data: btoa(bin), ext: blob.type === 'image/webp' ? 'webp' : 'png' };
  }

  async function addPicture(file) {
    if (!openForm) return;
    const p = { id: Math.random().toString(36).slice(2), path: '', src: '', failed: false };
    openForm.pictures.push(p);
    drawPictures();
    try {
      const { data, ext } = await encode(file);
      vscode.postMessage({ type: 'picture', id: p.id, data, ext });
    } catch {
      p.failed = true;
      drawPictures();
    }
  }

  function pictureSaved(msg, ok) {
    const p = openForm?.pictures.find(q => q.id === msg.id);
    if (!p) return;
    if (ok) { p.path = msg.path; p.src = msg.src; } else p.failed = true;
    drawPictures();
  }

  function closeForm() { root.querySelector('.td-form')?.remove(); openForm = null; }

  function saveForm() {
    if (!openForm) return;
    if (openForm.pictures.some(p => !p.src && !p.failed)) return; // still saving a picture
    const reason = openForm.text.trim();
    const images = openForm.pictures.filter(p => p.path).map(p => p.path);
    if ((openForm.mode === 'no' && !reason) || (!reason && !images.length)) {
      root.querySelector('.td-form textarea')?.focus();
      return;
    }
    vscode.postMessage({ type: 'answer', action: openForm.mode, line: openForm.line, reason, images });
    closeForm();
  }

  // ── A picture in the page opens full size ──────────────────────────────────────────────────────────────────────
  function showPicture(src) {
    const box = document.createElement('div');
    box.id = 'td-lightbox';
    box.innerHTML = `<img src="${src}" alt="">`;
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }
  window.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('td-lightbox')?.remove(); });

  document.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const act = t.closest('[data-td-act]');
    if (act) {
      e.preventDefault();
      const line = Number(act.dataset.tdLine);
      if (act.dataset.tdAct === 'no' || act.dataset.tdAct === 'note') { showForm(line, act.dataset.tdAct); return; }
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
    if (t.closest('.td-save')) { e.preventDefault(); saveForm(); return; }
    if (t.closest('[data-td-archive]')) { e.preventDefault(); vscode.postMessage({ type: 'archive' }); return; }
    const img = t.closest('#td-root img');
    if (img && !t.closest('.td-form')) { e.preventDefault(); showPicture(img.src); return; }
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
    if (e.data?.type === 'pictureSaved') pictureSaved(e.data, true);
    if (e.data?.type === 'pictureFailed') pictureSaved(e.data, false);
  });
  vscode.postMessage({ type: 'ready' });
})();
