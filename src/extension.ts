import * as vscode from 'vscode';
import type MarkdownIt from 'markdown-it';
import { checklistPlugin } from './core/markdown';
import { ChecklistPanel } from './panel';
import { archiveRound } from './files';

/** The file behind VS Code's own preview tab ("Preview x.md" or "[Preview] x.md"), which carries no URI of its own. */
async function previewSource(): Promise<vscode.Uri | undefined> {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!(tab?.input instanceof vscode.TabInputWebview)) return undefined;
  const name = /^(?:\[Preview\]|Preview|Checklist ·)\s+(.+)$/.exec(tab.label)?.[1];
  if (!name) return undefined;
  const same = (u: vscode.Uri) => u.path.split('/').pop() === name;
  const visible = vscode.window.visibleTextEditors.map(e => e.document.uri).find(same);
  if (visible) return visible;
  const open = vscode.workspace.textDocuments.map(d => d.uri).find(u => u.scheme === 'file' && same(u));
  if (open) return open;
  const found = await vscode.workspace.findFiles(`**/${name}`, '**/node_modules/**', 20);
  if (found.length <= 1) return found[0];
  const pick = await vscode.window.showQuickPick(found.map(u => ({ label: vscode.workspace.asRelativePath(u), uri: u })),
    { placeHolder: `Which ${name}?` });
  return pick?.uri;
}

async function targetUri(arg: unknown): Promise<vscode.Uri | undefined> {
  // A tab's button passes that tab's URI: a file for a text editor, a "webview-panel:" URI for VS Code's own preview.
  if (arg instanceof vscode.Uri && arg.scheme === 'file') return arg;
  const doc = vscode.window.activeTextEditor?.document;
  if (doc?.languageId === 'markdown') return doc.uri;
  const fromPreview = await previewSource();
  if (fromPreview) return fromPreview;
  return vscode.window.visibleTextEditors.find(e => e.document.languageId === 'markdown')?.document.uri;
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('testmd.runChecklist', async (arg?: unknown) => {
      const uri = await targetUri(arg);
      if (!uri) {
        void vscode.window.showInformationMessage('TestMD: open a Markdown checklist first.');
        return;
      }
      if (uri.scheme !== 'file') {
        void vscode.window.showInformationMessage('TestMD: save the checklist to a file first.');
        return;
      }
      ChecklistPanel.show(context, uri);
    }),
    vscode.commands.registerCommand('testmd.archiveRound', async (arg?: unknown) => {
      const uri = await targetUri(arg);
      if (!uri || uri.scheme !== 'file') {
        void vscode.window.showInformationMessage('TestMD: open the checklist to archive first.');
        return;
      }
      await archiveRound(uri);
    }),
    vscode.commands.registerCommand('testmd.newChecklist', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
      const target = await vscode.window.showSaveDialog({
        defaultUri: folder ? vscode.Uri.joinPath(folder, 'checklist.md') : undefined,
        filters: { Markdown: ['md'] },
        saveLabel: 'Create checklist',
      });
      if (!target) return;
      const template = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'templates', 'checklist.md'));
      await vscode.workspace.fs.writeFile(target, template);
      await vscode.window.showTextDocument(target);
      ChecklistPanel.show(context, target);
    }),
  );

  // VS Code's own preview draws the same checklist, read-only.
  return {
    extendMarkdownIt(md: MarkdownIt) {
      const stepLabels = vscode.workspace.getConfiguration('testmd').get<string[]>('stepLabels', ['Do', 'Steps']);
      checklistPlugin(md, { interactive: false, stepLabels });
      return md;
    },
  };
}

export function deactivate() {}

// For an integration test run inside VS Code: the file and text operations, without the panel.
export { applyTextChange, deletePicture, savePicture, sweepPictures } from './files';
export { applyAnswer, clearRound, renumberPictures } from './core/model';
