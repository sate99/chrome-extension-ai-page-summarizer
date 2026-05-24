const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = 'You are a helpful assistant that summarizes web page content clearly and concisely. Format your response with a brief intro sentence, then bullet points for key points, and a short conclusion if needed. Use plain markdown (**, -, ##) for formatting.';
const USER_PROMPT = 'Please summarize the following web page content in under 300 words:\n\n';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

// Service workers bypass CORS — all API calls go through here
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'SUMMARIZE') return false;

  callApi(message.content, message.config)
    .then(summary => sendResponse({ ok: true, summary }))
    .catch(err => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open for async response
});

// ── Routing ──────────────────────────────────────────────────────────────────

function callApi(content, config) {
  switch (config.provider) {
    case 'openai': return callOpenAiApi(content, config.openai);
    case 'custom':  return callCustomApi(content, config.custom);
    default:        return callClaudeApi(content, config.claude);
  }
}

// ── Claude ───────────────────────────────────────────────────────────────────

async function callClaudeApi(content, cfg) {
  const res = await safeFetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model || 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT + content }],
    }),
  });

  await handleHttpError(res, 'claude');
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Claude.');
  return text;
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAiApi(content, cfg) {
  const res = await safeFetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model || 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT + content },
      ],
    }),
  });

  await handleHttpError(res, 'openai');
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI.');
  return text;
}

// ── Custom ───────────────────────────────────────────────────────────────────

async function callCustomApi(content, cfg) {
  // Anthropic-format: use /messages endpoint
  if (cfg.format === 'anthropic') {
    // Handle base URLs with or without /v1
    const base = cfg.baseUrl.replace(/\/$/, '');
    const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;

    // Corporate gateways use Bearer; standard Anthropic API uses x-api-key
    const headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' };
    if (cfg.authType === 'x-api-key') {
      headers['x-api-key'] = cfg.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }

    const res = await safeFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: USER_PROMPT + content }],
      }),
    });
    await handleHttpError(res, 'custom');
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error('Empty response from the custom endpoint.');
    return text;
  }

  // OpenAI-format (default): use /chat/completions with Bearer token
  const url = cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  const res = await safeFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT + content },
      ],
    }),
  });

  await handleHttpError(res, 'custom');
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from the custom endpoint.');
  return text;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    throw new Error('Network error — check your connection and the endpoint URL.');
  }
}

async function handleHttpError(res, provider) {
  if (res.ok) return;

  let apiMessage = '';
  let errorCode = '';
  try {
    const body = await res.json();
    apiMessage = body?.error?.message || body?.message || '';
    errorCode = body?.error?.code || body?.error?.type || '';
  } catch {}

  const status = res.status;
  if (status === 401) throw new Error('Invalid API key. Please update it in settings.');
  if (status === 403) throw new Error('Access denied. Check your API key permissions.');
  if (status === 404) throw new Error('Endpoint not found (404). Check the base URL in settings.');
  if (status === 405) throw new Error('Method not allowed (405). The base URL may be incorrect.');
  if (status === 429) {
    const isQuota = errorCode === 'insufficient_quota' || apiMessage.toLowerCase().includes('quota');
    if (isQuota) throw new Error('OpenAI account has no credits. Add billing at platform.openai.com/billing');
    throw new Error('Rate limit reached. Please wait a moment and try again.');
  }
  if (status === 400) throw new Error(apiMessage || 'Bad request — check model name or parameters.');
  if (status >= 500) throw new Error(`Server error (${status}). Try again later.`);
  throw new Error(apiMessage || `API error (${status}).`);
}
