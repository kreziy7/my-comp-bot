// Per-user language preference, cached in memory.
// On bot restart, users default back to UZ; they can re-pick via /lang.
const { SUPPORTED, DEFAULT_LANG } = require('./format');

const userLang = new Map(); // telegram_id -> 'uz' | 'ru'

function getLang(userId) {
  if (userId == null) return DEFAULT_LANG;
  return userLang.get(String(userId)) || DEFAULT_LANG;
}

function setLang(userId, lang) {
  if (userId == null || !SUPPORTED.includes(lang)) return false;
  userLang.set(String(userId), lang);
  return true;
}

function hasLang(userId) {
  return userId != null && userLang.has(String(userId));
}

module.exports = { getLang, setLang, hasLang };
