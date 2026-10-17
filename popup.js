(async () => {
  const s = await QA.loadSettings();
  const en = document.getElementById('enabled');
  const info = document.getElementById('info');

  const needsKey = s.provider !== 'builtin' && !s.keys[s.provider];
  info.textContent = needsKey
    ? 'Setup needed: open Settings and add a key.'
    : `Using ${QA.PROVIDERS[s.provider].label}.`;

  en.checked = s.enabled;
  en.addEventListener('change', () => chrome.storage.local.set({ enabled: en.checked }));
  document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
})();
