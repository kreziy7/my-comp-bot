const uz = require('../i18n/uz.json');
const ru = require('../i18n/ru.json');
const dicts = { uz, ru };
const SUPPORTED = ['uz', 'ru'];
const DEFAULT_LANG = 'uz';

function t(lang, key, vars) {
  // Back-compat: legacy `t(key, vars)` calls default to UZ.
  if (typeof lang === 'string' && !SUPPORTED.includes(lang)) {
    vars = key;
    key = lang;
    lang = DEFAULT_LANG;
  }
  vars = vars || {};
  const dict = dicts[lang] || dicts[DEFAULT_LANG];
  let s = dict[key];
  if (s == null) s = dicts[DEFAULT_LANG][key];
  if (s == null) return key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

// Returns the localized string in every supported language — used by
// bot.hears() so a listener fires on the button label in any language.
function tAll(key, vars) {
  return SUPPORTED.map(l => t(l, key, vars));
}

function escapeMd(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\*/g, '∗')
    .replace(/_/g, ' ')
    .replace(/`/g, "'")
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}

function formatPrice(usd) {
  if (usd == null) return t('product_price_on_request');
  if (usd >= 1000) return `$${usd.toLocaleString('en-US')}`;
  return `$${usd}`;
}

function productCard(p) {
  const code = p.modelCode ? ` \`(${escapeMd(p.modelCode)})\`` : '';
  const lines = [];
  lines.push(`*${escapeMd(p.description)}*${code}`);
  lines.push('');
  if (p.section) lines.push(`📂 _${escapeMd(p.section)}_`);
  if (p.brand && p.brand !== p.section) lines.push(`🏷 _${escapeMd(p.brand)}_`);
  lines.push('');
  if (p.priceUsd != null) {
    lines.push(`💵 *${formatPrice(p.priceUsd)}*`);
    if (p.priceUzs) lines.push(`   ≈ ${p.priceUzs.toLocaleString('ru-RU')} soʻm`);
    else lines.push(`   _(soʻm hisobida CBU kursida)_`);
  } else {
    lines.push(`💵 _${escapeMd(t('product_price_on_request'))}_`);
  }
  return lines.join('\n');
}

function productListItem(p, idx) {
  const price = p.priceUsd != null ? `$${p.priceUsd}` : '—';
  const desc = p.description.length > 50 ? p.description.slice(0, 47) + '...' : p.description;
  return `${idx}. ${desc} — ${price}`;
}

function cartLine(p, qty, idx) {
  const sub = p.priceUsd != null ? p.priceUsd * qty : null;
  const desc = p.description.length > 40 ? p.description.slice(0, 37) + '...' : p.description;
  const sum = sub != null ? ` — $${sub.toFixed(2).replace(/\.00$/, '')}` : '';
  return `${idx}. ${desc} × ${qty}${sum}`;
}

function cartTotal(cart, catalog) {
  let total = 0;
  for (const [pid, qty] of cart.entries()) {
    const p = catalog.getProduct(pid);
    if (p && p.priceUsd != null) total += p.priceUsd * qty;
  }
  return total;
}

function renderCart(cart, catalog) {
  if (!cart || cart.size === 0) return { text: t('cart_empty'), total: 0 };
  const lines = [t('cart_title'), ''];
  let i = 0;
  for (const [pid, qty] of cart.entries()) {
    i++;
    const p = catalog.getProduct(pid);
    if (!p) continue;
    lines.push(cartLine(p, qty, i));
  }
  const total = cartTotal(cart, catalog);
  lines.push('');
  lines.push(t('cart_total', { total: total.toFixed(2).replace(/\.00$/, '') }));
  return { text: lines.join('\n'), total };
}

module.exports = { t, tAll, SUPPORTED, DEFAULT_LANG, escapeMd, formatPrice, productCard, productListItem, cartLine, cartTotal, renderCart };
