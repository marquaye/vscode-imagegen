import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { API_KEY_LABELS, API_KEY_NAMES, type ApiKeyName } from '../providers';
import { getConfig } from '../image/config';
import { credentialsFilePath, writeCredentialsFile, type StoredCredentials } from './credentials';
import { readWorkspaceImageGenSettings, stripJsonComments } from './workspaceSettings';

/**
 * Connects external agents — Claude Code, Claude Desktop, Cursor and anything
 * else speaking MCP — to this extension.
 *
 * VS Code's `vscode.lm` tools are only visible to GitHub Copilot Chat, so every
 * other agent has to go through the bundled stdio MCP server. This command
 * removes the manual steps that setup otherwise needs: it finds the server
 * bundle, picks a working Node runtime, exports the keys from SecretStorage to
 * a file the server process can read, and writes the `.mcp.json` entry.
 */

type ConfigScope = 'workspace' | 'user';

interface ServerLaunchConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export async function connectExternalAgents(context: vscode.ExtensionContext): Promise<void> {
  const serverPath = resolveServerPath(context);
  if (!serverPath) {
    void vscode.window.showErrorMessage(
      'ImageGen: MCP server bundle not found at dist/mcp/server.js. Run "bun run build" in the extension directory.',
    );
    return;
  }

  const storedKeys = await readStoredKeys(context);
  const storedKeyNames = API_KEY_NAMES.filter((keyName) => storedKeys[keyName]);
  if (storedKeyNames.length === 0) {
    const setKeys = 'Set API Key';
    const answer = await vscode.window.showWarningMessage(
      'ImageGen: No API key is stored yet. External agents need at least one provider key.',
      setKeys,
    );
    if (answer === setKeys) {
      await vscode.commands.executeCommand('imagegen.setApiKey');
    }
    return;
  }

  const targetFile = credentialsFilePath();
  const exportKeys = 'Export and Connect';
  const confirmed = await vscode.window.showWarningMessage(
    `Export ${storedKeyNames.length === 1 ? 'the stored key' : `${storedKeyNames.length} stored keys`} `
      + `(${storedKeyNames.map((keyName) => API_KEY_LABELS[keyName]).join(', ')}) to ${targetFile}?`,
    {
      modal: true,
      detail: 'External agents run outside VS Code and cannot read SecretStorage. The file is written with '
        + 'owner-only permissions and stays outside your project, so no key ends up in version control. '
        + 'On Windows the file is protected by your user profile permissions rather than a POSIX file mode.',
    },
    exportKeys,
  );
  if (confirmed !== exportKeys) {
    return;
  }

  const credentials: StoredCredentials = {};
  for (const keyName of storedKeyNames) {
    credentials[keyName] = storedKeys[keyName];
  }
  writeCredentialsFile(credentials);

  const nodeOnPath = await hasNodeOnPath();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  // With no folder open there is nowhere to put a project config, so the
  // user-wide registration is the only thing left to offer.
  if (!workspaceFolder) {
    await showUserScopeInstructions(buildLaunchConfig(context, serverPath, 'user', nodeOnPath));
    return;
  }

  const launchConfig = buildLaunchConfig(context, serverPath, 'workspace', nodeOnPath);
  const mcpConfigPath = path.join(workspaceFolder.uri.fsPath, '.mcp.json');
  try {
    writeMcpConfig(mcpConfigPath, launchConfig);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await offerManualConfig(launchConfig, `Could not write ${mcpConfigPath}: ${message}`);
    return;
  }

  const openFile = 'Open .mcp.json';
  const allProjects = 'Use in All Projects';
  const answer = await vscode.window.showInformationMessage(
    'ImageGen: Connected. Restart your agent (Claude Code: reload the window) and approve the "imagegen" server when asked.',
    openFile,
    allProjects,
  );
  if (answer === openFile) {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(mcpConfigPath));
  } else if (answer === allProjects) {
    await showUserScopeInstructions(buildLaunchConfig(context, serverPath, 'user', nodeOnPath));
  }
}

async function showUserScopeInstructions(launchConfig: ServerLaunchConfig): Promise<void> {
  const environmentFlags = Object.entries(launchConfig.env)
    .map(([name, value]) => `--env ${name}=${quoteIfNeeded(value)}`)
    .join(' ');
  const command = `claude mcp add imagegen --scope user ${environmentFlags} -- `
    + `${quoteIfNeeded(launchConfig.command)} ${launchConfig.args.map(quoteIfNeeded).join(' ')}`;

  await vscode.env.clipboard.writeText(command);
  const show = 'Show Command';
  const answer = await vscode.window.showInformationMessage(
    'ImageGen: Keys exported and the registration command copied to your clipboard. Run it in a terminal, then restart your agent.',
    show,
  );
  if (answer === show) {
    const document = await vscode.workspace.openTextDocument({ content: `${command}\n`, language: 'shellscript' });
    await vscode.window.showTextDocument(document);
  }
}

