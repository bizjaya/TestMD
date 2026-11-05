// The TestMD panel's page: header, contents, the page itself, the leaf and its panel. No VS Code here, so a browser
// harness can draw the same page.
const ICON = {
  menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  brand: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  fold: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>',
  filter: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>',
  clear: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

export function panelBody(): string {
  return `<div class="app" id="app">
  <header class="hdr">
    <button class="ib" id="burger" type="button" aria-label="Show or hide the contents" aria-expanded="true" title="Contents">${ICON.menu}</button>
    <div class="brand" title="TestMD">${ICON.brand}</div>
    <div class="titles"><h1 id="docTitle"></h1><div class="crumbs" id="crumbs"></div></div>
    <div class="find" role="search">${ICON.search}
      <input id="findIn" type="search" placeholder="Find in this checklist (Ctrl+F)" aria-label="Find in this checklist" autocomplete="off">
      <span class="fc" id="findCount"></span>
      <button id="findCase" type="button" aria-pressed="false" title="Match case">Aa</button>
      <button id="findPrev" type="button" title="Previous (Shift+Enter)">${ICON.up}</button>
      <button id="findNext" type="button" title="Next (Enter)">${ICON.down}</button>
    </div>
    <button class="chip" id="chip" type="button" title="Progress"></button>
  </header>
  <div class="body">
    <nav class="toc" id="toc" aria-label="Contents">
      <div class="toc-top">
        <div class="toc-hd"><span>Contents</span><button class="ib" id="tocFold" type="button" title="Fold every part">${ICON.fold}</button></div>
        <div class="tq">${ICON.filter}
          <input id="tocQ" type="text" placeholder="Filter the contents" aria-label="Filter the contents" autocomplete="off">
          <span class="tqc" id="tocQc"></span>
          <button id="tocQx" type="button" title="Clear (Esc)" hidden>${ICON.clear}</button>
        </div>
        <div class="tseg" role="group" aria-label="Show in the contents"><button type="button" data-tf="all" aria-pressed="true">All</button><button type="button" data-tf="open" aria-pressed="false">Not done</button><button type="button" data-tf="no" aria-pressed="false">With a No</button></div>
      </div>
      <div id="tocTree"></div>
      <div class="toc-empty" id="tocEmpty" hidden>Nothing in the contents matches.</div>
    </nav>
    <div class="split" id="split" title="Drag to resize; double-click to reset"></div>
    <div class="scrim" id="scrim"></div>
    <main id="main"><div class="content" id="content"></div></main>
  </div>
  <button class="leaf" id="leaf" type="button" aria-expanded="false" title="Progress and view (drag to move)"></button>
  <aside class="panel" id="panel" aria-label="Progress and view"></aside>
  <div class="lightbox" id="lightbox" hidden><img alt=""></div>
  <div class="toast" id="toast" role="status"></div>
</div>`;
}
