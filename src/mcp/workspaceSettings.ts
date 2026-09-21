import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads `imagegen.*` values out of a workspace `.vscode/settings.json` so the
 * MCP server behaves like the extension panel instead of silently falling back
 * to its own defaults. Environment variables still win over these values.
 */
export function readWorkspaceImageGenSettings(workspaceRoot: string): Record<string, unknown> {
  const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
  let contents: string;
  try {
    contents = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(contents));
  } catch {
    // A broken settings file must not take the MCP server down — the agent
    // still works on defaults.
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }

  const record = parsed as Record<string, unknown>;
  const settings: Record<string, unknown> = {};

  // Both the flat (`"imagegen.provider"`) and nested (`"imagegen": { ... }`)
  // spellings occur in real settings files.
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('imagegen.')) {
      settings[key.slice('imagegen.'.length)] = value;
    }
  }
  const nested = record.imagegen;
  if (typeof nested === 'object' && nested !== null) {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      settings[key] = value;
    }
  }

  return settings;
}

/** Strips `//` and block comments plus trailing commas from JSONC text. */
export function stripJsonComments(input: string): string {
  let output = '';
  let index = 0;
  let inString = false;

  while (index < input.length) {
    const char = input[index];

    if (inString) {
      output += char;
      if (char === '\\') {
        output += input[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      index += 1;
      continue;
    }

    if (char === '/' && input[index + 1] === '/') {
      while (index < input.length && input[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (char === '/' && input[index + 1] === '*') {
      index += 2;
      while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }

    output += char;
    index += 1;
  }

  return output.replace(/,(\s*[}\]])/g, '$1');
}
