// Everything TestMD writes to disk: line edits to the checklist, pasted pictures beside it, and archived rounds.
import * as vscode from 'vscode';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { archiveFolderName, clearRound } from './core/model';
import { settings, today } from './settings';

const MAX_PICTURE_BYTES = 8 * 1024 * 1024;

/** `docs/ACT.E2ETEST.md` → `docs/ACT.E2ETEST.assets` (the folder name, and its URI). */
export function picturesFolder(doc: vscode.Uri): { name: string; uri: vscode.Uri } {
  const name = `${path.basename(doc.fsPath, path.extname(doc.fsPath))}.assets`;
  return { name, uri: vscode.Uri.file(path.join(path.dirname(doc.fsPath), name)) };
}

/** Write a pasted picture beside the checklist as `<doc>.assets/<GUID>.<ext>`. */
export async function savePicture(doc: vscode.Uri, base64: string, ext: 'webp' | 'png'): Promise<{ relative: string; uri: vscode.Uri }> {
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new Error('The pasted picture was empty.');
  if (bytes.length > MAX_PICTURE_BYTES) throw new Error('That picture is over 8 MB even after shrinking; crop it first.');
  const folder = picturesFolder(doc);
  await vscode.workspace.fs.createDirectory(folder.uri);
  const file = `${randomUUID()}.${ext}`;
  const uri = vscode.Uri.joinPath(folder.uri, file);
  await vscode.workspace.fs.writeFile(uri, bytes);
  return { relative: `${folder.name}/${file}`, uri };
}

/** Replace only the lines that changed, so undo, the cursor and other edits in the file are left alone. */
export async function applyTextChange(uri: vscode.Uri, change: (text: string) => string, save: boolean,
  afterEdit?: () => Promise<void>): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const before = doc.getText();
  const after = change(before);
  if (after === before) return;
  const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1, endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }
  const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const added = b.slice(start, endB + 1).join(eol);
  let range: vscode.Range, text: string;
  if (endA < start) {                       // lines added only
    if (start < a.length) { range = new vscode.Range(start, 0, start, 0); text = added + eol; }
    else { const last = a.length - 1; range = new vscode.Range(last, a[last].length, last, a[last].length); text = eol + added; }
  } else if (endB < start) {                // lines removed only
    range = endA + 1 < a.length
      ? new vscode.Range(start, 0, endA + 1, 0)
      : new vscode.Range(Math.max(start - 1, 0), start > 0 ? a[start - 1].length : 0, endA, a[endA].length);
    text = '';
  } else {                                  // lines changed
    range = new vscode.Range(start, 0, endA, a[endA].length);
    text = added;
  }
  const we = new vscode.WorkspaceEdit();
  we.replace(uri, range, text);
  await vscode.workspace.applyEdit(we);
  if (afterEdit) await afterEdit();
  if (save) await doc.save();
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; }
}

/** Copy the checklist and its pictures to `archive/<doc>-<date>/`, then clear the live checklist for the next round. */
export async function archiveRound(doc: vscode.Uri): Promise<void> {
  const fileName = path.basename(doc.fsPath);
  const docBase = path.basename(doc.fsPath, path.extname(doc.fsPath));
  const archiveRoot = vscode.Uri.file(path.join(path.dirname(doc.fsPath), 'archive'));
  const taken = new Set<string>();
  if (await exists(archiveRoot)) for (const [name] of await vscode.workspace.fs.readDirectory(archiveRoot)) taken.add(name);
  const folderName = archiveFolderName(docBase, today(), n => taken.has(n));

  const choice = await vscode.window.showWarningMessage(
    `Archive this round of ${fileName}?`,
    { modal: true, detail: `A copy with every answer, note and picture goes to archive/${folderName}/. ` +
      'Then every tick, answer, note and picture is cleared from the checklist, ready for the next round. ' +
      'Headings marked done stay.' },
    'Archive and clear');
  if (choice !== 'Archive and clear') return;

  const text = await vscode.workspace.openTextDocument(doc);
  if (text.isDirty) await text.save();
  const target = vscode.Uri.joinPath(archiveRoot, folderName);
  await vscode.workspace.fs.createDirectory(target);
  await vscode.workspace.fs.copy(doc, vscode.Uri.joinPath(target, fileName));
  const pictures = picturesFolder(doc);
  const hadPictures = await exists(pictures.uri);
  if (hadPictures) await vscode.workspace.fs.copy(pictures.uri, vscode.Uri.joinPath(target, pictures.name));

  await applyTextChange(doc, t => clearRound(t, settings(doc).stepLabels), true);
  if (hadPictures) await vscode.workspace.fs.delete(pictures.uri, { recursive: true, useTrash: false });
  void vscode.window.showInformationMessage(`TestMD: archived to archive/${folderName}/ and cleared for the next round.`);
}
