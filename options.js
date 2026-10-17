const $ = (id) => document.getElementById(id);
let s;

const STEPS = {
  gemini: [
    'Open <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a> and sign in with any Google account.',
    'Click <b>Create API key</b> and copy it.',
    'Paste it below. Free, no card needed.'
  ],
  groq: [
    'Open <a href="https://console.groq.com/keys" target="_blank">Groq Console</a> and sign in.',
    'Click <b>Create API Key</b> and copy it.',
    'Paste it below. Free tier, very fast.'
  ],
  openai: [
    'Open <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI API keys</a>.',
    'Create a key and copy it. Needs prepaid credit; a ChatGPT Plus subscription does not include API use.',
    'Paste it below. Each question costs a fraction of a cent.'
  ],
  anthropic: [
    'Open <a href="https://console.anthropic.com/settings/keys" target="_blank">Anthropic Console</a>.',
    'Create a key and copy it. Needs prepaid credit; a Claude Pro subscription does not include API use.',
    'Paste it below.'
  ]
};

function flash(el, text, kind) {
  el.textContent = text;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

async function save(patch) {
  Object.assign(s, patch);
  await chrome.storage.local.set(patch);
  flash($('saveStatus'), 'Saved', 'ok');
  setTimeout(() => flash($('saveStatus'), ''), 1200);
}

function renderProviders() {
  const wrap = $('providers');
  wrap.replaceChildren();
  for (const [id, p] of Object.entries(QA.PROVIDERS)) {
    const label = document.createElement('label');
    label.className = 'provider' + (s.provider === id ? ' selected' : '');
    label.innerHTML = `<input type="radio" name="provider" value="${id}"><b></b><span class="tag ${p.free ? '' : 'paid'}">${
      p.free ? 'Free' : 'Paid (cheap)'
    }</span>`;
    label.querySelector('b').textContent = p.label;
    label.querySelector('input').checked = s.provider === id;
    label.addEventListener('change', async () => {
      await save({ provider: id });
      renderProviders();
      renderProviderDetails();
    });
    wrap.append(label);
  }
}

function renderProviderDetails() {
  const p = s.provider;
  const builtin = p === 'builtin';
  $('keyCard').hidden = builtin;
  $('builtinCard').hidden = !builtin;
  flash($('testStatus'), '');
  if (builtin) {
    checkBuiltin();
    return;
  }
  $('keySteps').innerHTML = '<ol>' + STEPS[p].map((x) => `<li>${x}</li>`).join('') + '</ol>';
  $('key').value = s.keys[p] || '';
  $('model').value = s.models[p] || QA.DEFAULTS.models[p];
}

// ---------- Chrome built-in AI ----------

const LANG = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

async function checkBuiltin() {
  const st = $('builtinStatus');
  if (!('LanguageModel' in self)) {
    $('download').disabled = true;
    flash(st, "This browser doesn't support Chrome's built-in AI. Pick Google Gemini instead.", 'err');
    return;
  }
  const a = await LanguageModel.availability(LANG);
  $('download').disabled = a === 'available' || a === 'unavailable';
  if (a === 'available') flash(st, 'Model is ready.', 'ok');
  else if (a === 'unavailable') flash(st, "This computer can't run the built-in model. Pick Google Gemini instead.", 'err');
  else if (a === 'downloading') flash(st, 'Downloading…');
  else flash(st, 'Not downloaded yet.');
}

$('download').addEventListener('click', async () => {
  const st = $('builtinStatus');
  $('download').disabled = true;
  flash(st, 'Starting download…');
  try {
    const session = await LanguageModel.create({
      ...LANG,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => flash(st, `Downloading… ${Math.round(e.loaded * 100)}%`));
      }
    });
    session.destroy();
    flash(st, 'Model is ready.', 'ok');
  } catch (e) {
    flash(st, 'Download failed: ' + e.message, 'err');
    $('download').disabled = false;
  }
});

// ---------- Key / model ----------

$('key').addEventListener('change', () => save({ keys: { ...s.keys, [s.provider]: $('key').value.trim() } }));
$('model').addEventListener('change', () =>
  save({ models: { ...s.models, [s.provider]: $('model').value.trim() || QA.DEFAULTS.models[s.provider] } })
);
$('showKey').addEventListener('click', () => {
  const k = $('key');
  k.type = k.type === 'password' ? 'text' : 'password';
  $('showKey').textContent = k.type === 'password' ? 'Show' : 'Hide';
});

// ---------- Test ----------

$('test').addEventListener('click', async () => {
  // Save whatever is typed even if the field hasn't lost focus yet.
  if (s.provider !== 'builtin') await save({ keys: { ...s.keys, [s.provider]: $('key').value.trim() } });
  const st = $('testStatus');
  flash(st, 'Asking…');
  $('test').disabled = true;
  const q = 'Which planet is known as the Red Planet?\nA) Venus\nB) Mars\nC) Jupiter\nD) Saturn';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'ask', text: q });
    if (res?.ok) flash(st, `Works! The AI replied:\n${res.answer}`, 'ok');
    else flash(st, res?.error || 'Failed', 'err');
  } catch (e) {
    flash(st, e.message, 'err');
  }
  $('test').disabled = false;
});

// ---------- Other options ----------

function bindCheck(id) {
  $(id).checked = !!s[id];
  $(id).addEventListener('change', () => save({ [id]: $(id).checked }));
}
function bindValue(id, num) {
  $(id).value = s[id];
  $(id).addEventListener('change', () => save({ [id]: num ? Math.max(0, Number($(id).value) || 0) : $(id).value }));
}

(async () => {
  s = await QA.loadSettings();
  renderProviders();
  renderProviderDetails();
  bindCheck('triggerOnCopy');
  bindCheck('showReason');
  bindValue('position');
  bindValue('hideAfter', true);
  bindValue('minLength', true);
  bindValue('sites');
})();
