const { Markup } = require('telegraf');
const { t } = require('../utils/format');

function mainMenu(lang) {
  return Markup.keyboard([
    [t(lang, 'menu_buy')],
    [t(lang, 'menu_service'), t(lang, 'menu_contact')],
  ]).resize();
}

// Inline keyboards for top-level flows
function buyMenuKb(lang) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'buy_btn_catalog'), 'buy:catalog')],
    [Markup.button.callback(t(lang, 'buy_btn_search'), 'buy:search')],
    [Markup.button.callback(t(lang, 'buy_btn_cart'), 'buy:cart')],
    [Markup.button.url(
      t(lang, 'buy_btn_map'),
      'https://maps.google.com/?q=Farogat+street+Toshkent'
    )],
  ]);
}

function serviceMenuKb(lang) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'service_btn_individual'), 'service:start:individual')],
    [Markup.button.callback(t(lang, 'service_btn_legal'), 'service:start:legal')],
  ]);
}

function langPickerKb() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t('uz', 'lang_btn_uz'), 'lang:set:uz'),
      Markup.button.callback(t('ru', 'lang_btn_ru'), 'lang:set:ru'),
    ],
  ]);
}

module.exports = { mainMenu, buyMenuKb, serviceMenuKb, langPickerKb };
