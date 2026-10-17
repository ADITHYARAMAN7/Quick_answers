// Runs Chrome's built-in model (Gemini Nano) on behalf of the service worker.
const LANG = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'builtin-ask') return;
  run(msg)
    .then((answer) => sendResponse({ ok: true, answer }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});

async function run({ system, text }) {
  if (!('LanguageModel' in self)) {
    throw new Error("This browser doesn't have Chrome's built-in AI. Use a free Gemini key instead.");
  }
  const status = await LanguageModel.availability(LANG);
  if (status === 'unavailable') throw new Error("This computer can't run Chrome's built-in AI. Use a free Gemini key instead.");
  if (status !== 'available') throw new Error('Built-in AI is not downloaded yet. Open settings and click "Download model".');

  const session = await LanguageModel.create({ ...LANG, initialPrompts: [{ role: 'system', content: system }] });
  try {
    return await session.prompt(text);
  } finally {
    session.destroy();
  }
}
