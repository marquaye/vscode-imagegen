# Changelog

## Unreleased

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
