document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('changeProviderBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
  document.getElementById('summarizeBtn').addEventListener('click', handleSummarize);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.title) {
    document.getElementById('pageTitle').textContent = tab.title;
    document.getElementById('pageInfo').classList.remove('hidden');
  }

  const config = await getProviderConfig();
  updateProviderBadge(config);
  setupModelSwitcher(config);

  if (!isConfigured(config)) {
    showStatus('No API key configured. Open settings to get started.', 'warning');
    document.getElementById('summarizeBtn').disabled = true;
  }
}

async function handleSummarize() {
  const config = await getProviderConfig();
  if (!isConfigured(config)) {
    chrome.runtime.openOptionsPage();
    return;
  }

  const btn = document.getElementById('summarizeBtn');
  btn.disabled = true;
  hideStatus();
  showView('loading');

  try {
    const content = await getPageContent();
    // API call runs in background service worker — no CORS restrictions
    const result = await chrome.runtime.sendMessage({ type: 'SUMMARIZE', content, config });
    if (!result.ok) throw new Error(result.error);
    renderSummary(result.summary);
    showView('result');
  } catch (err) {
    showView('empty');
    showStatus(err.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Provider config ──────────────────────────────────────────────────────────

function getProviderConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['provider', 'claude', 'openai', 'custom'], result => {
      resolve({
        provider: result.provider || 'claude',
        claude: result.claude || {},
        openai: result.openai || { model: 'gpt-4o' },
        custom: result.custom || {},
      });
    });
  });
}

function isConfigured(config) {
  const p = config.provider;
  if (p === 'claude') return !!config.claude?.apiKey;
  if (p === 'openai') return !!config.openai?.apiKey;
  if (p === 'custom') return !!(config.custom?.apiKey && config.custom?.baseUrl && config.custom?.model);
  return false;
}

function updateProviderBadge(config) {
  const labels = {
    claude: `Claude · ${config.claude?.model || 'claude-sonnet-4-6'}`,
    openai: `OpenAI · ${config.openai?.model || 'gpt-4o'}`,
    custom: `Custom · ${config.custom?.model || 'model'}`,
  };
  document.getElementById('providerBadge').textContent = labels[config.provider] || '';
}

function setupModelSwitcher(config) {
  const switcher = document.getElementById('modelSwitcher');
  const select = document.getElementById('modelSelect');

  // Only show for custom provider with multiple models
  if (config.provider !== 'custom') return;
  const models = config.custom?.models;
  if (!models || models.length <= 1) return;

  select.innerHTML = models.map(m =>
    `<option value="${m}"${m === config.custom.model ? ' selected' : ''}>${m}</option>`
  ).join('');

  switcher.classList.remove('hidden');

  select.addEventListener('change', () => {
    chrome.storage.local.get(['custom'], result => {
      const updated = { ...(result.custom || {}), model: select.value };
      chrome.storage.local.set({ custom: updated });
      document.getElementById('providerBadge').textContent = `Custom · ${select.value}`;
    });
  });
}

// ── Page extraction ──────────────────────────────────────────────────────────

async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) throw new Error('Cannot access this page.');
  if (/^(chrome|chrome-extension|about):/.test(tab.url)) {
    throw new Error('Cannot summarize browser internal pages.');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageText,
  });

  const text = results?.[0]?.result;
  if (!text || text.trim().length < 50) {
    throw new Error('Could not extract meaningful content from this page.');
  }
  return text;
}

function extractPageText() {
  const clone = document.documentElement.cloneNode(true);
  ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
    'nav', 'footer', 'header', '[role="navigation"]', '[role="banner"]',
    '[role="contentinfo"]', '.nav', '.navbar', '.footer', '.sidebar',
    '.advertisement', '.ads', '.cookie-banner',
  ].forEach(sel => { try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch {} });

  const main = clone.querySelector('main, article, [role="main"], .main-content, #content, #main, .post-content, .entry-content');
  const text = ((main || clone.body)?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return `Title: ${document.title}\nURL: ${location.href}\n\n${text}`.slice(0, 50000);
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderSummary(markdownText) {
  const container = document.getElementById('summaryContent');
  container.innerHTML = '';

  const lines = markdownText.split('\n');
  let currentList = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentList) { container.appendChild(currentList); currentList = null; }
      continue;
    }

    if (/^#{2,3}\s+/.test(trimmed)) {
      if (currentList) { container.appendChild(currentList); currentList = null; }
      const h = document.createElement('h3');
      renderInline(trimmed.replace(/^#{2,3}\s+/, ''), h);
      container.appendChild(h);
      continue;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.*)/);
    if (bullet) {
      if (!currentList || currentList.tagName !== 'UL') {
        if (currentList) container.appendChild(currentList);
        currentList = document.createElement('ul');
      }
      const li = document.createElement('li');
      renderInline(bullet[1], li);
      currentList.appendChild(li);
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.*)/);
    if (numbered) {
      if (!currentList || currentList.tagName !== 'OL') {
        if (currentList) container.appendChild(currentList);
        currentList = document.createElement('ol');
      }
      const li = document.createElement('li');
      renderInline(numbered[1], li);
      currentList.appendChild(li);
      continue;
    }

    if (currentList) { container.appendChild(currentList); currentList = null; }
    const p = document.createElement('p');
    renderInline(trimmed, p);
    container.appendChild(p);
  }

  if (currentList) container.appendChild(currentList);
}

function renderInline(text, container) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      const el = document.createElement('strong');
      el.textContent = part.slice(2, -2);
      container.appendChild(el);
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      const el = document.createElement('em');
      el.textContent = part.slice(1, -1);
      container.appendChild(el);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      const el = document.createElement('code');
      el.textContent = part.slice(1, -1);
      container.appendChild(el);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function showView(view) {
  document.getElementById('emptyState').classList.toggle('hidden', view !== 'empty');
  document.getElementById('loadingState').classList.toggle('hidden', view !== 'loading');
  document.getElementById('resultState').classList.toggle('hidden', view !== 'result');
}

function showStatus(message, type = 'info') {
  const el = document.getElementById('statusBar');
  el.textContent = message;
  el.className = `status-bar ${type}`;
}

function hideStatus() {
  document.getElementById('statusBar').className = 'status-bar hidden';
}

async function copyToClipboard() {
  const text = document.getElementById('summaryContent').innerText;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    Object.assign(ta.style, { position: 'fixed', opacity: '0' });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  const copyIcon = document.getElementById('copyIcon');
  const checkIcon = document.getElementById('checkIcon');
  copyIcon.classList.add('hidden');
  checkIcon.classList.remove('hidden');
  setTimeout(() => { copyIcon.classList.remove('hidden'); checkIcon.classList.add('hidden'); }, 2000);
}
