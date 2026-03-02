# ImageGen for VS Code

Generate and insert optimized images directly into your workspace using multiple state-of-the-art AI image generation models. Fully integrated with GitHub Copilot Chat for a seamless, AI-driven developer workflow.

## Supported Providers

| # | Provider | Model | Cost |
|---|----------|-------|------|
| ⭐ | Google | Nano Banana 2 (Gemini 3.1 Flash Image Preview) | $67/1k imgs |
| | Google | Nano Banana Pro (Gemini 3 Pro Image) | $134/1k imgs |
| | OpenAI | GPT Image 1.5 (high) | $133/1k imgs |
| | Black Forest Labs | FLUX.2 [max] (via OpenRouter) | $70/1k imgs |
| | Black Forest Labs | FLUX.2 [pro] (via OpenRouter) | $30/1k imgs |
| | ByteDance Seed | Seedream 4.0 (via OpenRouter) | $30/1k imgs |

## Features

- **GitHub Copilot Integration:** Ask Copilot to generate an image for your markdown files or blog posts, and it will autonomously invoke the ImageGen tool to create, compress, and insert the image path.
- **Image Editing from Chat:** Provide an existing image (workspace path, URL, data URL, or Markdown image snippet) plus an edit instruction, and Copilot can transform it with GenAI.
- **Call Metrics for Agents:** Tool responses include provider call duration and per-image cost estimate so agents can reason about speed/cost tradeoffs.
- **Multi-Provider Support:** Choose from six leading image generation models, each with different cost and quality tradeoffs.
- **Manual Generation Panel:** A dedicated Webview UI to write prompts, choose a provider, adjust quality settings, and generate images manually.
- **Automatic WebP Compression:** All generated images are processed via a WebAssembly (WASM) encoder and saved as highly optimized `.webp` files to keep your project lightweight and web-ready.
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

## Getting a Free Gemini API Key (Google AI Studio)

Google offers a **free tier** for Gemini APIs through AI Studio — no credit card required to get started.

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and sign in with a Google account.
2. Click **Create API key**, then select an existing Google Cloud project or create a new one.
3. Copy the generated key and store it in ImageGen via `ImageGen: Set API Key` → **Gemini**.

**Free tier limits** (as of early 2026): The Gemini 2.0 Flash image generation model includes a generous free quota for personal and development use. Paid usage is billed per image once you exceed the quota or opt into a paid plan. Check the [AI Studio pricing page](https://ai.google.dev/pricing) for current limits.

## Getting an OpenRouter API Key

[OpenRouter](https://openrouter.ai) is a unified API gateway that gives you access to hundreds of models — including the FLUX.2 and Seedream models supported by ImageGen — through a single key and a single billing account.

1. Visit [openrouter.ai](https://openrouter.ai) and sign up or log in.
2. Navigate to **Keys** (or go directly to [openrouter.ai/keys](https://openrouter.ai/keys)) and click **Create key**.
3. Give the key a name (e.g. `imagegen-vscode`), set an optional spend limit, and click **Create**.
4. Copy the key and store it in ImageGen via `ImageGen: Set API Key` → **OpenRouter**.

One OpenRouter key covers all OpenRouter-backed providers in ImageGen (FLUX.2 [max], FLUX.2 [pro], and Seedream 4.0). You can top up your credit balance from the [OpenRouter dashboard](https://openrouter.ai/credits) and set per-key spend limits to stay in control of costs.

## Usage

### 1. Setup
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
```
ImageGen: Set API Key
```
Select which provider key to configure, then paste your key into the secure input box. Repeat for each provider you want to use.
Keys are stored securely using VS Code SecretStorage (OS credential vault), not in workspace files or settings.

### 2. Using with GitHub Copilot
Open GitHub Copilot Chat (`Ctrl+Alt+I`) and prompt the agent:
> *"Write a short introduction for a blog post about TypeScript. Then use your image generation tool to create a futuristic header image for it."*

Copilot will invoke the `#generateImage` tool, generate the image, save it as `.webp`, and return a Markdown image link plus call metrics (API duration and estimated cost).

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
- ✅ OpenAI (GPT Image 1.5)
- ❌ OpenRouter-backed models in this extension currently support text-to-image only

### 4. Using the Manual Panel
Run the command `ImageGen: Open in Editor Panel` to launch the UI.

- **Generate mode:** Select your provider, enter a detailed prompt, adjust WebP quality/aspect ratio, and click **Generate Image**.
- **Edit mode:** Switch **Mode** to **Edit existing image**, provide input image (path, URL, markdown image snippet, data URL, or upload a local file), add edit instructions, and click **Edit Image**.

Once the preview appears, click **Insert into Active Editor** to place the Markdown link at your cursor.

If no workspace folder is open, generated images are saved to a local fallback directory:
- Windows: `%USERPROFILE%/Pictures/ImageGen` (or `%USERPROFILE%/ImageGen` if `Pictures` is unavailable)
- macOS/Linux: `$HOME/Pictures/ImageGen` (or `$HOME/ImageGen` if `Pictures` is unavailable)

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `imagegen.provider` | `gemini-3.1-flash-image-preview` | The image generation provider to use |
| `imagegen.outputDirectory` | `assets/images` | Workspace-relative folder for saved images |
| `imagegen.webpQuality` | `80` | WebP quality for Copilot tool (0–100) |
| `imagegen.requestTimeoutMs` | `45000` | Per-request timeout in ms for provider API calls |
| `imagegen.maxInputImageMB` | `12` | Max input image size in MB for edit operations |

## Extension Commands

| Command | Description |
|---------|-------------|
| `ImageGen: Set API Key` | Securely store or update an API key |
| `ImageGen: Open in Editor Panel` | Open the manual image generation interface |
| `ImageGen: Run Health Check` | Validate key presence, output directory write access, and provider endpoint reachability |

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

## Release Notes

### 1.0.1
- Added manual **Generate/Edit** modes in the webview UI, including local file upload for edit input.
- Added abort/cancel support for manual runs to stop in-flight provider requests.
- Added Copilot `#editImage` tool and provider-side image editing support for Gemini + OpenAI.
- Added provider request timeout handling and clearer timeout/cancellation error messaging.
- Added OpenAI manual controls for output resolution and model quality.
- Added fallback save location when no workspace is open (`Pictures/ImageGen` or `~/ImageGen`).
- Added configurable safety limits: `imagegen.requestTimeoutMs` and `imagegen.maxInputImageMB`.

### 1.0.0
- Initial release.
- Added Copilot Tool integration (`vscode.lm.registerTool`).
- Added manual Webview panel for text-to-image generation.
- Integrated WASM-based WebP compression (`@jsquash/webp`).
- Multi-provider support: Google Gemini, OpenAI, BFL FLUX.2, Seedream 4.0.
