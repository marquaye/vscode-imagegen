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

### 3. Using the Manual Panel
Run the command `ImageGen: Open in Editor Panel` to launch the UI. Select your provider, enter a detailed image prompt, adjust the WebP compression quality slider, choose an aspect ratio, and click **Generate**.

Once the preview appears, click **Insert into Active Editor** to place the Markdown link at your cursor.

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `imagegen.provider` | `gemini-3.1-flash-image-preview` | The image generation provider to use |
| `imagegen.outputDirectory` | `assets/images` | Workspace-relative folder for saved images |
| `imagegen.webpQuality` | `80` | WebP quality for Copilot tool (0–100) |

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

### 1.0.0
- Initial release.
- Added Copilot Tool integration (`vscode.lm.registerTool`).
- Added manual Webview panel for text-to-image generation.
- Integrated WASM-based WebP compression (`@jsquash/webp`).
- Multi-provider support: Google Gemini, OpenAI, BFL FLUX.2, Seedream 4.0.
