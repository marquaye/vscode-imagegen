# ImageGen for VS Code

ImageGen gives VS Code agents a native image generation capability inside your editor.

Before this extension, Copilot agents could write and edit code but could not natively generate project images as part of the same workflow. ImageGen adds that missing capability as a first-class tool, so agents can generate, optimize, and insert images directly into your repo. It also includes a manual UI for direct image generation and editing when you want full control.

In short: ImageGen turns image generation into a native VS Code skill for both agents and humans.

## Supported Providers

| Provider | Model |
|----------|-------|
| Google | Nano Banana 2 (Gemini 3.1 Flash Image Preview) |
| Google | Nano Banana Pro (Gemini 3 Pro Image) |
| OpenAI | GPT Image 2 (high) |
| OpenAI | GPT Image 1.5 (high) |
| Black Forest Labs | FLUX.2 [max] (via OpenRouter) |
| Black Forest Labs | FLUX.2 [pro] (via OpenRouter) |
| ByteDance Seed | Seedream 4.0 (via OpenRouter) |

## Features

- **Native Agent Image Skill in VS Code:** Copilot can autonomously call ImageGen tools to generate and edit images during normal coding/chat flows.
- **GitHub Copilot Integration:** Ask Copilot to generate an image for your markdown files or blog posts, and it will invoke the ImageGen tool to create, compress, and insert the image path.
- **Temporary Agent Outputs:** Agents can optionally save disposable images into the OS temp folder instead of the workspace, which avoids leaving unused artifacts in your repo.
- **Image Editing from Chat:** Provide an existing image (workspace path, URL, data URL, or Markdown image snippet) plus an edit instruction, and Copilot can transform it with GenAI.
- **Call Metrics for Agents:** Tool responses include provider call duration so agents can reason about performance tradeoffs.
- **Multi-Provider Support:** Choose from seven leading image generation models with different visual strengths.
- **Manual Generation/Edit View:** A dedicated webview UI to write prompts, choose a provider, adjust settings, and generate or edit images manually.
- **Automatic WebP Compression:** All generated images are processed via a WebAssembly (WASM) encoder and saved as highly optimized `.webp` files to keep your project lightweight and web-ready.
- **Embedded Prompt Metadata:** Saved `.webp` files include XMP metadata with the prompt, provider, aspect ratio, and generation timestamp by default, so downstream tools can inspect how an image was created.
- **Secure API Key Storage:** Your API keys are safely stored in your operating system's native credential manager (via VS Code SecretStorage), never in plain text configuration files.

## Requirements

You need API keys for the providers you want to use:

