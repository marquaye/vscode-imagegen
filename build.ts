import { build, type BuildConfig } from 'bun';
import { mkdirSync } from 'fs';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

// @jsquash/webp and wasm-feature-detect are kept external so they run directly
// from node_modules — this lets the Emscripten modules resolve their own .wasm
// files using relative paths without any copy step.
const config: BuildConfig = {
  entrypoints: ['./src/extension.ts'],
  outdir: './dist',
  target: 'node',
  format: 'cjs',
  external: ['vscode', '@jsquash/webp', '@jsquash/webp/encode', '@jsquash/webp/decode', 'wasm-feature-detect'],
  sourcemap: isProduction ? 'none' : 'linked',
  minify: isProduction,
};

async function runBuild(): Promise<void> {
  mkdirSync('./dist', { recursive: true });
  console.log(`\nBuilding extension (${isProduction ? 'production' : 'development'})...`);
  const result = await build(config);

  if (result.success) {
    console.log(`  Bundled → dist/extension.js`);
    console.log('  Build complete.\n');
  } else {
    console.error('  Build failed:');
    for (const log of result.logs) {
      console.error('  ', log);
    }
    process.exit(1);
  }
}

if (isWatch) {
  const { watch } = await import('fs');
  await runBuild();
  console.log('Watching src/ for changes...');
  watch('./src', { recursive: true }, async (_event, filename) => {
    if (filename?.endsWith('.ts')) {
      console.log(`  Changed: ${filename}`);
      await runBuild();
    }
  });
} else {
  await runBuild();
}
