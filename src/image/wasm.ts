import * as fs from 'fs';
import * as path from 'path';
import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode';
import { simd } from 'wasm-feature-detect';

let wasmInitialized = false;

export async function initWasm(extensionPath: string): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  // Load WASM bytes from disk and compile directly in extension host.
  const encoderFile = (await simd()) ? 'webp_enc_simd.wasm' : 'webp_enc.wasm';
  const encWasmPath = path.join(
    extensionPath,
    'node_modules',
    '@jsquash',
    'webp',
    'codec',
    'enc',
    encoderFile,
  );

  if (!fs.existsSync(encWasmPath)) {
    throw new Error(`ImageGen: WebP encoder WASM not found at ${encWasmPath}`);
  }

  const wasmBytes = fs.readFileSync(encWasmPath);
  const wasmApi = (globalThis as unknown as { WebAssembly: { compile: (bytes: Buffer) => Promise<unknown> } }).WebAssembly;
  const wasmModule = await wasmApi.compile(wasmBytes);
  await initWebpEncode(wasmModule);

  wasmInitialized = true;
}

export function assertWasmInitialized(): void {
  if (!wasmInitialized) {
    throw new Error('ImageGen: WASM encoder has not been initialized. Please reload the window.');
  }
}

export { encodeWebp };
