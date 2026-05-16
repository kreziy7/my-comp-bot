const { Telegraf, Scenes, session } = require('telegraf');
const cfg = require('./config');
const catalog = require('./catalog/catalog');
const cart = require('./cart');
const { t, tAll, productCard, renderCart, escapeMd } = require('./utils/format');
const { mainMenu, buyMenuKb, serviceMenuKb, langPickerKb } = require('./keyboards/main');
const { getLang, setLang, hasLang } = require('./utils/lang');
const {
  topGroupsKb, sectionsKb, productListKb, productCardKb, cartKb,
} = require('./keyboards/inline');
const { searchScene } = require('./scenes/search');
const { orderScene, renderOrderForAdmin, formatMoney } = require('./scenes/order');
const { serviceScene } = require('./scenes/service');
const orders = require('./orders');

function isAdmin(ctx) {
  return cfg.adminChatId && String(ctx.from.id) === String(cfg.adminChatId);
}

const bot = new Telegraf(cfg.botToken);

const stage = new Scenes.Stage([searchScene, orderScene, serviceScene]);
bot.use(session());

// Attach per-user locale helpers — must run BEFORE stage so scene handlers see ctx.t.
bot.use(async (ctx, next) => {
  if (ctx.from) {
    ctx.lang = getLang(ctx.from.id);
    ctx.t = (key, vars) => t(ctx.lang, key, vars);
  } else {
    ctx.lang = 'uz';
    ctx.t = (key, vars) => t('uz', key, vars);
  }
  return next();
});

bot.use(stage.middleware());

bot.start(async (ctx) => {
  if (!hasLang(ctx.from.id)) {
    await ctx.reply(t('uz', 'lang_pick'), langPickerKb());
    return;
  }
  await ctx.reply(ctx.t('start_welcome'), { parse_mode: 'Markdown', ...mainMenu(ctx.lang) });
});

bot.command('lang', async (ctx) => {
  await ctx.reply(t('uz', 'lang_pick'), langPickerKb());
});

bot.action(/^lang:set:(uz|ru)$/, async (ctx) => {
  const newLang = ctx.match[1];
  setLang(ctx.from.id, newLang);
  ctx.lang = newLang;
  ctx.t = (key, vars) => t(newLang, key, vars);
  await ctx.answerCbQuery();
  try { await ctx.editMessageReplyMarkup(undefined); } catch (_) {}
  await ctx.reply(ctx.t('lang_changed'));
  await ctx.reply(ctx.t('start_welcome'), { parse_mode: 'Markdown', ...mainMenu(newLang) });
});

