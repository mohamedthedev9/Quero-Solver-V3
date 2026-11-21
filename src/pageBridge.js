// src/pageBridge.js
export const PAGE_BRIDGE_JS = /* javascript */ `
(function () {
  if (window.__qshMobileBridgeV6) return;
  window.__qshMobileBridgeV6 = true;

  function postToApp(payload) {
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (_) {}
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const cs = window.getComputedStyle(el);
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getLessonText() {
    const selectors = [
      'main', 'article', '[role="main"]',
      '[class*="instruction" i]', '[class*="lesson" i]', '[class*="task" i]',
      '[class*="question" i]', '[class*="prompt" i]', '[class*="dialog" i]'
    ];
    for (const sel of selectors) {
      const nodes = [...document.querySelectorAll(sel)].filter(isVisible);
      const best = nodes
        .map((n) => (n.innerText || '').trim())
        .filter((t) => t.length >= 25)
        .sort((a, b) => b.length - a.length)[0];
      if (best) return best.slice(0, 6000);
    }
    return (document.body && document.body.innerText ? document.body.innerText.trim() : '').slice(0, 6000);
  }

  function getEditableTargets() {
    const raw = [...document.querySelectorAll('textarea, input, [contenteditable="true"]')].filter((el) => {
      if (!isVisible(el) || el.disabled || el.readOnly) return false;
      if (el.tagName === 'INPUT') {
        const type = (el.type || 'text').toLowerCase();
        if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'range', 'color', 'file'].includes(type)) {
          return false;
        }
      }
      return true;
    });

    return raw.slice(0, 12).map((el, index) => {
      const value =
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
          ? el.value || ''
          : el.innerText || el.textContent || '';
      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        (el.closest('li, p, div') ? (el.closest('li, p, div').innerText || '').trim().slice(0, 80) : '');
      return {
        index,
        tag: el.tagName.toLowerCase(),
        label: String(label).replace(/\\s+/g, ' ').trim(),
        value: String(value),
      };
    });
  }

  function setEditableValue(index, code) {
    const raw = [...document.querySelectorAll('textarea, input, [contenteditable="true"]')].filter((el) => {
      if (!isVisible(el) || el.disabled || el.readOnly) return false;
      if (el.tagName === 'INPUT') {
        const type = (el.type || 'text').toLowerCase();
        if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'range', 'color', 'file'].includes(type)) {
          return false;
        }
      }
      return true;
    });

    const el = raw[index];
    if (!el) return { ok: false, error: 'Target field not found' };

    try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.focus();
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, code);
      else el.value = code;
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return { ok: true };
    }

    if (el.getAttribute('contenteditable') === 'true') {
      el.focus();
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, code);
      } catch (_) {
        el.textContent = code;
      }
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      return { ok: true };
    }

    return { ok: false, error: 'Unsupported element type' };
  }

  function findButtonByPattern(pattern) {
    const els = [...document.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]')];
    for (const el of els) {
      if (!isVisible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const txt = String(el.value || el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
      if (txt && txt.length <= 40 && pattern.test(txt)) return el;
    }
    return null;
  }

  async function clickRunAndCapture() {
    const btn = findButtonByPattern(/تشغيل|شغّل|شغل|\\brun\\b/i);
    if (!btn) return { clicked: false, afterRun: '', errors: '' };
    try { btn.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
    btn.click();

    await new Promise((r) => setTimeout(r, 900));

    const errNodes = [...document.querySelectorAll('[role="alert"], [class*="error" i], [class*="fail" i], [class*="wrong" i]')].filter(isVisible);
    const errors = errNodes.map((n) => (n.innerText || '').trim()).filter(Boolean).slice(0, 4).join(' | ');
    const afterRun = (document.body && document.body.innerText ? document.body.innerText.trim() : '').slice(-2200);
    return { clicked: true, afterRun, errors };
  }

  window.__qshMobileHandleCommand = async function (cmd) {
    if (!cmd || !cmd.type) return;
    if (cmd.type === 'READ_CONTEXT') {
      postToApp({
        type: 'CONTEXT_RESULT',
        requestId: cmd.requestId,
        data: {
          url: location.href,
          title: document.title,
          lesson: getLessonText(),
          fields: getEditableTargets(),
        },
      });
    } else if (cmd.type === 'WRITE_FIELD') {
      const res = setEditableValue(cmd.index, cmd.code);
      postToApp({
        type: 'WRITE_RESULT',
        requestId: cmd.requestId,
        data: Object.assign({ index: cmd.index }, res),
      });
    } else if (cmd.type === 'RUN_AND_CAPTURE') {
      const res = await clickRunAndCapture();
      postToApp({
        type: 'RUN_RESULT',
        requestId: cmd.requestId,
        data: res,
      });
    }
  };

  postToApp({ type: 'BRIDGE_READY', url: location.href });
})();
true;
`;