// TestMD in VS Code's own Markdown preview: that preview is read-only, so when the page holds a checklist, say where
// to answer it. The note sits outside <body>, which the preview rewrites on every edit.
(() => {
  'use strict';
  if (window.__testMdPreviewNote) return;
  window.__testMdPreviewNote = true;

  const note = document.createElement('div');
  note.id = 'tmd-note';
  note.hidden = true;
  const icon = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" ' +
    'height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.6 8.2l2.3 2.3 4.6-5" ' +
    'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  note.innerHTML = '<b>Read-only preview.</b> To tick and answer, press <span class="tmd-key">' + icon + '</span> ' +
    '<b>Open in TestMD</b> at the top right of this tab. You answer in the <b>Checklist</b> tab that opens beside it.';
  document.documentElement.appendChild(note);

  const sync = () => { note.hidden = !document.querySelector('li.td-item'); };
  sync();
  window.addEventListener('vscode.markdown.updateContent', sync);
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
})();
