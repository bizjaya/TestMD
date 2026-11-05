// The TestMD panel ("Open in TestMD"): the .md rendered with its controls; every answer is written back into the .md.
import * as vscode from 'vscode';
import * as path from 'path';
import { createRenderer } from './core/markdown';
import { applyAnswer, doneable, markDone, readChecklist, stats, Action } from './core/model';
import { settings, userName, today } from './settings';
import { applyTextChange, archiveRound, savePicture } from './files';

interface FromWebview {
  type: 'ready' | 'answer' | 'markDone' | 'open' | 'theme' | 'tocWidth' | 'picture' | 'archive';
  action?: Action;
  line?: number;
  reason?: string;
  images?: string[];
  href?: string;
  value?: string | number;
  id?: string;
  data?: string;
  ext?: string;
}

const TOC_WIDTH_KEY = 'testmd.tocWidth';
type PanelTheme = 'auto' | 'light' | 'dark';
const panelTheme = (): PanelTheme => vscode.workspace.getConfiguration('testmd').get<PanelTheme>('panelTheme', 'auto');

export class ChecklistPanel {
  private static readonly panels = new Map<string, ChecklistPanel>();
  private readonly disposables: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;

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
    const css = ['base.css', 'checklist.css', 'find.css', 'panel.css'].map(n => this.asset(n));
    const links = css.map(u => `<link rel="stylesheet" href="${u}">`).join('\n');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource} https: data: blob:; style-src ${w.cspSource} 'unsafe-inline'; font-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${base}">
${links}
</head><body class="td-panel">
<main id="td-root" class="markdown-body"></main>
<div id="td-bar" role="status"></div>
<script nonce="${nonce}" src="${this.asset('find.js')}"></script>
<script nonce="${nonce}" src="${this.asset('panel.js')}"></script>
</body></html>`;
  }

  private async render(): Promise<void> {
    clearTimeout(this.timer);
    const doc = await vscode.workspace.openTextDocument(this.uri);
    const text = doc.getText();
    const { stepLabels } = settings(this.uri);
    const html = createRenderer({ interactive: true, stepLabels }).render(text);
    const list = readChecklist(text, stepLabels);
    await this.panel.webview.postMessage({
      type: 'render', html, stats: stats(list), doneable: doneable(list),
      theme: panelTheme(), tocWidth: this.context.globalState.get<number>(TOC_WIDTH_KEY),
    });
  }

  private async onMessage(m: FromWebview): Promise<void> {
    try {
      if (m.type === 'ready') return void (await this.render());
      if (m.type === 'open' && m.href) return void (await this.open(m.href));
      if (m.type === 'theme' && (m.value === 'auto' || m.value === 'light' || m.value === 'dark')) {
        return void (await vscode.workspace.getConfiguration('testmd').update('panelTheme', m.value, vscode.ConfigurationTarget.Global));
      }
      if (m.type === 'tocWidth' && typeof m.value === 'number') {
        return void (await this.context.globalState.update(TOC_WIDTH_KEY, m.value));
      }
      if (m.type === 'picture' && m.id && m.data && (m.ext === 'webp' || m.ext === 'png')) {
        const saved = await savePicture(this.uri, m.data, m.ext);
        await this.panel.webview.postMessage({ type: 'pictureSaved', id: m.id, path: saved.relative,
          src: this.panel.webview.asWebviewUri(saved.uri).toString() });
        return;
      }
      if (m.type === 'archive') return void (await archiveRound(this.uri));
      if (m.type === 'answer' && m.action && typeof m.line === 'number') {
        const who = await userName(this.uri);
        const images = (m.images ?? []).filter(s => typeof s === 'string' && !/^[a-z]+:|^\/|\.\./i.test(s));
        await this.edit(text => applyAnswer(text, { action: m.action!, line: m.line!, reason: m.reason, images, who, date: today() },
          settings(this.uri).stepLabels));
      }
      if (m.type === 'markDone' && typeof m.line === 'number') await this.edit(text => markDone(text, m.line!));
    } catch (err) {
      if (m.type === 'picture' && m.id) void this.panel.webview.postMessage({ type: 'pictureFailed', id: m.id });
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
