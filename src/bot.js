const { Telegraf, Scenes, session } = require('telegraf');
const cfg = require('./config');
const catalog = require('./catalog/catalog');
const cart = require('./cart');
const { t, productCard, renderCart, escapeMd } = require('./utils/format');
const { mainMenu } = require('./keyboards/main');
const {
  topGroupsKb, sectionsKb, productListKb, productCardKb, cartKb,
} = require('./keyboards/inline');
const { searchScene } = require('./scenes/search');
const { orderScene, renderOrderForAdmin, formatMoney } = require('./scenes/order');
const orders = require('./orders');

function isAdmin(ctx) {
  return cfg.adminChatId && String(ctx.from.id) === String(cfg.adminChatId);
}

const bot = new Telegraf(cfg.botToken);

const stage = new Scenes.Stage([searchScene, orderScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start(async (ctx) => {
  await ctx.reply(t('start_welcome'), { parse_mode: 'Markdown', ...mainMenu() });
});

bot.help(async (ctx) => ctx.reply(t('help')));
bot.command('about', async (ctx) => ctx.reply(t('about'), { parse_mode: 'Markdown' }));
bot.command('myid', async (ctx) => {
  await ctx.reply(`Sizning chat_id: \`${ctx.chat.id}\`\nUser id: \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
});

bot.hears(t('menu_browse'), async (ctx) => {
  const groups = catalog.getTopGroups();
  await ctx.reply(t('browse_pick_group'), { parse_mode: 'Markdown', ...topGroupsKb(groups) });
});

bot.hears(t('menu_search'), async (ctx) => ctx.scene.enter('search'));

bot.hears(t('menu_cart'), async (ctx) => {
  const items = cart.getCart(ctx.from.id);
  await sendCart(ctx, items);
});

bot.hears(t('menu_contact'), async (ctx) => {
  await ctx.reply(t('contact_info'), { parse_mode: 'Markdown' });
});

async function sendCart(ctx, items) {
  if (!items || items.size === 0) {
    await ctx.reply(t('cart_empty'));
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
  await ctx.reply(text, { parse_mode: 'Markdown', ...cartKb(kbItems) });
}

bot.action('noop', async (ctx) => ctx.answerCbQuery());

bot.action('cat:_back', async (ctx) => {
  const groups = catalog.getTopGroups();
  await ctx.answerCbQuery();
  await ctx.editMessageText(t('browse_pick_group'), { parse_mode: 'Markdown', ...topGroupsKb(groups) });
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
  await ctx.editMessageText(t('browse_pick_section', { group: group.title }), {
    parse_mode: 'Markdown',
    ...sectionsKb(groupId, sections),
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
    await ctx.answerCbQuery(t('browse_section_empty'));
    return;
  }
  await ctx.answerCbQuery();
  const header = `📂 *${escapeMd(section.title)}*  _(${total} ta)_`;
  try {
    await ctx.editMessageText(header, {
      parse_mode: 'Markdown',
      ...productListKb(groupId, sectionId, products, safePage, pages),
    });
  } catch (e) {
    await ctx.reply(header, { parse_mode: 'Markdown', ...productListKb(groupId, sectionId, products, safePage, pages) });
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
  await ctx.reply(productCard(p), { parse_mode: 'Markdown', ...productCardKb(p) });
});

bot.action(/^add:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  const p = catalog.getProduct(id);
  if (!p) {
    await ctx.answerCbQuery('Topilmadi');
    return;
  }
  if (p.priceUsd == null) {
    await ctx.answerCbQuery(t('product_cant_add_no_price'), { show_alert: true });
    return;
  }
  cart.addToCart(ctx.from.id, p.id, 1);
  await ctx.answerCbQuery(`✅ ${p.description.slice(0, 40)} — savatga qoʻshildi`);
});

bot.action('contact:price', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(t('contact_info'), { parse_mode: 'Markdown' });
});

bot.action(/^cart:rm:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  cart.removeFromCart(ctx.from.id, id);
  await ctx.answerCbQuery(t('cart_item_removed'));
  const items = cart.getCart(ctx.from.id);
  if (!items || items.size === 0) {
    try {
      await ctx.editMessageText(t('cart_empty'));
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
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...cartKb(kbItems) });
  } catch (_) {}
});

bot.action('cart:clear', async (ctx) => {
  cart.clearCart(ctx.from.id);
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(t('cart_clear_confirm'));
  } catch (_) {
    await ctx.reply(t('cart_clear_confirm'));
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
  try { ctx.reply(t('error_generic')); } catch (_) {}
});

module.exports = bot;