bot.help(async (ctx) => ctx.reply(ctx.t('help')));
bot.command('about', async (ctx) => ctx.reply(ctx.t('about'), { parse_mode: 'Markdown' }));
bot.command('myid', async (ctx) => {
  await ctx.reply(`chat_id: \`${ctx.chat.id}\`\nuser_id: \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
});

// Top-level reply-keyboard buttons — match in any supported language.
bot.hears(tAll('menu_buy'), async (ctx) => {
  await ctx.reply(ctx.t('buy_intro'), { parse_mode: 'Markdown', ...buyMenuKb(ctx.lang) });
});

bot.hears(tAll('menu_service'), async (ctx) => {
  await ctx.reply(ctx.t('service_intro'), { parse_mode: 'Markdown', ...serviceMenuKb(ctx.lang) });
});

bot.hears(tAll('menu_contact'), async (ctx) => {
  await ctx.reply(ctx.ctx.t('contact_info'), { parse_mode: 'Markdown' });
});

// Buy sub-menu actions
bot.action('buy:catalog', async (ctx) => {
  const groups = catalog.getTopGroups();
  await ctx.answerCbQuery();
  await ctx.reply(ctx.t('browse_pick_group'), { parse_mode: 'Markdown', ...topGroupsKb(groups) });
});

bot.action('buy:search', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('search');
});

bot.action('buy:cart', async (ctx) => {
  await ctx.answerCbQuery();
  const items = cart.getCart(ctx.from.id);
  await sendCart(ctx, items);
});

// Service scene entry points
bot.action('service:start:individual', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('service', { kind: 'individual' });
});

bot.action('service:start:legal', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('service', { kind: 'legal' });
});

async function sendCart(ctx, items) {
  if (!items || items.size === 0) {
    await ctx.reply(ctx.t('cart_empty'));
    return;
  }
  const { text } = renderCart(items, catalog);
  const kbItems = [];
  for (const [pid] of items.entries()) {
    const p = catalog.getProduct(pid);
    if (!p) continue;
    const short = (p.description.length > 25 ? p.description.slice(0, 22) + '...' : p.description);
    kbItems.push({ pid, short });
  }
  await ctx.reply(text, { parse_mode: 'Markdown', ...cartKb(kbItems, ctx.lang) });
}

bot.action('noop', async (ctx) => ctx.answerCbQuery());

bot.action('cat:_back', async (ctx) => {
  const groups = catalog.getTopGroups();
  await ctx.answerCbQuery();
  await ctx.editMessageText(ctx.t('browse_pick_group'), { parse_mode: 'Markdown', ...topGroupsKb(groups) });
});

bot.action(/^cat:(.+)$/, async (ctx) => {
  const groupId = ctx.match[1];
  if (groupId === '_back') return;
  const group = catalog.getGroup(groupId);
  if (!group) {
    await ctx.answerCbQuery('Topilmadi');
    return;
  }
  const sections = catalog.getSections(groupId);
  await ctx.answerCbQuery();
  await ctx.editMessageText(ctx.t('browse_pick_section', { group: group.title }), {
    parse_mode: 'Markdown',
    ...sectionsKb(groupId, sections, ctx.lang),
  });
});

bot.action(/^sec:([^:]+):([^:]+):(\d+)$/, async (ctx) => {
  const [, groupId, sectionId, pageStr] = ctx.match;
  const page = parseInt(pageStr, 10);
  const section = catalog.getSection(sectionId);
  if (!section) {
    await ctx.answerCbQuery('Topilmadi');
    return;
  }
  const { products, total, pages, page: safePage } = catalog.getProductsInSection(sectionId, page);
  if (total === 0) {
    await ctx.answerCbQuery(ctx.t('browse_section_empty'));
    return;
  }
  await ctx.answerCbQuery();
  const header = `📂 *${escapeMd(section.title)}*  _(${total} ta)_`;
  try {
    await ctx.editMessageText(header, {
      parse_mode: 'Markdown',
      ...productListKb(groupId, sectionId, products, safePage, pages, ctx.lang),
    });
  } catch (e) {
    await ctx.reply(header, { parse_mode: 'Markdown', ...productListKb(groupId, sectionId, products, safePage, pages, ctx.lang) });
  }
});

bot.action(/^prod:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  const p = catalog.getProduct(id);
  if (!p) {
    await ctx.answerCbQuery('Topilmadi');
    return;
  }
  await ctx.answerCbQuery();
  await ctx.reply(productCard(p), { parse_mode: 'Markdown', ...productCardKb(p, null, ctx.lang) });
});

bot.action(/^add:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  const p = catalog.getProduct(id);
  if (!p) {
    await ctx.answerCbQuery('Topilmadi');
    return;
  }
  if (p.priceUsd == null) {
    await ctx.answerCbQuery(ctx.t('product_cant_add_no_price'), { show_alert: true });
    return;
  }
  cart.addToCart(ctx.from.id, p.id, 1);
  await ctx.answerCbQuery(`✅ ${p.description.slice(0, 40)} — savatga qoʻshildi`);
});

bot.action('contact:price', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.t('contact_info'), { parse_mode: 'Markdown' });
});

bot.action(/^cart:rm:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  cart.removeFromCart(ctx.from.id, id);
  await ctx.answerCbQuery(ctx.t('cart_item_removed'));
  const items = cart.getCart(ctx.from.id);
  if (!items || items.size === 0) {
    try {
      await ctx.editMessageText(ctx.t('cart_empty'));
    } catch (_) {}
    return;
  }
  const { text } = renderCart(items, catalog);
  const kbItems = [];
  for (const [pid] of items.entries()) {
    const p = catalog.getProduct(pid);
    if (!p) continue;
    const short = p.description.length > 25 ? p.description.slice(0, 22) + '...' : p.description;
    kbItems.push({ pid, short });
  }
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...cartKb(kbItems, ctx.lang) });
  } catch (_) {}
});

bot.action('cart:clear', async (ctx) => {
  cart.clearCart(ctx.from.id);
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(ctx.t('cart_clear_confirm'));
  } catch (_) {
    await ctx.reply(ctx.t('cart_clear_confirm'));
  }
});

bot.action('cart:checkout', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('order');
});

bot.action(/^admin:(accept|reject):(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Sizda ruxsat yoʻq', { show_alert: true });
    return;
  }
  const action = ctx.match[1];
  const id = parseInt(ctx.match[2], 10);
  const status = action === 'accept' ? 'accepted' : 'rejected';
  const updated = orders.updateStatus(id, status, ctx.from.id);
  if (!updated) {
    await ctx.answerCbQuery('Zakaz topilmadi', { show_alert: true });
    return;
  }
  await ctx.answerCbQuery(status === 'accepted' ? '✅ Qabul qilindi' : '❌ Rad etildi');
  const badge = status === 'accepted' ? '✅ *Qabul qilindi*' : '❌ *Rad etildi*';
  try {
    await ctx.editMessageText(`${renderOrderForAdmin(updated)}\n\n${badge}`, { parse_mode: 'Markdown' });
  } catch (_) {}
  try {
    const note = status === 'accepted'
      ? `✅ Zakazingiz #${updated.id} qabul qilindi. Operator tez orada bog'lanadi.`
      : `❌ Afsuski, zakazingiz #${updated.id} rad etildi. Batafsil — operator bilan bog'laning.`;
    await ctx.telegram.sendMessage(updated.userId, note);
  } catch (e) {
    console.warn('[admin] could not notify customer:', e.message);
  }
});

