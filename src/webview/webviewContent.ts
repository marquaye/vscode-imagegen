import * as vscode from 'vscode';
import {
  API_KEY_LABELS,
  ASPECT_RATIOS,
  PROVIDER_META,
  PROVIDER_API_KEY_MAP,
  type ProviderId,
  type KeyStatuses,
} from '../providers';

export function getWebviewContent(
  webview: vscode.Webview,
  _extensionUri: vscode.Uri,
  nonce: string,
  initialProvider = 'gemini-3.1-flash-image-preview',
  keyStatuses: KeyStatuses = {},
): string {
  const csp =
    `default-src 'none'; ` +
    `style-src 'nonce-${nonce}'; ` +
    `script-src 'nonce-${nonce}'; ` +
    `img-src data: blob:; `;

  const keyStatusesJson = JSON.stringify(keyStatuses);
  const providerKeyMapJson = JSON.stringify(
    Object.fromEntries(
      (Object.keys(PROVIDER_API_KEY_MAP) as ProviderId[]).map((id) => [id, PROVIDER_API_KEY_MAP[id]]),
    ),
  );
  const keyLabelsJson = JSON.stringify(API_KEY_LABELS);

  const providerOptions = PROVIDER_META.map(
    (m) =>
      `<option value="${m.id}"${m.id === initialProvider ? ' selected' : ''}>${m.label} — ${m.detail}</option>`,
  ).join('\n        ');

  const aspectOptions = ASPECT_RATIOS.map(
    (ar) => `<option value="${ar}"${ar === '16:9' ? ' selected' : ''}>${ar}</option>`,
  ).join('\n        ');

  const keyRows = Object.entries(API_KEY_LABELS)
    .map(
      ([keyName, label]) => `
      <div class="key-row" data-key-name="${keyName}">
        <div class="key-row-label">${label}</div>
        <div class="key-row-input-wrap">
          <input class="key-input" type="password" placeholder="Paste ${label}" />
          <button class="icon-btn save-key-btn" title="Save API key" aria-label="Save API key">
            ${PLUS_ICON}
          </button>
        </div>
      </div>`,
    )
    .join('');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>ImageGen</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
    }

    h1 {
      font-size: 1.2em;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--vscode-editor-foreground);
    }

    h2 {
      font-size: 0.95em;
      font-weight: 600;
      margin-bottom: 10px;
      color: var(--vscode-editor-foreground);
    }

    .muted {
      color: var(--vscode-descriptionForeground);
      font-size: 0.88em;
      margin-bottom: 12px;
      line-height: 1.45;
    }

    .hidden { display: none !important; }

    .card {
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-editorWidget-background, #1f1f1f));
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }

    label {
      font-size: 0.8em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    textarea, select, input[type="password"], input[type="text"], input[type="file"] {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: inherit;
      outline: none;
    }

    textarea { min-height: 90px; resize: vertical; }
    textarea:focus, select:focus, input[type="password"]:focus, input[type="text"]:focus, input[type="file"]:focus { border-color: var(--vscode-focusBorder); }

    .input-image-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
    }

    #input-image-file {
      width: 100%;
      padding: 7px 8px;
      min-height: 34px;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .aspect-group {
      max-width: 120px;
    }

    .quality-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    input[type="range"] { flex: 1; accent-color: var(--vscode-button-background); }
    #quality-display { min-width: 36px; text-align: right; color: var(--vscode-descriptionForeground); }

    #key-status {
      font-size: 0.82em;
      margin-top: 5px;
      padding: 5px 8px;
      border-radius: 3px;
      display: none;
    }

    #key-status.missing {
      display: block;
      background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
      color: var(--vscode-errorForeground);
      border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 30%, transparent);
    }

    .provider-inline-key {
      margin-top: 8px;
      display: none;
      gap: 6px;
      align-items: center;
    }

    .provider-inline-key.show { display: flex; }
    .provider-inline-key input { flex: 1; }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      font-weight: 600;
      transition: opacity 0.15s;
    }

    #generate-btn {
      padding: 8px 14px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      width: 100%;
    }

    #generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    #abort-btn {
      margin-top: 8px;
      padding: 8px 14px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      width: 100%;
      border: 1px solid var(--vscode-input-border, transparent);
      display: none;
    }

    #abort-btn.show { display: inline-flex; }
    #abort-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .icon-btn {
      width: 34px;
      height: 34px;
      padding: 0;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-input-border, transparent);
      flex: 0 0 auto;
    }

    .icon-btn svg { width: 18px; height: 18px; }

    .key-row { margin-bottom: 10px; }
    .key-row-label {
      margin-bottom: 5px;
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
    }

    .key-row-input-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .key-row-input-wrap .key-input { flex: 1; }

    #status {
      margin-top: 10px;
      font-size: 0.88em;
      min-height: 1.2em;
      color: var(--vscode-descriptionForeground);
    }

    #status.error { color: var(--vscode-errorForeground); }

    #loading-container {
      margin-top: 10px;
      display: none;
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 10px;
      padding: 10px;
      background: color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-editorWidget-background, #1f1f1f));
    }

    #loading-container.show { display: block; }

    .loading-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .loading-spinner {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--vscode-progressBar-background, #0e70c0) 25%, transparent);
      border-top-color: var(--vscode-progressBar-background, #0e70c0);
      animation: spin 0.9s linear infinite;
      flex: 0 0 auto;
    }

    .loading-text {
      font-size: 0.88em;
      color: var(--vscode-editor-foreground);
      font-weight: 600;
    }

    #elapsed-time {
      margin-left: auto;
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      font-variant-numeric: tabular-nums;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    #preview-container {
      margin-top: 12px;
      display: none;
    }

    #preview-container img {
      width: 100%;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border, #444);
      display: block;
      cursor: default;
    }

    #preview-container img:hover {
      cursor: pointer;
    }

    #filepath {
      margin-top: 8px;
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
      word-break: break-all;
    }

    .call-info {
      margin-top: 8px;
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 8px;
      padding: 8px;
      background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-editorWidget-background, #1f1f1f));
    }

    .call-info-title {
      font-size: 0.77em;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      font-weight: 700;
      margin-bottom: 6px;
    }

    .call-info-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      font-size: 0.82em;
      color: var(--vscode-editor-foreground);
    }

    .call-info-grid span {
      color: var(--vscode-descriptionForeground);
      margin-right: 6px;
    }

    .action-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }

    .action-card {
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--vscode-panel-border, #444);
      padding: 9px 10px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      justify-content: flex-start;
    }

    .action-card:hover {
      filter: brightness(1.05);
    }
  </style>
