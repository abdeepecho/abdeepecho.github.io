// 多語系工具
// 新增語言：1) 在 locales.json 加一筆（code、網址前綴、選單名稱、縮寫）2) 放一個 <code>.json 字串檔
// 頁面（src/pages/[...route].astro）、語言選單、hreflang、sitemap 都會自動跟著產生；缺的字串會退回預設語言
import localeList from './locales.json';

const dicts = import.meta.glob(['./*.json', '!./locales.json'], { eager: true, import: 'default' });

// 第一筆是預設語言，放在網站根目錄（/）；其他語言放在 /<prefix>/
export const DEFAULT_LOCALE = localeList[0].code;

// name：語言選單中顯示的名稱（用該語言書寫）；short：地球圖示旁的縮寫
export const LOCALES = Object.fromEntries(localeList.map((l) => {
  const dict = dicts[`./${l.code}.json`];
  if (!dict) throw new Error(`[i18n] 找不到字串檔 src/i18n/${l.code}.json`);
  return [l.code, { prefix: l.prefix, name: l.name, short: l.short, dict }];
}));

export const LOCALE_CODES = Object.keys(LOCALES);

// 取字串；找不到時退回預設語言，再找不到就回傳 key 方便發現遺漏
export function t(lang, key, vars) {
  const dict = (LOCALES[lang] || LOCALES[DEFAULT_LOCALE]).dict;
  let s = dict[key] ?? LOCALES[DEFAULT_LOCALE].dict[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

// 由「不含語言前綴的路徑」組出某語言的路徑，例如 ('en', '/games/x/') -> '/en/games/x/'
export function localePath(lang, path = '/') {
  const prefix = LOCALES[lang]?.prefix;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return prefix ? `/${prefix}${clean}` : clean;
}

// 遊戲資料等內容欄位可寫成 { "zh-Hant": "...", "en": "..." }，這裡取出對應語言
export function pick(value, lang) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value[lang] ?? value[DEFAULT_LOCALE];
  }
  return value;
}
