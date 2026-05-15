const { Scenes } = require('telegraf');
const catalog = require('../catalog/catalog');
const { t } = require('../utils/format');
const { searchResultsKb } = require('../keyboards/inline');
const { mainMenu } = require('../keyboards/main');

const searchScene = new Scenes.BaseScene('search');

searchScene.enter(async (ctx) => {
  await ctx.reply(t('search_prompt'), { reply_markup: { remove_keyboard: true } });
});

searchScene.on('text', async (ctx) => {
  const q = ctx.message.text.trim();
  if (q.startsWith('/')) {
    await ctx.scene.leave();
    await ctx.reply(t('start_welcome'), { parse_mode: 'Markdown', ...mainMenu() });
    return;
  }
  const results = catalog.search(q, 10);
  if (results.length === 0) {
    await ctx.reply(t('search_no_results'));
    return;
  }
  await ctx.reply(t('search_results', { count: results.length }), searchResultsKb(results));
  await ctx.scene.leave();
  await ctx.reply(t('main_menu'), mainMenu());
});

module.exports = { searchScene };