</head>
<body>
  <h1>ImageGen</h1>

  <div id="setup-only" class="card hidden">
    <h2>Add API Keys</h2>
    <div class="muted">Paste at least one provider API key to start generating images.</div>
    ${keyRows}
  </div>

  <div id="generator-root">
    <div class="form-group">
      <label for="provider">Provider</label>
      <select id="provider">
        ${providerOptions}
      </select>
      <div id="key-status"></div>
      <div id="provider-inline-key" class="provider-inline-key">
        <input id="provider-inline-key-input" type="password" placeholder="Paste API key for selected provider" />
        <button id="provider-inline-save-btn" class="icon-btn" title="Save API key" aria-label="Save API key">
          ${PLUS_ICON}
        </button>
      </div>
    </div>

    <div class="form-group">
      <label for="operation">Mode</label>
      <select id="operation">
        <option value="generate" selected>Generate from text</option>
        <option value="edit">Edit existing image</option>
      </select>
    </div>

    <div class="form-group">
      <label id="prompt-label" for="prompt">Prompt</label>
      <textarea id="prompt" placeholder="Describe the image you want to generate…"></textarea>
    </div>

    <div id="input-image-group" class="form-group hidden">
      <label for="input-image">Input Image</label>
      <textarea id="input-image" placeholder="Path, URL, data URL, or Markdown image snippet"></textarea>
      <div class="input-image-row">
        <input id="input-image-file" type="file" accept="image/*" />
      </div>
    </div>

    <div class="row">
      <div class="form-group aspect-group">
        <label for="aspect-ratio">Aspect Ratio</label>
        <select id="aspect-ratio">
          ${aspectOptions}
        </select>
      </div>

      <div id="resolution-group" class="form-group hidden">
        <label for="resolution">Resolution</label>
        <select id="resolution">
          <option value="1K" selected>1K</option>
          <option value="2K">2K</option>
          <option value="0.5K">0.5K</option>
        </select>
      </div>

      <div id="provider-quality-group" class="form-group hidden">
        <label for="provider-quality">Model Quality</label>
        <select id="provider-quality">
          <option value="auto">auto</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high" selected>high</option>
        </select>
      </div>

      <div class="form-group">
        <label for="quality-slider">WebP Quality</label>
        <div class="quality-row">
          <input type="range" id="quality-slider" min="0" max="100" value="80" />
          <span id="quality-display">80%</span>
        </div>
      </div>
    </div>

    <button id="generate-btn">Generate Image</button>
    <button id="abort-btn" type="button">Abort</button>

    <div id="loading-container">
      <div class="loading-row">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-text">Generating image…</div>
        <div id="elapsed-time">0.0s</div>
      </div>
      <div id="loading-estimate" class="muted" style="margin: 8px 0 0 0;"></div>
    </div>

    <div id="preview-container">
      <img id="preview-img" src="" alt="Generated image preview" />
      <div id="filepath"></div>
      <div class="call-info">
        <div class="call-info-title">Call Info</div>
        <div class="call-info-grid">
          <div><span>Call duration:</span><strong id="result-elapsed">-</strong></div>
          <div><span>Resolution:</span><strong id="result-resolution">-</strong></div>
          <div><span>Estimated cost:</span><strong id="result-cost">-</strong></div>
          <div><span>Estimated tokens:</span><strong id="result-tokens">-</strong></div>
          <div><span>Before optimization:</span><strong id="size-before">-</strong></div>
          <div><span>After optimization:</span><strong id="size-after">-</strong></div>
        </div>
      </div>
      <div class="action-stack">
        <button id="insert-btn" class="action-card">⬆ Insert into Editor</button>
        <button id="reveal-btn" class="action-card">📂 Reveal File</button>
        <button id="open-in-editor-btn" class="action-card">🧭 Open File in VS Code</button>
      </div>
    </div>
  </div>

  <div id="status"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const KEY_STATUSES = ${keyStatusesJson};
    const PROVIDER_KEY_MAP = ${providerKeyMapJson};
    const KEY_LABELS = ${keyLabelsJson};

    const setupOnlyEl = document.getElementById('setup-only');
    const generatorRootEl = document.getElementById('generator-root');
    const providerEl = document.getElementById('provider');
    const keyStatusEl = document.getElementById('key-status');
    const providerInlineKeyEl = document.getElementById('provider-inline-key');
    const providerInlineKeyInputEl = document.getElementById('provider-inline-key-input');
    const providerInlineSaveBtnEl = document.getElementById('provider-inline-save-btn');
    const operationEl = document.getElementById('operation');
    const promptLabelEl = document.getElementById('prompt-label');
    const promptEl = document.getElementById('prompt');
    const inputImageGroupEl = document.getElementById('input-image-group');
    const inputImageEl = document.getElementById('input-image');
    const inputImageFileEl = document.getElementById('input-image-file');
    const aspectEl = document.getElementById('aspect-ratio');
    const resolutionGroupEl = document.getElementById('resolution-group');
    const resolutionEl = document.getElementById('resolution');
    const providerQualityGroupEl = document.getElementById('provider-quality-group');
    const providerQualityEl = document.getElementById('provider-quality');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityDisplay = document.getElementById('quality-display');
    const generateBtn = document.getElementById('generate-btn');
    const abortBtn = document.getElementById('abort-btn');
    const insertBtn = document.getElementById('insert-btn');
    const revealBtn = document.getElementById('reveal-btn');
    const openInEditorBtn = document.getElementById('open-in-editor-btn');
    const statusEl = document.getElementById('status');
    const previewCt = document.getElementById('preview-container');
    const previewImg = document.getElementById('preview-img');
    const filepathEl = document.getElementById('filepath');
    const loadingCt = document.getElementById('loading-container');
    const elapsedTimeEl = document.getElementById('elapsed-time');
    const loadingEstimateEl = document.getElementById('loading-estimate');
    const resultElapsedEl = document.getElementById('result-elapsed');
    const resultResolutionEl = document.getElementById('result-resolution');
    const resultCostEl = document.getElementById('result-cost');
    const resultTokensEl = document.getElementById('result-tokens');
    const sizeBeforeEl = document.getElementById('size-before');
    const sizeAfterEl = document.getElementById('size-after');

    let currentMarkdownLink = '';
    let currentAbsolutePath = '';
    let isGenerating = false;
    let generationStartedAt = 0;
    let generationTicker = null;
    let currentEstimate = null;
    let currentRequestedResolution = null;

    const NANO_BANANA_2_PROVIDER_ID = 'gemini-3.1-flash-image-preview';
    const OPENAI_PROVIDER_ID = 'gpt-image-1.5';
    const NANO_BANANA_2_RESOLUTIONS = ['1K', '2K', '0.5K'];
    const OPENAI_RESOLUTIONS = ['auto', '1024x1024', '1536x1024', '1024x1536'];
    const NANO_BANANA_2_COSTS = {
      '0.5K': { tokens: 747, usd: 0.045 },
      '1K': { tokens: 1120, usd: 0.067 },
      '2K': { tokens: 1680, usd: 0.101 },
    };

    qualitySlider.addEventListener('input', () => {
      qualityDisplay.textContent = qualitySlider.value + '%';
    });

    function hasAnyKey() {
      return Object.values(KEY_STATUSES).some(Boolean);
    }

    function selectedProviderKeyName() {
      return PROVIDER_KEY_MAP[providerEl.value];
    }

    function isEditMode() {
      return operationEl.value === 'edit';
    }

    function setViewMode() {
      if (hasAnyKey()) {
        setupOnlyEl.classList.add('hidden');
        generatorRootEl.classList.remove('hidden');
      } else {
        setupOnlyEl.classList.remove('hidden');
        generatorRootEl.classList.add('hidden');
      }
    }

    function updateKeyStatus() {
      const keyName = selectedProviderKeyName();
      const hasKey = !!KEY_STATUSES[keyName];

      if (hasKey) {
        keyStatusEl.textContent = '';
        keyStatusEl.className = '';
        providerInlineKeyEl.classList.remove('show');
      } else {
        keyStatusEl.textContent = '\u26a0 API key not set for this provider — paste below';
        keyStatusEl.className = 'missing';
        providerInlineKeyEl.classList.add('show');
      }

      generateBtn.disabled = !hasKey || isGenerating;
    }

    function updateOperationUi() {
      const editMode = isEditMode();

      inputImageGroupEl.classList.toggle('hidden', !editMode);
      promptLabelEl.textContent = editMode ? 'Edit Instructions' : 'Prompt';
      promptEl.placeholder = editMode
        ? 'Describe how you want to modify the input image…'
        : 'Describe the image you want to generate…';
      generateBtn.textContent = editMode ? 'Edit Image' : 'Generate Image';

      updateResolutionVisibility();
      updateCostPreview();
      updateKeyStatus();
    }

    function providerSupportsResolution(providerId) {
      return providerId === NANO_BANANA_2_PROVIDER_ID || providerId === OPENAI_PROVIDER_ID;
    }

    function providerSupportsOutputQuality(providerId) {
      return providerId === OPENAI_PROVIDER_ID;
    }

    function setResolutionOptionsForProvider(providerId) {
      const values = providerId === OPENAI_PROVIDER_ID
        ? OPENAI_RESOLUTIONS
        : NANO_BANANA_2_RESOLUTIONS;

      const existing = resolutionEl.value;
      resolutionEl.innerHTML = values
        .map((value) => '<option value="' + value + '">' + value + '</option>')
        .join('');

      if (values.includes(existing)) {
        resolutionEl.value = existing;
      }
    }

    function formatUsd(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return '-';
      }
      return '$' + value.toFixed(3);
    }

    function getCurrentEstimate() {
      if (isEditMode()) {
        return null;
      }

      if (providerEl.value !== NANO_BANANA_2_PROVIDER_ID) {
        return null;
      }

      const pricing = NANO_BANANA_2_COSTS[resolutionEl.value];
      if (!pricing) {
        return null;
      }

      return {
        resolutionKey: resolutionEl.value,
        tokens: pricing.tokens,
        usd: pricing.usd,
      };
    }

    function updateCostPreview() {
      const estimate = getCurrentEstimate();
      if (!estimate) {
        loadingEstimateEl.textContent = '';
        return;
      }

      loadingEstimateEl.textContent =
        'Est. cost ' +
        formatUsd(estimate.usd) +
        ' • ' +
        estimate.tokens +
        ' tokens (' +
        estimate.resolutionKey +
        ')';
    }

    function updateResolutionVisibility() {
      const supported = providerSupportsResolution(providerEl.value) && !isEditMode();
      if (supported) {
        setResolutionOptionsForProvider(providerEl.value);
      }
      if (supported) {
        resolutionGroupEl.classList.remove('hidden');
      } else {
        resolutionGroupEl.classList.add('hidden');
      }
      updateCostPreview();
    }

    function updateProviderQualityVisibility() {
      const supported = providerSupportsOutputQuality(providerEl.value);
      providerQualityGroupEl.classList.toggle('hidden', !supported);
    }

    function formatElapsed(ms) {
      return (ms / 1000).toFixed(1) + 's';
    }

    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || bytes < 0) {
        return '-';
      }

      if (bytes < 1024) {
        return bytes + ' B';
      }

      const kb = bytes / 1024;
      if (kb < 1024) {
        return kb.toFixed(1) + ' KB';
      }

      return (kb / 1024).toFixed(2) + ' MB';
    }

    function stopGenerationTicker() {
      if (generationTicker) {
        clearInterval(generationTicker);
        generationTicker = null;
      }
    }

    function setGeneratingState(running) {
      isGenerating = running;
      if (running) {
        generationStartedAt = Date.now();
        elapsedTimeEl.textContent = '0.0s';
        loadingCt.classList.add('show');
        abortBtn.classList.add('show');
        abortBtn.disabled = false;
        stopGenerationTicker();
        generationTicker = setInterval(() => {
          elapsedTimeEl.textContent = formatElapsed(Date.now() - generationStartedAt);
        }, 250);
      } else {
        stopGenerationTicker();
        loadingCt.classList.remove('show');
        abortBtn.classList.remove('show');
        abortBtn.disabled = true;
      }

      updateKeyStatus();
    }

    function saveKey(keyName, rawValue) {
      const value = rawValue.trim();
      if (!value) {
        setStatus('Please paste an API key first.', true);
        return;
      }

      vscode.postMessage({ type: 'saveApiKey', keyName, keyValue: value });
      setStatus('Saving API key…');
    }

    providerEl.addEventListener('change', () => {
      updateKeyStatus();
      updateResolutionVisibility();
      updateProviderQualityVisibility();
    });
    operationEl.addEventListener('change', updateOperationUi);
    resolutionEl.addEventListener('change', updateCostPreview);

    inputImageFileEl.addEventListener('change', () => {
      const file = inputImageFileEl.files && inputImageFileEl.files[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          inputImageEl.value = reader.result;
          setStatus('Input image loaded from file.');
        }
      };
      reader.onerror = () => {
        setStatus('Failed to read selected image file.', true);
      };
      reader.readAsDataURL(file);
    });

    providerInlineSaveBtnEl.addEventListener('click', () => {
      saveKey(selectedProviderKeyName(), providerInlineKeyInputEl.value);
      providerInlineKeyInputEl.value = '';
    });

    document.querySelectorAll('.save-key-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.key-row');
        const keyName = row.dataset.keyName;
        const input = row.querySelector('.key-input');
        saveKey(keyName, input.value);
        input.value = '';
      });
    });

    generateBtn.addEventListener('click', () => {
      const prompt = promptEl.value.trim();
      if (!prompt) {
        setStatus('Please enter a prompt.', true);
        return;
      }

      const editMode = isEditMode();
      const inputImage = inputImageEl.value.trim();
      if (editMode && !inputImage) {
        setStatus('Please provide an input image source.', true);
        return;
      }

      generateBtn.disabled = true;
      previewCt.style.display = 'none';
      setGeneratingState(true);
      setStatus(editMode ? 'Editing… this may take a few seconds.' : 'Generating… this may take a few seconds.');
      currentMarkdownLink = '';
      currentAbsolutePath = '';
      currentEstimate = getCurrentEstimate();
      currentRequestedResolution = providerSupportsResolution(providerEl.value) && !isEditMode()
        ? resolutionEl.value
        : null;
      resultElapsedEl.textContent = '-';
      resultResolutionEl.textContent = '-';
      resultCostEl.textContent = '-';
      resultTokensEl.textContent = '-';
      sizeBeforeEl.textContent = '-';
      sizeAfterEl.textContent = '-';

      if (editMode) {
        vscode.postMessage({
          type: 'edit',
          prompt,
          inputImage,
          provider: providerEl.value,
          aspectRatio: aspectEl.value,
          providerQuality: providerSupportsOutputQuality(providerEl.value) ? providerQualityEl.value : undefined,
          quality: parseInt(qualitySlider.value, 10),
        });
      } else {
        vscode.postMessage({
          type: 'generate',
          prompt,
          provider: providerEl.value,
          aspectRatio: aspectEl.value,
          resolution: providerSupportsResolution(providerEl.value) ? resolutionEl.value : undefined,
          providerQuality: providerSupportsOutputQuality(providerEl.value) ? providerQualityEl.value : undefined,
          quality: parseInt(qualitySlider.value, 10),
        });
      }
    });

    abortBtn.addEventListener('click', () => {
      if (!isGenerating) {
        return;
      }

      abortBtn.disabled = true;
      setStatus('Cancelling…');
      vscode.postMessage({ type: 'abort' });
    });

    insertBtn.addEventListener('click', () => {
      if (currentMarkdownLink) {
        vscode.postMessage({ type: 'insert', markdownLink: currentMarkdownLink });
      }
    });

    revealBtn.addEventListener('click', () => {
      if (currentAbsolutePath) {
        vscode.postMessage({ type: 'revealFile', absolutePath: currentAbsolutePath });
      }
    });

    openInEditorBtn.addEventListener('click', () => {
      if (currentAbsolutePath) {
        vscode.postMessage({ type: 'openFileInEditor', absolutePath: currentAbsolutePath });
      }
    });

    previewImg.addEventListener('click', () => {
      if (currentAbsolutePath) {
        vscode.postMessage({ type: 'openFileInEditor', absolutePath: currentAbsolutePath });
      }
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'keyStatusUpdate') {
        Object.assign(KEY_STATUSES, msg.keyStatuses);
        setViewMode();
        updateKeyStatus();
        return;
      }

      if (msg.type === 'keySaved') {
        KEY_STATUSES[msg.keyName] = true;
        setViewMode();
        updateKeyStatus();
        setStatus('');
        return;
      }

      setGeneratingState(false);

      if (msg.type === 'result') {
        setStatus('');
        previewImg.src = 'data:image/webp;base64,' + msg.base64;
        filepathEl.textContent = msg.relativePath;
        currentMarkdownLink = msg.markdownLink;
        currentAbsolutePath = msg.absolutePath;
        if (msg.metrics && typeof msg.metrics.apiCallDurationMs === 'number') {
          resultElapsedEl.textContent = formatElapsed(msg.metrics.apiCallDurationMs);
        } else if (msg.metrics && typeof msg.metrics.totalDurationMs === 'number') {
          resultElapsedEl.textContent = formatElapsed(msg.metrics.totalDurationMs);
        } else if (generationStartedAt > 0) {
          resultElapsedEl.textContent = formatElapsed(Date.now() - generationStartedAt);
        }

        if (msg.metrics && typeof msg.metrics.estimatedCostUsd === 'number') {
          resultCostEl.textContent = formatUsd(msg.metrics.estimatedCostUsd);
        } else if (currentEstimate) {
          resultCostEl.textContent = formatUsd(currentEstimate.usd);
        } else {
          resultCostEl.textContent = 'Not available';
        }

        if (currentEstimate) {
          resultResolutionEl.textContent = currentEstimate.resolutionKey;
          resultTokensEl.textContent = String(currentEstimate.tokens);
        } else if (currentRequestedResolution) {
          resultResolutionEl.textContent = currentRequestedResolution;
          resultTokensEl.textContent = 'Not available';
        } else {
          resultResolutionEl.textContent = 'Not available';
          resultTokensEl.textContent = 'Not available';
        }
        sizeBeforeEl.textContent = formatBytes(msg.originalBytes);
        sizeAfterEl.textContent = formatBytes(msg.optimizedBytes);
        previewCt.style.display = 'block';
      } else if (msg.type === 'cancelled') {
        setStatus('Request cancelled.');
        updateKeyStatus();
      } else if (msg.type === 'error') {
        setStatus(msg.message, true);
        updateKeyStatus();
      }
    });

    function setStatus(msg, isError = false) {
      statusEl.textContent = msg;
      statusEl.className = isError ? 'error' : '';
    }

    setViewMode();
    updateKeyStatus();
    updateOperationUi();
    updateResolutionVisibility();
    updateProviderQualityVisibility();
  </script>
