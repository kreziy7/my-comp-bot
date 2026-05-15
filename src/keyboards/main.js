const { Markup } = require('telegraf');
const { t } = require('../utils/format');

function mainMenu() {
  return Markup.keyboard([
    [t('menu_browse'), t('menu_search')],
    [t('menu_cart'), t('menu_contact')],
  ]).resize();
}

module.exports = { mainMenu };
