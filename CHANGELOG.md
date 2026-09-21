# Changelog

## Unreleased

## 1.4.0 - 2026-09-21

### Features
- Added the command **ImageGen: Connect External Agents (MCP)**, which connects Claude Code, Claude Desktop, Cursor and other MCP agents in one step: it locates the bundled server, picks a working Node runtime, exports the stored API keys, and writes the `.mcp.json` entry (workspace scope) or copies a `claude mcp add --scope user` command (all projects).
- Added the command **ImageGen: Disconnect External Agents (MCP)**, which deletes the exported credentials while the keys stay in VS Code SecretStorage.
- Added a `check_setup` MCP tool that reports the resolved configuration and which provider credentials are available, so an agent can diagnose a failing setup without the user re-entering keys.
- The MCP server now reads API keys from `~/.imagegen/credentials.json` when the matching environment variable is absent, so provider keys no longer have to be pasted into `.mcp.json`.
- The MCP server now inherits `imagegen.*` values from the workspace `.vscode/settings.json`, so external agents use the same provider, output directory and quality as the panel. Environment variables still take precedence.

### Changed
- Reworked the MCP tools along the current MCP tool-design guidance: `registerTool` with titles and behaviour annotations, compact text results instead of JSON payloads (about a third of the previous context cost per call), and lean schemas that leave roughly 600 tokens of tool definitions in an agent's context.
- Tool errors are now actionable: an unknown model id lists every valid id, a model that cannot edit lists the ones that can, and a missing input path names the directory it was resolved against.
- The `provider` argument is a plain string instead of an eleven-value enum, which keeps the model list out of every session's context; `check_setup` reports the list on demand.
- Only annotation hints that differ from the MCP defaults are sent, so the image tools declare `destructiveHint: false` and nothing else.
- The WebAssembly encoder is compiled on first use rather than at startup, so sessions that never generate an image do not pay for it.
- Rotating an API key in VS Code now refreshes the copy exported for external agents, instead of leaving them on the old key.
- The connect command no longer asks where to register up front: it writes the workspace `.mcp.json` and offers the all-projects command afterwards.
- MCP image results now include the pixel `width` and `height` of the saved file.
- Missing-credential errors from the MCP server now name the environment variable, the credentials file and the VS Code command that fixes the problem.

### Fixed
- The MCP server located its WebAssembly encoder relative to the bundle only, which failed when an agent started it from another working directory. It now tries several roots and honours `IMAGEGEN_EXTENSION_DIR`.

## 1.3.0 - 2026-09-11

### Features
- Added OpenAI GPT Image 2.5 support with both variants: `gpt-image-2.5-flare` (fast) and `gpt-image-2.5-sunburst` (precise edits). Both support generation and editing.
- Added the GPT Image 2.5 `xhigh` and `max` quality tiers to the manual panel, alongside the existing `auto`/`low`/`medium`/`high` tiers.
- Added Microsoft AI MAI-Image-2.6 support via OpenRouter: `mai-image-2.6` and `mai-image-2.6-flash`. Both support generation and editing.
- Wired MAI models to OpenRouter's unified Image API (`/api/v1/images`), which takes a native `aspect_ratio` and reference images — making these the first OpenRouter-backed models in ImageGen that can edit, not just generate.

### Changed
- The manual panel now derives its resolution and quality controls from a per-model capability table instead of hardcoded provider ID checks, so each model only offers the sizes and quality tiers its API actually accepts.

## 1.2.4 - 2026-08-20

### Features
- Added a standalone stdio MCP server so Claude and other external agents can generate and edit optimized WebP images through ImageGen.
- Added environment-based provider credentials and workspace/output configuration for the MCP server.
- Added OpenAI GPT Image 2 provider support (`gpt-image-2`) for both generation and edit flows.
- Kept GPT Image 1.5 support for backward compatibility and existing workspace settings.
- Updated provider settings, health checks, and manual panel behavior so GPT Image 2 receives OpenAI-specific resolution/quality controls.

