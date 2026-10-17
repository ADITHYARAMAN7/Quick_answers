(() => {
  // If an older copy of this script is still running (extension reloaded), shut it down.
  try {
    window.__quickAnswerTeardown?.();
  } catch {}

  const log = (...a) => console.debug('[QuickAnswer]', ...a);
  const cleanups = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  function teardown() {
    cleanups.splice(0).forEach((f) => f());
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {}
  }
  window.__quickAnswerTeardown = teardown;
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };

  let settings = { ...QA.DEFAULTS };
  QA.loadSettings().then((s) => (settings = s)).catch(() => {});
  chrome.storage.onChanged.addListener(() => {
    if (alive()) QA.loadSettings().then((s) => (settings = s)).catch(() => {});
  });

  function siteAllowed() {
    if (!settings.enabled) return false;
    const list = String(settings.sites || '')
      .split(/\n|,/)
      .map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter(Boolean);
    if (!list.length) return true;
    // Frames inside an allowed site count too.
    const hosts = [location.hostname];
    try {
      hosts.push(window.top.location.hostname);
    } catch {}
    for (const o of location.ancestorOrigins || []) {
      try {
        hosts.push(new URL(o).hostname);
      } catch {}
    }
    return hosts.some((h) => list.some((p) => h === p || h.endsWith('.' + p)));
  }

  function selectedText() {
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search)$/i.test(el.type)))) {
      try {
        const t = el.value.substring(el.selectionStart, el.selectionEnd);
        if (t) return t;
      } catch {}
    }
    return String(window.getSelection() || '');
  }

  // ---------- Asking ----------

  let lastText = '';
  let lastTime = 0;
  let requestId = 0;

  async function answer(raw, source) {
    if (!alive()) return teardown();
    const text = String(raw || '').replace(/ /g, ' ').trim();
    if (text.length < (Number(settings.minLength) || 0)) {
      log(`ignored (${source}): only ${text.length} characters`);
      return;
    }
    const now = Date.now();
    if (text === lastText && now - lastTime < 2000) return; // copy event + Ctrl+C both fire
    lastText = text;
    lastTime = now;
    log(`asking (${source}):`, text.slice(0, 80));

    const id = ++requestId;
    toast.loading();
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'ask', text });
    } catch (e) {
      res = { ok: false, error: 'Extension was updated. Reload this page.' };
    }
    if (id !== requestId) return; // a newer copy replaced this one
    if (res?.ok) toast.show(res.answer);
    else toast.error(res?.error || 'Something went wrong.');
  }

  function onCopyLike(source) {
    if (!settings.triggerOnCopy) return;
    if (!siteAllowed()) return log('site not in the allowed list');
    const t = selectedText();
    if (t.trim()) answer(t, source);
  }

  // Capture phase on window runs before the page's own handlers.
  on(window, 'copy', () => onCopyLike('copy'), true);
  // Backup for pages that cancel Ctrl+C before a copy event happens.
  on(
    window,
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
        setTimeout(() => onCopyLike('ctrl+c'), 0);
      }
    },
    true
  );

  function onMessage(msg) {
    if (msg?.type === 'answer-text') {
      if (settings.enabled) answer(msg.text, 'menu');
    } else if (msg?.type === 'answer-selection') {
      const t = selectedText();
      if (t.trim() && settings.enabled) answer(t, 'shortcut'); // only the frame with a selection answers
    }
  }
  chrome.runtime.onMessage.addListener(onMessage);

  // ---------- Popup ----------
  // Shown as a "popover" so it sits above full-screen views and dialogs,
  // inside a closed shadow root so page styles can't change it.

  const toast = (() => {
    let host, box, hideTimer, removeTimer;

    const CSS = `
      .box {
        position: fixed;
        max-width: min(340px, calc(100vw - 32px));
        padding: 8px 12px; border-radius: 10px;
        font: 500 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #f5f5f5; background: rgba(24, 24, 27, 0.92);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.08);
        cursor: pointer; user-select: none; text-align: left;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        white-space: pre-wrap; word-break: break-word;
      }
      .box.show { opacity: 1; transform: none; }
      .bottom-right { right: 16px; bottom: 16px; }
      .bottom-left  { left: 16px;  bottom: 16px; }
      .top-right    { right: 16px; top: 16px; }
      .top-left     { left: 16px;  top: 16px; }
      .answer { font-weight: 600; }
      .why { margin-top: 4px; font-weight: 400; color: #c4c4c8; font-size: 12px; }
      .err { color: #fca5a5; }
      .dots { display: inline-flex; gap: 4px; padding: 3px 2px; }
      .dots i { width: 5px; height: 5px; border-radius: 50%; background: #d4d4d8; animation: b 1s infinite ease-in-out; }
      .dots i:nth-child(2) { animation-delay: .15s; }
      .dots i:nth-child(3) { animation-delay: .3s; }
      @keyframes b { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
    `;

    const HOST_STYLE = {
      all: 'initial',
      position: 'fixed',
      inset: '0',
      width: '0',
      height: '0',
      margin: '0',
      padding: '0',
      border: '0',
      background: 'transparent',
      overflow: 'visible',
      'z-index': '2147483647',
      display: 'block',
      'pointer-events': 'auto'
    };

    function ensure() {
      clearTimeout(removeTimer);
      if (host && host.isConnected) {
        // Re-raise above anything the page opened since.
        if (host.showPopover && host.matches(':popover-open')) {
          host.hidePopover();
          host.showPopover();
        }
        return;
      }
      host = document.createElement('div');
      for (const [k, v] of Object.entries(HOST_STYLE)) host.style.setProperty(k, v, 'important');
      const root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = CSS;
      box = document.createElement('div');
      root.append(style, box);
      box.addEventListener('click', hide);
      box.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      box.addEventListener('mouseleave', () => scheduleHide());
      (document.fullscreenElement || document.body || document.documentElement).appendChild(host);
      if (host.showPopover) {
        host.setAttribute('popover', 'manual');
        try {
          host.showPopover();
        } catch {}
      }
    }

    function render(build) {
      ensure();
      clearTimeout(hideTimer);
      box.className = 'box ' + (settings.position || 'bottom-right');
      box.replaceChildren();
      build(box);
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('show')));
    }

    function scheduleHide(seconds = Number(settings.hideAfter)) {
      clearTimeout(hideTimer);
      if (seconds > 0) hideTimer = setTimeout(hide, seconds * 1000);
    }

    function hide() {
      clearTimeout(hideTimer);
      if (!box) return;
      box.classList.remove('show');
      removeTimer = setTimeout(() => host?.remove(), 200);
    }

    on(document, 'keydown', (e) => e.key === 'Escape' && hide(), true);
    cleanups.push(() => host?.remove());

    return {
      loading() {
        render((b) => {
          const d = document.createElement('span');
          d.className = 'dots';
          d.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
          b.append(d);
        });
      },
      show(text) {
        const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
        const why = lines.filter((l) => /^why:/i.test(l)).join(' ');
        const ans = lines.filter((l) => !/^why:/i.test(l)).join('\n').replace(/\*\*/g, '');
        render((b) => {
          const a = document.createElement('div');
          a.className = 'answer';
          a.textContent = ans || text;
          b.append(a);
          if (why) {
            const w = document.createElement('div');
            w.className = 'why';
            w.textContent = why.replace(/^why:\s*/i, '');
            b.append(w);
          }
        });
        scheduleHide();
      },
      error(msg) {
        render((b) => {
          const e = document.createElement('div');
          e.className = 'err';
          e.textContent = msg;
          b.append(e);
        });
        scheduleHide(Math.max(Number(settings.hideAfter) || 0, 6));
      }
    };
  })();

  log('ready on', location.href);
})();
