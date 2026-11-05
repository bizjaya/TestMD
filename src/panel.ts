// The TestMD panel ("Open in TestMD"): the checklist as one table per part, with a contents menu and a progress leaf;
// every answer is written back into the .md.
import * as vscode from 'vscode';
import * as path from 'path';
import { applyAnswer, markDone, renumberPictures, Action, Picture } from './core/model';
import { buildOutline } from './core/outline';
import { panelBody } from './panelHtml';
import { settings, userName, today } from './settings';
import { applyTextChange, archiveRound, deletePicture, savePicture, sweepPictures } from './files';

interface FromWebview {
  type: 'ready' | 'answer' | 'markDone' | 'open' | 'theme' | 'tocWidth' | 'deletePicture' | 'archive' | 'ui' | 'colors';
  action?: Action;
  line?: number;
  reason?: string;
  /** Pictures from the box, written only now that the note or No is saved. */
  pictures?: { label: string; data: string; ext: string }[];
  href?: string;
  path?: string;
  value?: unknown;
}

const TOC_WIDTH_KEY = 'testmd.tocWidth';
const UI_KEY = 'testmd.panelUi';
const COLOR_ROLES = ['primary', 'secondary', 'yes', 'no', 'note', 'mark', 'find', 'test'];
type PanelTheme = 'auto' | 'light' | 'dark';
const config = () => vscode.workspace.getConfiguration('testmd');
const panelTheme = (): PanelTheme => config().get<PanelTheme>('panelTheme', 'auto');

/** The colour setting, keeping only known roles with a #rrggbb value. */
function panelColors(): Record<string, string> {
  const raw = config().get<Record<string, unknown>>('colors', {}) ?? {};
  const out: Record<string, string> = {};
  for (const k of COLOR_ROLES) if (typeof raw[k] === 'string' && /^#[0-9a-f]{6}$/i.test(raw[k] as string)) out[k] = raw[k] as string;
  return out;
}



export class ChecklistPanel {
  private static readonly panels = new Map<string, ChecklistPanel>();
  private readonly disposables: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;
  private swept = false;

  static show(context: vscode.ExtensionContext, uri: vscode.Uri): void {
    const open = ChecklistPanel.panels.get(uri.toString());
    if (open) { open.panel.reveal(vscode.ViewColumn.Beside); return; }
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const roots = [vscode.Uri.joinPath(context.extensionUri, 'media'), vscode.Uri.file(path.dirname(uri.fsPath))];
    if (folder) roots.push(folder.uri);
    const panel = vscode.window.createWebviewPanel('testmd.checklist', `Checklist · ${path.basename(uri.fsPath)}`,
      vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: roots });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    ChecklistPanel.panels.set(uri.toString(), new ChecklistPanel(context, panel, uri));
  }

  private constructor(private readonly context: vscode.ExtensionContext, private readonly panel: vscode.WebviewPanel,
    private readonly uri: vscode.Uri) {
    panel.webview.html = this.shell();
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
    panel.webview.onDidReceiveMessage((m: FromWebview) => this.onMessage(m), null, this.disposables);
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('testmd.panelTheme')) void panel.webview.postMessage({ type: 'theme', theme: panelTheme() });
      if (e.affectsConfiguration('testmd.colors')) void panel.webview.postMessage({ type: 'colors', colors: panelColors() });
      if (e.affectsConfiguration('testmd.stepLabels')) void this.render();
    }, null, this.disposables);
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== uri.toString()) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.render(), 60);
    }, null, this.disposables);
  }

  private dispose(): void {
    ChecklistPanel.panels.delete(this.uri.toString());
    clearTimeout(this.timer);
    this.disposables.forEach(d => d.dispose());
  }

  private asset(name: string): vscode.Uri {
    return this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', name));
  }

  private shell(): string {
    const w = this.panel.webview;
    const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    const base = w.asWebviewUri(vscode.Uri.file(path.dirname(this.uri.fsPath))).toString().replace(/\/?$/, '/');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource} https: data: blob:; style-src ${w.cspSource} 'unsafe-inline'; font-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${base}">