</body>
</html>`;
}

const PLUS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M7.5 9a2.5 2.5 0 1 1 5 0a2.5 2.5 0 0 1-5 0M10 7.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3"/><path fill="currentColor" d="M13.623 3.5h-3.246c-1.1 0-1.958 0-2.645.056c-.698.057-1.265.175-1.775.434A4.5 4.5 0 0 0 3.99 5.957c-.26.51-.377 1.077-.434 1.775C3.5 8.42 3.5 9.276 3.5 10.377v3.246c0 .946 0 1.712.036 2.345q.004.097.012.2l.003.031c.035.466.095.874.204 1.246q.091.314.235.598a4.5 4.5 0 0 0 1.967 1.967c.51.26 1.077.377 1.775.434c.687.056 1.544.056 2.645.056h3.246c1.1 0 1.958 0 2.645-.056c.698-.057 1.265-.175 1.775-.434a4.5 4.5 0 0 0 1.967-1.967c.496-.975.493-2.153.49-3.241l-.001-.342l.001-.837v-3.246c0-1.1 0-1.958-.056-2.645c-.057-.698-.175-1.265-.434-1.775a4.5 4.5 0 0 0-1.967-1.967c-.51-.26-1.077-.377-1.775-.434c-.687-.056-1.544-.056-2.645-.056m-9.07 12.686l-.006-.07c-.041-.628.603-1.25 1.079-1.709q.115-.11.212-.207c.252-.254.423-.369.576-.424a1.5 1.5 0 0 1 1.03 0c.152.055.323.17.575.424c.255.257.556.617.984 1.13a1.33 1.33 0 0 0 1.98.073l3.003-3.111c.087-.09.178-.192.272-.297c.345-.386.738-.826 1.197-.979a1.5 1.5 0 0 1 .947 0c.773.258 1.499 1.129 2.13 1.886c.234.28.454.545.66.757c.251.261.308.411.307.763c-.003.87-.02 1.507-.075 2.005c-.057.505-.153.862-.305 1.162a3.5 3.5 0 0 1-1.53 1.53c-.346.176-.766.276-1.402.328c-.642.053-1.459.053-2.587.053h-3.2c-1.128 0-1.945 0-2.586-.053c-.637-.052-1.057-.152-1.403-.328a3.5 3.5 0 0 1-1.592-1.663c-.138-.321-.22-.713-.266-1.27M19.5 12.54l-.925-.958a18 18 0 0 0-.976-.968c-.283-.248-.558-.439-.881-.546a2.5 2.5 0 0 0-1.579 0c-.323.107-.598.298-.88.546c-.275.24-.588.565-.977.968l-3.019 3.126a.33.33 0 0 1-.492-.018l-.015-.018c-.41-.491-.738-.885-1.027-1.177c-.296-.298-.59-.53-.942-.659a2.5 2.5 0 0 0-1.717 0c-.352.13-.645.36-.942.66a12 12 0 0 0-.628.7V10.4c0-1.128 0-1.945.053-2.586c.052-.637.152-1.057.328-1.403a3.5 3.5 0 0 1 1.53-1.53c.346-.176.766-.276 1.403-.328C8.455 4.5 9.272 4.5 10.4 4.5h3.2c1.128 0 1.945 0 2.586.053c.637.052 1.057.152 1.403.328a3.5 3.5 0 0 1 1.53 1.53c.176.346.276.766.328 1.403c.053.641.053 1.458.053 2.586z"/></svg>`;

export function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
