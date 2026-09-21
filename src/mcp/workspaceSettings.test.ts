import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readWorkspaceImageGenSettings, stripJsonComments } from './workspaceSettings';

const temporaryRoots: string[] = [];

function workspaceWithSettings(contents: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-settings-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, '.vscode'));
  fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), contents, 'utf8');
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('stripJsonComments', () => {
  it('removes line and block comments', () => {
    expect(stripJsonComments('{ // one\n"a": 1 /* two */ }')).toBe('{ \n"a": 1  }');
  });

  it('keeps comment-like sequences inside strings', () => {
    const input = '{"url": "https://example.com/a", "glob": "**/*.ts"}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ url: 'https://example.com/a', glob: '**/*.ts' });
  });

  it('keeps escaped quotes inside strings', () => {
    expect(JSON.parse(stripJsonComments('{"a": "say \\"hi\\""}'))).toEqual({ a: 'say "hi"' });
  });

  it('removes trailing commas', () => {
    expect(JSON.parse(stripJsonComments('{"a": 1,\n}'))).toEqual({ a: 1 });
  });
});

describe('readWorkspaceImageGenSettings', () => {
  it('reads flat imagegen keys from a JSONC settings file', () => {
    const root = workspaceWithSettings('{\n  // provider\n  "imagegen.provider": "flux-2-pro",\n  "editor.tabSize": 2,\n}\n');
    expect(readWorkspaceImageGenSettings(root)).toEqual({ provider: 'flux-2-pro' });
  });

  it('reads the nested spelling', () => {
    const root = workspaceWithSettings('{ "imagegen": { "webpQuality": 65 } }');
    expect(readWorkspaceImageGenSettings(root)).toEqual({ webpQuality: 65 });
  });

  it('lets the nested spelling win over the flat one', () => {
    const root = workspaceWithSettings('{ "imagegen.provider": "flux-2-pro", "imagegen": { "provider": "gpt-image-2" } }');
    expect(readWorkspaceImageGenSettings(root)).toEqual({ provider: 'gpt-image-2' });
  });

  it('returns an empty object when the file is missing or broken', () => {
    expect(readWorkspaceImageGenSettings(path.join(os.tmpdir(), 'imagegen-does-not-exist'))).toEqual({});
    expect(readWorkspaceImageGenSettings(workspaceWithSettings('{ not json'))).toEqual({});
  });
});