- **Google Gemini models** → [Google AI Studio](https://aistudio.google.com/app/apikey)
- **OpenAI GPT Image** → [OpenAI Platform](https://platform.openai.com/api-keys)
- **BFL FLUX.2 + Seedream** → [OpenRouter](https://openrouter.ai/keys) (one key covers all three)

## Performance & Resource Safety

- Network provider calls use retry with request timeouts to avoid hanging operations.
- Manual/chat image editing enforces an input image size limit (default 12 MB).
- Extremely large decoded image resolutions are rejected to prevent high memory/CPU spikes during WebP encoding.

Both timeout and input-size limits are configurable via extension settings.

## Getting a Gemini API Key (Google AI Studio)

Google AI Studio lets you create an API key for Gemini models.

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and sign in with a Google account.
2. Click **Create API key**, then select an existing Google Cloud project or create a new one.
3. Copy the generated key and store it in ImageGen via `ImageGen: Set API Key` → **Gemini**.

## Getting an OpenRouter API Key

[OpenRouter](https://openrouter.ai) is a unified API gateway that gives you access to hundreds of models — including the FLUX.2 and Seedream models supported by ImageGen — through a single key and a single billing account.

1. Visit [openrouter.ai](https://openrouter.ai) and sign up or log in.
2. Navigate to **Keys** (or go directly to [openrouter.ai/keys](https://openrouter.ai/keys)) and click **Create key**.
3. Give the key a name (e.g. `imagegen-vscode`), set an optional spend limit, and click **Create**.
4. Copy the key and store it in ImageGen via `ImageGen: Set API Key` → **OpenRouter**.

One OpenRouter key covers all OpenRouter-backed providers in ImageGen (FLUX.2 [max], FLUX.2 [pro], and Seedream 4.0).

## Usage

### 1. Setup
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
```
ImageGen: Set API Key
```
Select which provider key to configure, then paste your key into the secure input box. Repeat for each provider you want to use.
Keys are stored securely using VS Code SecretStorage (OS credential vault), not in workspace files or settings.

### 2. Using with GitHub Copilot (Agent Workflow)
Open GitHub Copilot Chat (`Ctrl+Alt+I`) and prompt the agent:
> *"Write a short introduction for a blog post about TypeScript. Then use your image generation tool to create a futuristic header image for it."*

Copilot will invoke the `#generateImage` tool, generate the image, save it as `.webp`, and return a Markdown image link plus call metrics (API duration).

This is the core UVP: image generation is now a native tool in the agent workflow, not an external app or manual copy/paste step.

If you want a disposable output that should not remain in the repo, ask the agent to use `saveMode: "temporary"`. In that mode, the file is written under the OS temp directory instead of a workspace folder.

### 3. Editing Existing Images in Copilot Chat
You can also transform an existing image in chat using the `#editImage` tool.

Example prompt:
> *"Use your image editing tool to take `assets/images/header.webp`, keep the same subject, and make it cyberpunk with neon blue lighting."*

Accepted `inputImage` formats:
- Workspace-relative path: `assets/images/header.webp`
- Absolute path: `C:/Users/you/Pictures/header.png`
- URL: `https://example.com/image.png`
- Data URL: `data:image/png;base64,...`
- Markdown image snippet: `![alt](assets/images/header.webp)`

Current provider support for image editing:
- ✅ Gemini (Nano Banana 2 / Nano Banana Pro)
- ✅ OpenAI (GPT Image 2 / GPT Image 1.5)
- ❌ OpenRouter-backed models in this extension currently support text-to-image only

### 4. Using the Manual View
Run the command `ImageGen: Open in Editor Panel` to launch the UI.

- **Generate mode:** Select your provider, enter a detailed prompt, adjust WebP quality/aspect ratio, and click **Generate Image**.
- **Edit mode:** Switch **Mode** to **Edit existing image**, provide input image (path, URL, markdown image snippet, data URL, or upload a local file), add edit instructions, and click **Edit Image**.

After a result appears in the editor panel, click **Inspect Metadata** to open the embedded prompt metadata for that output image.

Once the preview appears, click **Insert into Active Editor** to place the Markdown link at your cursor.

If no workspace folder is open, generated images are saved to a local fallback directory:
- Windows: `%USERPROFILE%/Pictures/ImageGen` (or `%USERPROFILE%/ImageGen` if `Pictures` is unavailable)
- macOS/Linux: `$HOME/Pictures/ImageGen` (or `$HOME/ImageGen` if `Pictures` is unavailable)

In multi-root workspaces, persistent saves now target the workspace folder of the last active editor when possible, instead of always using the first workspace folder.

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `imagegen.provider` | `gemini-3.1-flash-image-preview` | The image generation provider to use |
| `imagegen.outputDirectory` | `assets/images` | Workspace-relative folder for saved images |
| `imagegen.webpQuality` | `80` | WebP quality for Copilot tool (0–100) |
| `imagegen.requestTimeoutMs` | `45000` | Per-request timeout in ms for provider API calls |
| `imagegen.maxInputImageMB` | `12` | Max input image size in MB for edit operations |
| `imagegen.embedPromptMetadata` | `true` | Embed prompt details as XMP metadata in saved WebP files |

## MCP Server (Claude and Other Agents)

ImageGen includes a stdio MCP server for agents outside VS Code. It exposes two tools:

- `generate_image`: Generate and save an optimized WebP image.
- `edit_image`: Edit a local image path, URL, data URL, or Markdown image snippet, then save the optimized WebP result.

Build the server from this repository:

```bash
bun install
bun run build
```

The server gets provider credentials from environment variables rather than VS Code SecretStorage:

| Provider | Environment variable |
|----------|----------------------|
| Gemini | `GEMINI_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

For Claude Desktop on Windows, add the following server to `%APPDATA%/Claude/claude_desktop_config.json`, adjusting paths and credentials for your machine:

```json
{
	"mcpServers": {
		"imagegen": {
			"command": "node",
			"args": ["D:/Projects/vscode-imagegen/dist/mcp/server.js"],
			"env": {
				"GEMINI_API_KEY": "your-key",
				"IMAGEGEN_WORKSPACE_DIR": "D:/Projects/my-project"
			}
		}
	}
}
```

Claude Code can use the same executable through its MCP configuration:

```json
{
	"mcpServers": {
		"imagegen": {
			"command": "node",
			"args": ["D:/Projects/vscode-imagegen/dist/mcp/server.js"],
			"env": {
				"GEMINI_API_KEY": "your-key",
				"IMAGEGEN_WORKSPACE_DIR": "D:/Projects/my-project"
			}
		}
	}
}
```

`IMAGEGEN_WORKSPACE_DIR` controls the base directory for persistent outputs and relative input-image paths. It defaults to the MCP process working directory. Optional configuration variables mirror the extension defaults: `IMAGEGEN_PROVIDER`, `IMAGEGEN_OUTPUT_DIRECTORY`, `IMAGEGEN_WEBP_QUALITY`, `IMAGEGEN_REQUEST_TIMEOUT_MS`, `IMAGEGEN_MAX_INPUT_IMAGE_MB`, and `IMAGEGEN_EMBED_PROMPT_METADATA` (`false` disables metadata). Use `saveMode: "temporary"` on either tool to write under the OS temporary directory instead.

## Prompt Metadata

By default, ImageGen writes XMP metadata into each saved `.webp` file with these fields:

- Prompt text
- Provider ID
- Aspect ratio
- Operation type (`imagegen` or `imageedit`)
- Generation timestamp

This makes it possible for another tool or LLM pipeline to inspect the image file itself and recover the original prompt context. If your prompts may contain secrets or internal text, disable `imagegen.embedPromptMetadata`.

The metadata is stored in the WebP container, so tools need to read WebP XMP metadata specifically. An LLM cannot discover it on its own unless the surrounding application passes the file bytes or extracted metadata into the model.

To inspect a saved image inside VS Code, run `ImageGen: Inspect Image Metadata` or right-click a `.webp` file in the Explorer and choose the same command. If a `.webp` file is already open in the editor, the command uses that file automatically.

## Extension Commands

| Command | Description |
|---------|-------------|
| `ImageGen: Set API Key` | Securely store or update an API key |
| `ImageGen: Open in Editor Panel` | Open the manual image generation interface |
| `ImageGen: Run Health Check` | Validate key presence, output directory write access, and provider endpoint reachability |
| `ImageGen: Inspect Image Metadata` | Open the parsed prompt metadata embedded in a saved `.webp` file |

## Development

This extension uses WebAssembly (WASM) for cross-platform image compression and [Bun](https://bun.sh) as the package manager and bundler.

```bash
# Install dependencies
bun install

# Build the extension
bun run build

# Watch mode during development
bun run watch
```

Press `F5` in VS Code to launch the Extension Development Host. The build step runs automatically via `vscode:prepublish`.
