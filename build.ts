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

let buildInProgress = false;
let rebuildQueued = false;

async function queueBuild(): Promise<void> {
  if (buildInProgress) {
    rebuildQueued = true;
    return;
  }

  buildInProgress = true;
  try {
    do {
      rebuildQueued = false;
      await runBuild();
    } while (rebuildQueued);
  } finally {
    buildInProgress = false;
  }
}

if (isWatch) {
  const { watch } = await import('fs');
  await queueBuild();
  console.log('Watching src/ for changes...');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  watch('./src', { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith('.ts')) {
      return;
    }

    if (filename.includes('dist/') || filename.includes('dist\\')) {
      return;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      console.log(`  Changed: ${filename}`);
      void queueBuild();
    }, 140);
  });
} else {
  await queueBuild();
}
