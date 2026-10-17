importScripts('common.js');

// ---------- Providers ----------

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function httpError(res, data) {
  const msg =
    data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || data?._raw || res.statusText;
  if (res.status === 401 || res.status === 403) return new Error('API key was rejected. Check it in settings.');
  if (res.status === 404) return new Error('Model not found. Change the model name in settings.');
  if (res.status === 429) return new Error('Rate limit or free quota reached. Wait a minute and try again.');
  return new Error(`${res.status}: ${String(msg).slice(0, 200)}`);
}

async function askGemini(key, model, system, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0 }
    })
  });
  const data = await readJson(res);
  if (!res.ok) throw httpError(res, data);
  const parts = data.candidates?.[0]?.content?.parts || [];
  const out = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim();
  if (!out) throw new Error(data.promptFeedback?.blockReason ? 'Gemini blocked this text.' : 'Empty reply from Gemini.');
  return out;
}

async function askOpenAICompatible(baseUrl, key, model, system, text) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text }
      ]
    })
  });
  const data = await readJson(res);
  if (!res.ok) throw httpError(res, data);
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('Empty reply from the AI.');
  return out;
}

async function askAnthropic(key, model, system, text) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: text }]
    })
  });
  const data = await readJson(res);
  if (!res.ok) throw httpError(res, data);
  if (data.stop_reason === 'refusal') throw new Error('Claude declined to answer this one.');
  const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!out) throw new Error('Empty reply from Claude.');
  return out;
}

// Chrome's built-in model runs in an offscreen page, because service workers can't use it.
let creatingOffscreen = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'],
        justification: "Runs Chrome's built-in AI to answer the selected question."
      })
      .finally(() => (creatingOffscreen = null));
  }
  await creatingOffscreen;
}

async function askBuiltin(system, text) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'builtin-ask', system, text });
  if (!res?.ok) throw new Error(res?.error || 'Built-in AI failed.');
  return res.answer.trim();
}

async function ask(text) {
  const s = await QA.loadSettings();
  const system = QA.buildSystemPrompt(s.showReason);
  const p = s.provider;
  const key = (s.keys[p] || '').trim();
  const model = (s.models[p] || QA.DEFAULTS.models[p] || '').trim();
  if (p !== 'builtin' && !key) throw new Error('No API key yet. Open the extension settings to add one.');
  const input = text.slice(0, 12000);

  switch (p) {
    case 'gemini':
      return askGemini(key, model, system, input);
    case 'groq':
      return askOpenAICompatible('https://api.groq.com/openai/v1', key, model, system, input);
    case 'openai':
      return askOpenAICompatible('https://api.openai.com/v1', key, model, system, input);
    case 'anthropic':
      return askAnthropic(key, model, system, input);
    case 'builtin':
      return askBuiltin(system, input);
    default:
      throw new Error('Unknown provider. Pick one in settings.');
  }
}

// ---------- Messaging ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ask') return;
  ask(String(msg.text || ''))
    .then((answer) => sendResponse({ ok: true, answer }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true; // keep the channel open for the async reply
});

// ---------- Keyboard shortcut and right-click menu ----------

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({ id: 'qa-answer', title: 'Get answer', contexts: ['selection'] });
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'qa-answer' || !tab?.id) return;
  chrome.tabs
    .sendMessage(tab.id, { type: 'answer-text', text: info.selectionText || '' }, { frameId: info.frameId ?? 0 })
    .catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'ask-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'answer-selection' }).catch(() => {});
});