<link rel="stylesheet" href="${this.asset('panel.css')}">
</head><body>
${panelBody()}
<script nonce="${nonce}" src="${this.asset('panel.js')}"></script>
</body></html>`;
  }

  private async render(): Promise<void> {
    clearTimeout(this.timer);
    const doc = await vscode.workspace.openTextDocument(this.uri);
    const outline = buildOutline(doc.getText(), settings(this.uri).stepLabels);
    const folder = vscode.workspace.getWorkspaceFolder(this.uri);
    await this.panel.webview.postMessage({
      type: 'render', outline, title: outline.title || path.basename(this.uri.fsPath),
      file: folder ? path.relative(folder.uri.fsPath, this.uri.fsPath).split(path.sep).join('/') : path.basename(this.uri.fsPath),
      theme: panelTheme(), colors: panelColors(), tocWidth: this.context.globalState.get<number>(TOC_WIDTH_KEY),
      ui: this.context.globalState.get<object>(UI_KEY), who: await userName(this.uri), today: today(),
    });
  }

  private async onMessage(m: FromWebview): Promise<void> {
    try {
      if (m.type === 'ready') {
        if (!this.swept) { this.swept = true; await sweepPictures(this.uri); }
        return void (await this.render());
      }
      if (m.type === 'open' && typeof m.href === 'string') return void (await this.open(m.href));
      if (m.type === 'theme' && (m.value === 'auto' || m.value === 'light' || m.value === 'dark')) {
        return void (await config().update('panelTheme', m.value, vscode.ConfigurationTarget.Global));
      }
      if (m.type === 'colors' && m.value && typeof m.value === 'object') {
        const value: Record<string, string> = {};
        for (const k of COLOR_ROLES) {
          const v = (m.value as Record<string, unknown>)[k];
          if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) value[k] = v.toLowerCase();
        }
        return void (await config().update('colors', Object.keys(value).length ? value : undefined, vscode.ConfigurationTarget.Global));
      }
      if (m.type === 'tocWidth' && typeof m.value === 'number') return void (await this.context.globalState.update(TOC_WIDTH_KEY, m.value));
      if (m.type === 'ui' && m.value && typeof m.value === 'object') return void (await this.context.globalState.update(UI_KEY, m.value));
      if (m.type === 'deletePicture' && typeof m.path === 'string') {
        const choice = await vscode.window.showWarningMessage('Delete this picture?',
          { modal: true, detail: 'It is taken out of its note and deleted from disk. Later pictures move up one number, and the notes follow.' },
          'Delete');
        if (choice === 'Delete') await deletePicture(this.uri, m.path, settings(this.uri).saveAfterEachAnswer, () => this.render());
        return;
      }
      if (m.type === 'archive') return void (await archiveRound(this.uri));
      if (m.type === 'answer' && m.action && typeof m.line === 'number') {
        const who = await userName(this.uri);
        const images: Picture[] = [];
        for (const pic of m.pictures ?? []) {
          if (!/^img\d+$/.test(pic.label) || (pic.ext !== 'webp' && pic.ext !== 'png') || typeof pic.data !== 'string') continue;
          images.push({ label: pic.label, path: (await savePicture(this.uri, pic.data, pic.ext)).relative });
        }
        await this.edit(text => renumberPictures(applyAnswer(text,
          { action: m.action!, line: m.line!, reason: m.reason, images, who, date: today() }, settings(this.uri).stepLabels)));
      }
      if (m.type === 'markDone' && typeof m.line === 'number') await this.edit(text => markDone(text, m.line!));
    } catch (err) {
      void vscode.window.showWarningMessage(`TestMD: ${err instanceof Error ? err.message : String(err)}`);
      await this.render();
    }
  }

  private edit(change: (text: string) => string): Promise<void> {
    return applyTextChange(this.uri, change, settings(this.uri).saveAfterEachAnswer, () => this.render());
  }

  private async open(href: string): Promise<void> {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^file:/i.test(href)) {
      await vscode.env.openExternal(vscode.Uri.parse(href));
      return;
    }
    const [file, frag] = href.split('#');
    const target = file ? vscode.Uri.file(path.resolve(path.dirname(this.uri.fsPath), decodeURIComponent(file))) : this.uri;
    await vscode.commands.executeCommand('vscode.open', target.with({ fragment: frag ?? '' }));
  }
}
