const { Markup } = require('telegraf');
const { t } = require('../utils/format');

function mainMenu() {
  return Markup.keyboard([
    [t('menu_buy')],
    [t('menu_service'), t('menu_contact')],
  ]).resize();
}

// Inline keyboards for top-level flows
function buyMenuKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('buy_btn_catalog'), 'buy:catalog')],
    [Markup.button.callback(t('buy_btn_search'), 'buy:search')],
    [Markup.button.callback(t('buy_btn_cart'), 'buy:cart')],
    [Markup.button.url(
      t('buy_btn_map'),
      'https://maps.google.com/?q=Farogat+street+Toshkent'
    )],
  ]);
}

function serviceMenuKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('service_btn_individual'), 'service:start:individual')],
    [Markup.button.callback(t('service_btn_legal'), 'service:start:legal')],
  ]);
}

module.exports = { mainMenu, buyMenuKb, serviceMenuKb };
