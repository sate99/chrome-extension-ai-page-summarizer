const PROVIDERS = ['claude', 'openai', 'custom'];

document.addEventListener('DOMContentLoaded', init);

function init() {
  loadConfig();

  PROVIDERS.forEach(id => {
    const card = document.getElementById(`card-${id}`);
    const header = card.querySelector('.provider-card-header');
    header.addEventListener('click', () => selectProvider(id));
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProvider(id); }
    });
    card.querySelector('.save-btn').addEventListener('click', () => saveProvider(id));
    card.querySelector('.clear-btn').addEventListener('click', () => clearProvider(id));
  });

  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleVisibility(btn));
  });

  // Show auth type field only for Anthropic format
  const formatSelect = document.getElementById('custom-format');
  const authTypeField = document.getElementById('field-auth-type');
  const syncAuthVisibility = () => {
    authTypeField.style.display = formatSelect.value === 'anthropic' ? '' : 'none';
  };
  formatSelect.addEventListener('change', syncAuthVisibility);
  syncAuthVisibility();

  // Parse models input and populate active model dropdown
  const modelsInput = document.getElementById('custom-models-input');
  modelsInput.addEventListener('input', () => syncModelDropdown());
}

function syncModelDropdown(activeModel = null) {
  const raw = document.getElementById('custom-models-input').value;
  const models = parseModels(raw);
  const fieldActiveModel = document.getElementById('field-active-model');
  const select = document.getElementById('custom-active-model');

  if (models.length > 1) {
    const prev = activeModel || select.value;
    select.innerHTML = models.map(m =>
      `<option value="${m}"${m === prev ? ' selected' : ''}>${m}</option>`
    ).join('');
    fieldActiveModel.classList.remove('hidden');
  } else {
    select.innerHTML = '';
    fieldActiveModel.classList.add('hidden');
  }
}

function parseModels(raw) {
  return raw.split(',').map(m => m.trim()).filter(Boolean);
}

function loadConfig() {
  chrome.storage.local.get(['provider', 'claude', 'openai', 'custom'], result => {
    const activeProvider = result.provider || 'claude';

    if (result.claude) {
      document.getElementById('claude-key').value = result.claude.apiKey || '';
      if (result.claude.model) document.getElementById('claude-model').value = result.claude.model;
    }

    if (result.openai) {
      document.getElementById('openai-key').value = result.openai.apiKey || '';
      if (result.openai.model) document.getElementById('openai-model').value = result.openai.model;
    }

    if (result.custom) {
      document.getElementById('custom-format').value = result.custom.format || 'anthropic';
      document.getElementById('custom-auth-type').value = result.custom.authType || 'bearer';
      document.getElementById('custom-url').value = result.custom.baseUrl || '';
      document.getElementById('custom-key').value = result.custom.apiKey || '';

      // Restore models input and active model dropdown
      const models = result.custom.models || (result.custom.model ? [result.custom.model] : []);
      document.getElementById('custom-models-input').value = models.join(', ');
      syncModelDropdown(result.custom.model);

      const fmt = document.getElementById('custom-format').value;
      document.getElementById('field-auth-type').style.display = fmt === 'anthropic' ? '' : 'none';
    }

    activateCard(activeProvider);
  });
}

function selectProvider(id) {
  activateCard(id);
  chrome.storage.local.set({ provider: id });
}

function activateCard(id) {
  PROVIDERS.forEach(p => {
    document.getElementById(`card-${p}`).classList.toggle('active', p === id);
  });
}

function saveProvider(id) {
  let data = {};
  let error = null;

  if (id === 'claude') {
    const apiKey = document.getElementById('claude-key').value.trim();
    const model = document.getElementById('claude-model').value;
    if (!apiKey) { error = 'Please enter a Claude API key.'; }
    else if (!apiKey.startsWith('sk-ant-')) { error = 'Claude API key should start with "sk-ant-".'; }
    else { data = { apiKey, model }; }
  }

  if (id === 'openai') {
    const apiKey = document.getElementById('openai-key').value.trim();
    const model = document.getElementById('openai-model').value;
    if (!apiKey) { error = 'Please enter an OpenAI API key.'; }
    else { data = { apiKey, model }; }
  }

  if (id === 'custom') {
    const format = document.getElementById('custom-format').value;
    const authType = document.getElementById('custom-auth-type').value;
    const baseUrl = document.getElementById('custom-url').value.trim();
    const apiKey = document.getElementById('custom-key').value.trim();
    const models = parseModels(document.getElementById('custom-models-input').value);
    const model = models.length > 1
      ? document.getElementById('custom-active-model').value
      : models[0];

    if (!baseUrl) { error = 'Please enter the base URL.'; }
    else if (!models.length) { error = 'Please enter at least one model name.'; }
    else {
      try { new URL(baseUrl); } catch { error = 'Please enter a valid URL.'; }
      if (!error) data = { format, authType, baseUrl, apiKey, models, model };
    }
  }

  if (error) { showStatus(error, 'error'); return; }

  chrome.storage.local.set({ [id]: data, provider: id }, () => {
    activateCard(id);
    showStatus(`${providerLabel(id)} settings saved.`, 'success');
  });
}

function clearProvider(id) {
  chrome.storage.local.remove([id], () => {
    if (id === 'claude') { document.getElementById('claude-key').value = ''; }
    if (id === 'openai') { document.getElementById('openai-key').value = ''; }
    if (id === 'custom') {
      document.getElementById('custom-format').value = 'anthropic';
      document.getElementById('custom-auth-type').value = 'bearer';
      document.getElementById('field-auth-type').style.display = 'none';
      document.getElementById('custom-url').value = '';
      document.getElementById('custom-key').value = '';
      document.getElementById('custom-models-input').value = '';
      document.getElementById('field-active-model').classList.add('hidden');
    }
    showStatus(`${providerLabel(id)} settings cleared.`, 'success');
  });
}

function toggleVisibility(btn) {
  const inputId = btn.dataset.target;
  const input = document.getElementById(inputId);
  const eyeOpen = btn.querySelector('.eye-open');
  const eyeClosed = btn.querySelector('.eye-closed');
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  eyeOpen.classList.toggle('hidden', isHidden);
  eyeClosed.classList.toggle('hidden', !isHidden);
}

function showStatus(message, type) {
  const el = document.getElementById('globalStatus');
  el.textContent = message;
  el.className = `status-msg ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'status-msg hidden'; }, 4000);
}

function providerLabel(id) {
  return { claude: 'Claude', openai: 'OpenAI', custom: 'Custom' }[id] || id;
}
