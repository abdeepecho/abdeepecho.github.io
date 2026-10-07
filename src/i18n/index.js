// 多語系工具：字串表在同資料夾的 <語言>.json，新增語言時在 LOCALES 加一筆並放入對應的 json
import zhHant from './zh-Hant.json';
import en from './en.json';

// 預設語言放在網站根目錄（/），其他語言放在 /<prefix>/
export const DEFAULT_LOCALE = 'zh-Hant';

// name：語言選單中顯示的名稱（用該語言書寫）；short：地球圖示旁的縮寫
export const LOCALES = {
  'zh-Hant': { prefix: '', name: '繁體中文', short: '中文', dict: zhHant },
  en: { prefix: 'en', name: 'English', short: 'EN', dict: en },
};

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
