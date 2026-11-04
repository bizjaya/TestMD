import * as esbuild from 'esbuild';
import { readdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
const test = process.argv.includes('--test');

if (test) {
  await esbuild.build({
    entryPoints: readdirSync('test').filter(f => f.endsWith('.test.ts')).map(f => `test/${f}`),
    outdir: 'out/test', outExtension: { '.js': '.mjs' },
    bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning',
  });
} else {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js',
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'],
    sourcemap: !production, minify: production, logLevel: 'info',
  });
  if (watch) await ctx.watch();
  else { await ctx.rebuild(); await ctx.dispose(); }
}
