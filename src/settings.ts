import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';

export interface Settings { userName: string; saveAfterEachAnswer: boolean; stepLabels: string[]; }

export function settings(uri: vscode.Uri): Settings {
  const c = vscode.workspace.getConfiguration('testmd', uri);
  return {
    userName: c.get<string>('userName', '').trim(),
    saveAfterEachAnswer: c.get<boolean>('saveAfterEachAnswer', true),
    stepLabels: c.get<string[]>('stepLabels', ['Do', 'Steps']),
  };
}

const gitNames = new Map<string, Promise<string>>();

function gitUserName(dir: string): Promise<string> {
  if (!gitNames.has(dir)) {
    gitNames.set(dir, new Promise(resolve => {
      execFile('git', ['config', 'user.name'], { cwd: dir, timeout: 3000 }, (err, out) => resolve(err ? '' : out.trim()));
    }));
  }
  return gitNames.get(dir)!;
}

/** The name written on a No: the setting, else git's user.name, else the login name. */
export async function userName(uri: vscode.Uri): Promise<string> {
  const set = settings(uri).userName;
  if (set) return set;
  const git = await gitUserName(path.dirname(uri.fsPath));
  if (git) return git;
  try { return os.userInfo().username; } catch { return 'someone'; }
}

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
