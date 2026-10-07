// 委託表單：欄位驗證、honeypot、以 fetch 送出並在表單內顯示結果（不換頁）
import { S } from './site-chrome.js';

const msg = (key) => (S[key] || '').replaceAll('{email}', S.email || '');

export function initInquiryForm(form) {
  if (!form) return;
  const endpoint = form.dataset.endpoint;
  const statusEl = form.querySelector('.form-status');
  const submitBtn = form.querySelector('.inquiry-submit');
  const submitLabel = submitBtn.textContent;
  const field = (name) => form.elements.namedItem(name);
  const rules = [
    { name: 'name', key: 'form.err.name', ok: (el) => el.value.trim() !== '' },
    { name: 'email', key: 'form.err.email', ok: (el) => el.value.trim() !== '' && el.validity.valid },
    { name: 'type', key: 'form.err.type', ok: (el) => el.value !== '' },
    { name: 'details', key: 'form.err.details', ok: (el) => el.value.trim() !== '' },
  ];

  const setError = (el, key) => {
    const err = document.getElementById(`${el.id}-err`);
    if (!err) return;
    if (key) {
      err.textContent = msg(key);
      err.hidden = false;
      el.setAttribute('aria-invalid', 'true');
    } else {
      err.textContent = '';
      err.hidden = true;
      el.removeAttribute('aria-invalid');
    }
  };

  const validate = () => {
    let first = null;
    rules.forEach((r) => {
      const el = field(r.name);
      const ok = r.ok(el);
      setError(el, ok ? null : r.key);
      if (!ok && !first) first = el;
    });
    return first;
  };

  // 欄位一變正確就清掉錯誤訊息
  rules.forEach((r) => {
    const el = field(r.name);
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (el.getAttribute('aria-invalid') === 'true' && r.ok(el)) setError(el, null);
    });
  });

  const say = (key, kind) => {
    statusEl.textContent = msg(key);
    statusEl.className = `form-status${kind ? ` is-${kind}` : ''}`;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const first = validate();
    if (first) {
      say('form.err.summary', 'error');
      first.focus();
      return;
    }
    // honeypot 有值：幾乎一定是機器人，假裝成功
    if (field('_gotcha')?.value) {
      form.reset();
      say('form.ok', 'ok');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = msg('form.sending');
    fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        form.reset();
        say('form.ok', 'ok');
      })
      .catch(() => say('form.fail', 'error'))
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      });
  });

  // 測試用：只驗證不送出
  window.DeepEchoForm = { validate };
}
