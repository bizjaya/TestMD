// Heading anchors the way VS Code's preview and GitHub make them: the heading's text and code (HTML dropped),
// slugged by github-slugger, numbered -1, -2 … when repeated.
import GithubSlugger from 'github-slugger';
import type Token from 'markdown-it/lib/token.mjs';

/** Plain text of an inline token as VS Code builds a heading's text: text and code only. */
export function inlinePlain(token: Token | undefined): string {
  if (!token?.children) return token?.content ?? '';
  return token.children.map(c => (c.type === 'text' || c.type === 'code_inline' ? c.content : '')).join('');
}

/** One slug per heading_open, in document order. */
export function headingSlugs(tokens: Token[]): string[] {
  const slugger = new GithubSlugger();
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') out.push(slugger.slug(inlinePlain(tokens[i + 1]).trim()));
  }
  return out;
}
