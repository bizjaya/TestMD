// Heading anchors the way VS Code's preview and GitHub make them: the heading's text and code (HTML dropped),
// slugged by github-slugger, numbered -1, -2 … when repeated.
import GithubSlugger from 'github-slugger';
import type Token from 'markdown-it/lib/token.mjs';

/** Plain text of an inline token as VS Code builds a heading's text: text and code only. */
export function inlinePlain(token: Token | undefined): string {
  if (!token?.children) return token?.content ?? '';
  return token.children.map(c => (c.type === 'text' || c.type === 'code_inline' ? c.content : '')).join('');
}

/** One slug per heading text, in document order (a repeated text gets -1, -2 …). */
export function slugList(texts: string[]): string[] {
  const slugger = new GithubSlugger();
  return texts.map(t => slugger.slug(t));
}

/** The text each heading_open is slugged from, in document order. */
export function headingTexts(tokens: Token[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) if (tokens[i].type === 'heading_open') out.push(inlinePlain(tokens[i + 1]).trim());
  return out;
}

/** One slug per heading_open, in document order. */
export function headingSlugs(tokens: Token[]): string[] {
  return slugList(headingTexts(tokens));
}