function quoteIfNeeded(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function resolveServerPath(context: vscode.ExtensionContext): string | undefined {
  const serverPath = path.join(context.extensionPath, 'dist', 'mcp', 'server.js');
  return fs.existsSync(serverPath) ? serverPath : undefined;
}

async function readStoredKeys(context: vscode.ExtensionContext): Promise<StoredCredentials> {
  const entries = await Promise.all(
    API_KEY_NAMES.map(async (keyName) => [keyName, await context.secrets.get(keyName)] as const),
  );
  const credentials: StoredCredentials = {};
  for (const [keyName, value] of entries) {
    if (value) {
      credentials[keyName as ApiKeyName] = value;
    }
  }
  return credentials;
}

function buildLaunchConfig(
  context: vscode.ExtensionContext,
  serverPath: string,
  scope: ConfigScope,
  nodeOnPath: boolean,
): ServerLaunchConfig {
  const env: Record<string, string> = {
    IMAGEGEN_EXTENSION_DIR: toPosixPath(context.extensionPath),
  };

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (scope === 'workspace' && workspaceFolder) {
    env.IMAGEGEN_WORKSPACE_DIR = toPosixPath(workspaceFolder.uri.fsPath);

    // Environment variables override `.vscode/settings.json` inside the server,
    // so only pin what that file does not already define. Settings the user
    // edits later then still take effect without re-running this command.
    const workspaceSettings = readWorkspaceImageGenSettings(workspaceFolder.uri.fsPath);
    const config = getConfig();
    if (workspaceSettings.provider === undefined) {
      env.IMAGEGEN_PROVIDER = config.provider;
    }
    if (workspaceSettings.outputDirectory === undefined) {
      env.IMAGEGEN_OUTPUT_DIRECTORY = config.outputDirectory;
    }
  }
  // User scope stays project-agnostic: the server falls back to the agent's
  // working directory and that project's own `.vscode/settings.json`.

  // Prefer a Node on PATH so the config stays portable; fall back to the
  // Electron binary running VS Code, which doubles as Node when asked to.
  if (nodeOnPath) {
    return { command: 'node', args: [toPosixPath(serverPath)], env };
  }
  return {
    command: toPosixPath(process.execPath),
    args: [toPosixPath(serverPath)],
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
  };
}

function hasNodeOnPath(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('node', ['--version'], { timeout: 5000, shell: process.platform === 'win32' }, (error) => {
      resolve(!error);
    });
  });
}

/** Merges the `imagegen` entry into an existing `.mcp.json` without touching other servers. */
function writeMcpConfig(mcpConfigPath: string, launchConfig: ServerLaunchConfig): void {
  let document: Record<string, unknown> = {};
  if (fs.existsSync(mcpConfigPath)) {
    const contents = fs.readFileSync(mcpConfigPath, 'utf8').trim();
    if (contents.length > 0) {
      const parsed: unknown = JSON.parse(stripJsonComments(contents));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Existing .mcp.json does not contain a JSON object.');
      }
      document = parsed as Record<string, unknown>;
    }
  }

  const existingServers = document.mcpServers;
  const servers: Record<string, unknown> =
    typeof existingServers === 'object' && existingServers !== null && !Array.isArray(existingServers)
      ? { ...(existingServers as Record<string, unknown>) }
      : {};
  servers.imagegen = launchConfig;
  document.mcpServers = servers;

  fs.writeFileSync(mcpConfigPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

async function offerManualConfig(launchConfig: ServerLaunchConfig, reason: string): Promise<void> {
  const copyConfig = 'Copy Config';
  const answer = await vscode.window.showWarningMessage(
    `ImageGen: Keys exported, but the config was not written automatically. ${reason}`,
    copyConfig,
  );
  if (answer === copyConfig) {
    await vscode.env.clipboard.writeText(renderConfigSnippet(launchConfig));
  }
}

function renderConfigSnippet(launchConfig: ServerLaunchConfig): string {
  return `${JSON.stringify({ mcpServers: { imagegen: launchConfig } }, null, 2)}\n`;
}

/** Forward slashes survive JSON round-trips on Windows without escaping. */
function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

/** Deletes the exported credentials file; keys stay in SecretStorage. */
export async function revokeExportedCredentials(): Promise<void> {
  const filePath = credentialsFilePath();
  if (!fs.existsSync(filePath)) {
    void vscode.window.showInformationMessage(`ImageGen: No exported credentials found at ${filePath}.`);
    return;
  }

  const remove = 'Delete';
  const confirmed = await vscode.window.showWarningMessage(
    `Delete the exported credentials at ${filePath}?`,
    {
      modal: true,
      detail: 'External agents lose access to your provider keys. The keys stay in VS Code SecretStorage, '
        + 'so the panel and Copilot tools keep working.',
    },
    remove,
  );
  if (confirmed !== remove) {
    return;
  }

  fs.rmSync(filePath, { force: true });
  void vscode.window.showInformationMessage('ImageGen: Exported credentials deleted.');
}
