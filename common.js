// Shared settings and prompt. Loaded by the service worker, content script, popup and options page.
(function () {
  const DEFAULTS = {
    enabled: true,
    provider: 'gemini', // gemini | groq | openai | anthropic | builtin
    keys: { gemini: '', groq: '', openai: '', anthropic: '' },
    models: {
      gemini: 'gemini-flash-latest',
      groq: 'openai/gpt-oss-120b',
      openai: 'gpt-5-mini',
      anthropic: 'claude-opus-5-5'
    },
    triggerOnCopy: true,
    sites: '', // one per line; empty = every site
    minLength: 15,
    hideAfter: 10, // seconds, 0 = stay until clicked
    showReason: false,
    position: 'bottom-right' // bottom-right | bottom-left | top-right | top-left
  };

  const PROVIDERS = {
    gemini: { label: 'Google Gemini', free: true, keyUrl: 'https://aistudio.google.com/app/apikey' },
    groq: { label: 'Groq', free: true, keyUrl: 'https://console.groq.com/keys' },
    openai: { label: 'OpenAI (ChatGPT)', free: false, keyUrl: 'https://platform.openai.com/api-keys' },
    anthropic: { label: 'Anthropic (Claude)', free: false, keyUrl: 'https://console.anthropic.com/settings/keys' },
    builtin: { label: 'Chrome built-in AI', free: true, keyUrl: '' }
  };

  async function loadSettings() {
    const s = await chrome.storage.local.get(null);
    return {
      ...DEFAULTS,
      ...s,
      keys: { ...DEFAULTS.keys, ...(s.keys || {}) },
      models: { ...DEFAULTS.models, ...(s.models || {}) }
    };
  }

  function buildSystemPrompt(showReason) {
    let p =
      'You answer multiple-choice questions for a student practising with mock tests. ' +
      'The user pastes a question copied from a web page; the formatting may be messy. ' +
      'Work out the correct answer.\n' +
      'Reply in exactly this format and nothing else:\n' +
      'Option <letter>: <option text>\n' +
      'Use the number instead of a letter if the options are numbered. ' +
      'If several options are correct, put each on its own line. ' +
      'If there are no options, reply with only the shortest correct answer.';
    if (showReason) p += '\nThen add one final line starting with "Why:" and a one-sentence reason.';
    return p;
  }

  globalThis.QA = { DEFAULTS, PROVIDERS, loadSettings, buildSystemPrompt };
})();
