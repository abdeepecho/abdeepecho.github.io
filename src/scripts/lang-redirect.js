/* 早期語言轉址：以 is:inline 放在 <head>，在畫面繪製前執行（不可使用 import）
 *
 * 每頁都用 <link rel="alternate" hreflang="..."> 列出各語言版本，本程式只在這些版本之間轉址，
 * 新增語言（例如 /ja/）不需要修改這裡。
 *
 * 規則
 *   1. ?lang=xx      記住 xx 並前往該語言版本（去掉 ?lang）
 *   2. 已存的選擇    只在預設語言（中文）頁面上，轉到所選語言的版本
 *   3. 第一次造訪預設語言頁：依瀏覽器的語言偏好，轉到網站有的第一個語言版本；
 *      都沒有就轉英文版。只做一次、使用者明確選過語言後不再執行、搜尋引擎爬蟲不轉址。
 *   預設語言由 hreflang="x-default" 判斷，新增語言不需要修改這裡。
 */
(function () {
  'use strict';

  var STORE = 'deepecho-lang';        /* 明確的選擇（選單或 ?lang=） */
  var AUTO = 'deepecho-lang-auto';    /* 第一次造訪的自動轉址已決定過 */
  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* 被封鎖 */ } }

  var alts = {};
  var links = document.querySelectorAll('link[rel="alternate"][hreflang]');
  for (var i = 0; i < links.length; i++) {
    var code = links[i].getAttribute('hreflang');
    if (code !== 'x-default') alts[code] = links[i].getAttribute('href');
  }
  /* 預設語言：網址與 x-default 相同的那個版本 */
  var DEFAULT = null;
  var xd = document.querySelector('link[rel="alternate"][hreflang="x-default"]');
  if (xd) for (var c in alts) if (alts[c] === xd.getAttribute('href')) DEFAULT = c;
  var page = document.documentElement.getAttribute('lang') || DEFAULT;

  /* "en-US" / "zh-TW" / "zh" -> 這頁有的語言版本 */
  function match(c) {
    if (!c) return null;
    c = String(c).toLowerCase();
    var k;
    for (k in alts) if (k.toLowerCase() === c) return k;
    var base = c.split('-')[0];
    for (k in alts) if (k.toLowerCase().split('-')[0] === base) return k;
    return null;
  }

  function go(lang) {
    if (!alts[lang] || lang === page) return false;
    /* 只用路徑，所以本機預覽也能運作 */
    var path;
    try { path = new URL(alts[lang], window.location.href).pathname; } catch (e) { return false; }
    window.location.replace(window.location.origin + path + window.location.hash);
    return true;
  }

  var fromUrl = null;
  try { fromUrl = match(new URLSearchParams(window.location.search).get('lang')); } catch (e) { /* 舊瀏覽器 */ }
  if (fromUrl) {
    set(STORE, fromUrl);
    if (!go(fromUrl) && window.history.replaceState) {
      /* 已在正確版本：整理網址 */
      try {
        var u = new URL(window.location.href);
        u.searchParams.delete('lang');
        window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
      } catch (e) { /* 略過 */ }
    }
    return;
  }

  if (/bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent || '')) return;

  /* 已存的選擇只會從預設語言頁轉走，所以分享出去的 /en/ 連結一定開成英文 */
  var saved = match(get(STORE));
  if (saved) { if (page === DEFAULT) go(saved); return; }

  if (page !== DEFAULT || get(AUTO)) return;
  set(AUTO, '1');
  var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
  for (var j = 0; j < prefs.length; j++) {
    var m = match(prefs[j]);
    if (m) { go(m); return; }   /* 偏好的是預設語言時 go() 不會動作 */
  }
  go(match('en'));
})();