function buildOrdersList(list, header) {
  if (!list.length) return `${header}\n\n_(zakazlar yoʻq)_`;
  const lines = [header, ''];
  for (const o of list) {
    const icon = o.status === 'accepted' ? '✅' : o.status === 'rejected' ? '❌' : '⏳';
    const when = (o.createdAt || '').replace('T', ' ').slice(5, 16);
    const name = escapeMd((o.name || '').slice(0, 20));
    lines.push(`${icon} #${o.id}  ${when}  ${name}  ${formatMoney(o.total)}`);
  }
  return lines.join('\n');
}

bot.command('orders', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const recent = orders.getRecent(10);
  await ctx.reply(buildOrdersList(recent, '📋 *Soʻnggi 10 ta zakaz:*'), { parse_mode: 'Markdown' });
});

bot.command('today', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const today = orders.getSince(orders.startOfDay());
  await ctx.reply(buildOrdersList(today, `📅 *Bugungi zakazlar (${today.length} ta):*`), { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const s = orders.stats();
  const fmt = (x) => `${x.count} ta · ${formatMoney(x.total)} · ✅${x.accepted}  ❌${x.rejected}  ⏳${x.pending}`;
  const text = [
    '📊 *Statistika*',
    '',
    `📅 *Bugun:* ${fmt(s.today)}`,
    `📆 *7 kun:* ${fmt(s.week)}`,
    `🗓 *30 kun:* ${fmt(s.month)}`,
    `📚 *Hammasi:* ${fmt(s.all)}`,
  ].join('\n');
  await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('order', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const parts = ctx.message.text.split(/\s+/);
  const id = parseInt(parts[1], 10);
  if (!id) { await ctx.reply('Foydalanish: /order <id>'); return; }
  const o = orders.findById(id);
  if (!o) { await ctx.reply(`Zakaz #${id} topilmadi`); return; }
  const badge = o.status === 'accepted' ? '\n\n✅ *Qabul qilindi*'
    : o.status === 'rejected' ? '\n\n❌ *Rad etildi*' : '';
  await ctx.reply(renderOrderForAdmin(o) + badge, { parse_mode: 'Markdown' });
});

bot.catch((err, ctx) => {
  console.error(`[bot] Error for update ${ctx.update.update_id}:`, err);
  try { ctx.reply(t(getLang(ctx.from?.id), 'error_generic')); } catch (_) {}
});

module.exports = bot;
