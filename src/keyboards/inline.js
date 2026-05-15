const { Markup } = require('telegraf');
const { t } = require('../utils/format');

function topGroupsKb(groups) {
  const rows = groups.map((g) => [Markup.button.callback(`${g.title}  (${g.count})`, `cat:${g.id}`)]);
  return Markup.inlineKeyboard(rows);
}

function sectionsKb(groupId, sections) {
  const rows = sections.map((s) => [
    Markup.button.callback(`${s.title}  (${s.count})`, `sec:${groupId}:${s.id}:0`),
  ]);
  rows.push([Markup.button.callback(t('browse_back_to_groups'), 'cat:_back')]);
  return Markup.inlineKeyboard(rows);
}

function productListKb(groupId, sectionId, products, page, pages) {
  const rows = products.map((p, i) => {
    const desc = p.description.length > 36 ? p.description.slice(0, 33) + '...' : p.description;
    const price = p.priceUsd != null ? `$${p.priceUsd}` : '—';
    return [Markup.button.callback(`${desc}  ${price}`, `prod:${p.id}`)];
  });
  const navRow = [];
  if (page > 0) navRow.push(Markup.button.callback('⬅', `sec:${groupId}:${sectionId}:${page - 1}`));
  navRow.push(Markup.button.callback(`${page + 1}/${pages}`, `noop`));
  if (page < pages - 1) navRow.push(Markup.button.callback('➡', `sec:${groupId}:${sectionId}:${page + 1}`));
  if (navRow.length) rows.push(navRow);
  rows.push([Markup.button.callback(t('browse_back_to_sections'), `cat:${groupId}`)]);
  return Markup.inlineKeyboard(rows);
}

function productCardKb(product, fromSec) {
  const rows = [];
  if (product.priceUsd != null) {
    rows.push([Markup.button.callback(t('product_add_to_cart'), `add:${product.id}`)]);
  } else {
    rows.push([Markup.button.callback(t('product_contact_for_price'), `contact:price`)]);
  }
  if (fromSec) {
    rows.push([Markup.button.callback(t('browse_back_to_list'), `sec:${fromSec.groupId}:${fromSec.sectionId}:${fromSec.page}`)]);
  }
  return Markup.inlineKeyboard(rows);
}

function searchResultsKb(products) {
  const rows = products.map((p) => {
    const desc = p.description.length > 36 ? p.description.slice(0, 33) + '...' : p.description;
    const price = p.priceUsd != null ? `$${p.priceUsd}` : '—';
    return [Markup.button.callback(`${desc}  ${price}`, `prod:${p.id}`)];
  });
  return Markup.inlineKeyboard(rows);
}

function cartKb(items) {
  const rows = items.map((it) => [Markup.button.callback(`❌ ${it.short}`, `cart:rm:${it.pid}`)]);
  if (items.length > 0) {
    rows.push([
      Markup.button.callback(t('cart_clear'), 'cart:clear'),
      Markup.button.callback(t('cart_checkout'), 'cart:checkout'),
    ]);
  }
  return Markup.inlineKeyboard(rows);
}

function orderConfirmKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('order_confirm_yes'), 'order:yes')],
    [Markup.button.callback(t('order_confirm_no'), 'order:no')],
  ]);
}

function adminOrderKb(orderId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Qabul qildim', `admin:accept:${orderId}`),
      Markup.button.callback('❌ Rad etish', `admin:reject:${orderId}`),
    ],
  ]);
}

module.exports = {
  topGroupsKb,
  sectionsKb,
  productListKb,
  productCardKb,
  searchResultsKb,
  cartKb,
  orderConfirmKb,
  adminOrderKb,
};