### Optimization
- Reduced Copilot tool-definition context footprint by shortening language model tool metadata and simplifying input schema text.
- Replaced verbose enum-heavy schema descriptions with compact validation patterns where possible to lower prompt/context overhead.
- Decreased packaged extension size by excluding generated workspace images from the VSIX via .vscodeignore (about 2.18 MB down to about 0.97 MB).

## 1.2.1 - 2026-03-13

### Documentation
- Removed provider pricing values from the README provider table to reduce confusion: this extension is completely free to use and MIT-licensed. Any charges come from the selected image model provider.
- Simplified pricing-related wording in README feature and usage sections to keep docs focused on extension functionality.

## 1.2.0 - 2026-03-07

### Phase 7 - Prompt Metadata Inspection UX
- Added a panel-only Inspect Metadata action for generated preview results so the editor panel can open embedded WebP prompt metadata directly.
- Reused the metadata inspector with explicit file-path targeting instead of forcing users through the picker flow.

### Phase 8 - Output Location Control
- Added per-tool `saveMode` support so agents can choose between persistent project output and temporary OS-temp output.
- Updated persistent save resolution in multi-root workspaces to prefer the last active editor's workspace folder instead of always using the first workspace folder.

### Phase 1 - Webview Host Consolidation
- Added shared webview message contracts in `src/webview/messages.ts`.
- Added shared host-side handlers in `src/webview/sharedHandlers.ts` for generate/edit/insert/save-key flows.
- Refactored `src/webview/panel.ts` and `src/webview/sidebarProvider.ts` to reuse shared handlers and remove duplicated logic.

### Phase 2 - Image Service Modularization
- Added `src/image/config.ts` to isolate extension configuration parsing/validation.
- Added `src/image/wasm.ts` to isolate WASM bootstrap and readiness checks.
- Added `src/image/inputResolver.ts` to isolate edit-mode image source parsing and size/mime checks.
- Added `src/image/outputWriter.ts` to isolate output path generation and image writing.
- Refactored `src/imageService.ts` into a thinner orchestration layer that delegates config/WASM/input/output responsibilities.
- Updated import call sites (`src/extension.ts`, `src/tool.ts`, `src/healthCheck.ts`) to use the new modules.

### Phase 3 - Provider Adapter Simplification
- Added shared provider HTTP helpers in `src/providers/httpHelpers.ts` for consistent API error handling and image payload extraction (base64 or URL).
- Refactored `src/providers/openai.ts` and `src/providers/openrouter.ts` to reuse shared helper functions.
- Refactored `src/providers/gemini.ts` to reuse a shared inline-image response extraction helper.

### Phase 4 - Testability and Unit Tests
- Extracted user-facing error mapping into `src/utils/userErrorMessage.ts` and re-exported from `src/utils/errors.ts`.
- Extracted input mime/size rules into `src/image/inputRules.ts` and reused from `src/image/inputResolver.ts`.
- Added Bun unit tests:
	- `src/providers/types.test.ts`
	- `src/utils/userErrorMessage.test.ts`
	- `src/image/inputRules.test.ts`
- Added `npm`/`bun` test script (`"test": "bun test"`) in `package.json`.

### Phase 5 - Build/Watch Reliability
- Refactored `build.ts` to use serialized queued builds (`queueBuild`) to prevent overlapping rebuilds.
- Added watch-mode debounce to coalesce rapid file change events before rebuilding.
- Updated watch and normal build paths to use one shared build queue flow.

### Phase 6 - LM Tool Runner Extraction
- Added `src/lmToolRunner.ts` to centralize Copilot tool invocation preparation, progress flow, cancellation, result formatting, and error mapping.
- Refactored `src/tool.ts` so `GenerateImageTool` and `EditImageTool` use the shared runner instead of duplicating invocation logic.
