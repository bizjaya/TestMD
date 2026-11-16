// A long checklist read a piece at a time: the text cut at its "#" and "##" headings, so a change re-reads only the
// piece it falls in. Pure functions on text: no VS Code here.

/** The lines as markdown-it counts them (it breaks on \r\n, \r and \n alike). */
export function splitLines(text: string): string[] {
  return text.split(/\r\n?|\n/);
}

/** Lines [a, b) as one text for markdown-it, ending with the line break that followed it in the whole text. */
export function chunkText(lines: string[], a: number, b: number): string {
  return lines.slice(a, b).join('\n') + (b < lines.length ? '\n' : '');
}

const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CLOSE_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const PART_HEADING = /^#{1,2}(?:[ \t]|$)/;

/**
 * Where a piece may start: line 0, then every "# " or "## " line at column 0 outside a fenced code block. Only a guess:
 * the outline checks each cut against what markdown-it read (a heading inside an HTML block, say) and joins the
 * pieces on both sides of a cut it rejects.
 */
export function candidateStarts(lines: string[]): number[] {
  const out = [0];
  let fence: { ch: string; len: number } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      const m = CLOSE_FENCE.exec(line);
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len) fence = undefined;
      continue;
    }
    const m = OPEN_FENCE.exec(line);
    if (m && !(m[1][0] === '`' && m[2].includes('`'))) { fence = { ch: m[1][0], len: m[1].length }; continue; }
    if (i > 0 && PART_HEADING.test(line)) out.push(i);
  }
  return out;
}

// The checked cuts of the texts the outline was last built from, so an answer re-reads only the piece holding its line.
const KEEP = 2;
const known: { text: string; starts: number[] }[] = [];

/** Remember the checked starts of a text's pieces (each one a top-level heading markdown-it read as such). */
export function rememberStarts(text: string, starts: number[]): void {
  const at = known.findIndex(k => k.text === text);
  if (at >= 0) known.splice(at, 1);
  known.unshift({ text, starts });
  known.length = Math.min(known.length, KEEP);
}

/** The piece holding `line` in a text whose cuts are known: lines [start, end). Undefined for a text not seen. */
export function knownChunkAt(text: string, line: number, lineCount: number): { start: number; end: number } | undefined {
  const k = known.find(x => x.text === text);
  if (!k) return undefined;
  let lo = 0, hi = k.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (k.starts[mid] <= line) lo = mid; else hi = mid - 1;
  }
  return { start: k.starts[lo], end: k.starts[lo + 1] ?? lineCount };
}
