// The "Run Checklist" panel: the .md rendered with its controls; every answer is written back into the .md.
import * as vscode from 'vscode';
import * as path from 'path';
import { createRenderer } from './core/markdown';
import { applyAnswer, doneable, markDone, readChecklist, stats, Action } from './core/model';
import { settings, userName, today } from './settings';

interface FromWebview {
  type: 'ready' | 'answer' | 'markDone' | 'open';
  action?: Action;
  line?: number;
  reason?: string;
  href?: string;
}

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
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== uri.toString()) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.render(), 150);
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

  /** The workspace's own Markdown stylesheets ("markdown.styles"), so a doc looks as it does in VS Code's preview. */
  private userStyles(): vscode.Uri[] {
    const styles = vscode.workspace.getConfiguration('markdown', this.uri).get<string[]>('styles') ?? [];
    const folder = vscode.workspace.getWorkspaceFolder(this.uri);
    return styles.filter(s => !/^https?:/i.test(s)).map(s => {
      const abs = path.isAbsolute(s) ? s : path.join(folder ? folder.uri.fsPath : path.dirname(this.uri.fsPath), s);
      return this.panel.webview.asWebviewUri(vscode.Uri.file(abs));
    });
  }

  private shell(): string {
    const w = this.panel.webview;
    const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    const base = w.asWebviewUri(vscode.Uri.file(path.dirname(this.uri.fsPath))).toString().replace(/\/?$/, '/');
    const css = ['base.css', 'checklist.css', 'find.css', 'panel.css'].map(n => this.asset(n));
    const links = [...css, ...this.userStyles()].map(u => `<link rel="stylesheet" href="${u}">`).join('\n');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource} https: data:; style-src ${w.cspSource} 'unsafe-inline'; font-src ${w.cspSource}; script-src 'nonce-${nonce}';">
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
    const doc = await vscode.workspace.openTextDocument(this.uri);
    const text = doc.getText();
    const { stepLabels } = settings(this.uri);
    const html = createRenderer({ interactive: true, stepLabels }).render(text);
    const list = readChecklist(text, stepLabels);
    await this.panel.webview.postMessage({ type: 'render', html, stats: stats(list), doneable: doneable(list) });
  }

  private async onMessage(m: FromWebview): Promise<void> {
    try {
      if (m.type === 'ready') return void (await this.render());
      if (m.type === 'open' && m.href) return void (await this.open(m.href));
      if (m.type === 'answer' && m.action && typeof m.line === 'number') {
        const who = await userName(this.uri);
        await this.edit(text => applyAnswer(text, { action: m.action!, line: m.line!, reason: m.reason, who, date: today() },
          settings(this.uri).stepLabels));
      }
      if (m.type === 'markDone' && typeof m.line === 'number') await this.edit(text => markDone(text, m.line!));
    } catch (err) {
      void vscode.window.showWarningMessage(`TestMD: ${err instanceof Error ? err.message : String(err)}`);
      await this.render();
    }
  }

  /** Replace only the lines that changed, so undo, the cursor and other edits in the file are left alone. */
  private async edit(change: (text: string) => string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(this.uri);
    const before = doc.getText();
    const after = change(before);
    if (after === before) return;
    const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length - 1, endB = b.length - 1;
    while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }
    const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const range = endA >= start
      ? new vscode.Range(start, 0, endA, a[endA].length)
      : new vscode.Range(start, 0, start, 0);
    const inserted = b.slice(start, endB + 1).join(eol) + (endA >= start ? '' : eol);
    const we = new vscode.WorkspaceEdit();
    we.replace(this.uri, range, inserted);
    await vscode.workspace.applyEdit(we);
    if (settings(this.uri).saveAfterEachAnswer) await doc.save();
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
