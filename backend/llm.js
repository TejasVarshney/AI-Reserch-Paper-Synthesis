// llm.js
// Client for chat LLMs. Supports two wire formats:
//   • openai    — POST {base}/chat/completions  (OpenAI, Groq, Ollama, …)
//   • anthropic — POST {base}/messages          (Anthropic Messages API)
// The style is auto-detected from the endpoint/model, or forced with
// LLM_API_STYLE. All configuration comes from environment variables.

const ENDPOINT = process.env.LLM_ENDPOINT;
const MODEL = process.env.LLM_MODEL;
const API_KEY = process.env.LLM_API_KEY;
const TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0.3);
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 4096);
const STYLE_CFG = (process.env.LLM_API_STYLE || 'auto').toLowerCase();

const ANTHROPIC_VERSION = '2023-06-01';

/** Decide which wire format to use. */
function detectStyle() {
  if (STYLE_CFG === 'openai' || STYLE_CFG === 'anthropic') return STYLE_CFG;
  const e = (ENDPOINT || '').toLowerCase();
  if (e.endsWith('/messages')) return 'anthropic';
  if (e.endsWith('/chat/completions')) return 'openai';
  const m = (MODEL || '').toLowerCase();
  if (m.startsWith('anthropic/') || m.includes('claude')) return 'anthropic';
  if (m.includes('gemma')) return 'openai';
  return 'openai';
}
const STYLE = detectStyle();

/** Turn a base URL or full URL into the concrete endpoint for this style. */
function resolveUrl() {
  if (!ENDPOINT) return ENDPOINT;
  const e = ENDPOINT.replace(/\/+$/, '');
  if (STYLE === 'anthropic') return /\/messages$/.test(e) ? e : `${e}/messages`;
  return /\/chat\/completions$/.test(e) ? e : `${e}/chat/completions`;
}
const CHAT_URL = resolveUrl();

/** Endpoint + model are required; the API key may be blank for local servers. */
export function isConfigured() {
  return Boolean(ENDPOINT && MODEL);
}

/** Non-secret view of the active config, for the /health endpoint. */
export function configSummary() {
  return {
    endpoint: ENDPOINT || null,
    url: CHAT_URL || null,
    model: MODEL || null,
    style: STYLE,
    hasApiKey: Boolean(API_KEY),
    temperature: TEMPERATURE,
    maxTokens: MAX_TOKENS,
    configured: isConfigured(),
  };
}

function buildRequest(messages) {
  if (STYLE === 'anthropic') {
    // Anthropic takes the system prompt as a top-level field.
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const convo = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    const body = { model: MODEL, max_tokens: MAX_TOKENS, temperature: TEMPERATURE, messages: convo };
    if (system) body.system = system;
    const headers = { 'Content-Type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION };
    if (API_KEY) headers['x-api-key'] = API_KEY;
    return { headers, body };
  }

  // OpenAI chat-completions
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
  const body = { model: MODEL, messages, temperature: TEMPERATURE, max_tokens: MAX_TOKENS, stream: false };
  return { headers, body };
}

function parseResponse(data) {
  if (STYLE === 'anthropic') {
    const content = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let usage = null;
    if (data.usage) {
      const inp = data.usage.input_tokens || 0;
      const out = data.usage.output_tokens || 0;
      usage = { ...data.usage, total_tokens: inp + out };
    }
    return { content, usage, model: data.model || MODEL };
  }

  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
  return { content, usage: data.usage ?? null, model: data.model || MODEL };
}

/**
 * Send messages to the LLM and return the assistant text.
 * @param {Array<{role: string, content: string}>} messages
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<{content: string, usage: object|null, model: string}>}
 */
export async function chat(messages, opts = {}) {
  if (!isConfigured()) {
    throw new Error('LLM is not configured. Set LLM_ENDPOINT and LLM_MODEL in backend/.env.');
  }

  const { headers, body } = buildRequest(messages);

  let res;
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw new Error(`Could not reach LLM endpoint (${CHAT_URL}): ${err.message}`);
  }

  const raw = await res.text();

  if (!res.ok) {
    let detail = raw.slice(0, 300);
    try {
      const j = JSON.parse(raw);
      detail = j.error?.message || j.error || j.message || detail;
    } catch {
      /* keep raw text */
    }
    throw new Error(`LLM endpoint returned ${res.status}: ${detail}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('LLM endpoint returned a non-JSON response.');
  }

  const result = parseResponse(data);
  if (!result.content) throw new Error('LLM response did not contain any text content.');
  return result;
}
