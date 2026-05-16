const { Scenes, Markup } = require('telegraf');
const { t, escapeMd, renderCart } = require('../utils/format');
const { orderConfirmKb, adminOrderKb } = require('../keyboards/inline');
const { mainMenu } = require('../keyboards/main');
const cart = require('../cart');
const catalog = require('../catalog/catalog');
const cfg = require('../config');
const orders = require('../orders');
const db = require('../db');

const PHONE_RE = /^\+?\d[\d\s\-()]{8,18}\d$/;

const orderScene = new Scenes.WizardScene(
  'order',
  async (ctx) => {
    const items = cart.getCart(ctx.from.id);
    if (!items || items.size === 0) {
      await ctx.reply(t('cart_empty'), mainMenu());
      return ctx.scene.leave();
    }
    await ctx.reply(t('order_ask_name'), { reply_markup: { remove_keyboard: true } });
    ctx.wizard.state.data = {};
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply(t('order_ask_name'));
      return;
    }
    ctx.wizard.state.data.name = ctx.message.text.trim().slice(0, 100);
    await ctx.reply(t('order_ask_phone'),
      Markup.keyboard([[Markup.button.contactRequest(t('order_send_contact'))]]).oneTime().resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    let phone = null;
    if (ctx.message && ctx.message.contact && ctx.message.contact.phone_number) {
      phone = ctx.message.contact.phone_number;
    } else if (ctx.message && ctx.message.text) {
      const txt = ctx.message.text.trim();
      if (PHONE_RE.test(txt)) phone = txt;
    }
    if (!phone) {
      await ctx.reply(t('order_invalid_phone'));
      return;
    }
    ctx.wizard.state.data.phone = phone;
    await ctx.reply(t('order_ask_note'),
      Markup.keyboard([
        [Markup.button.locationRequest(t('order_send_location'))],
        [t('order_skip_note')],
      ]).oneTime().resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    let note = '';
    let location = null;
    if (ctx.message && ctx.message.location) {
      const { latitude, longitude } = ctx.message.location;
      location = { lat: latitude, lng: longitude };
      note = `📍 Geolokatsiya: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } else if (ctx.message && ctx.message.text) {
      const txt = ctx.message.text.trim();
      if (txt === '-' || txt === t('order_skip_note')) {
        note = '';
      } else {
        note = txt.slice(0, 500);
      }
    } else {
      await ctx.reply(t('order_ask_note'));
      return;
    }
    ctx.wizard.state.data.note = note;
    ctx.wizard.state.data.location = location;

    const { text, total } = renderCart(cart.getCart(ctx.from.id), catalog);
    ctx.wizard.state.data.total = total;
    const summary = t('order_confirm', {
      name: ctx.wizard.state.data.name,
      phone: ctx.wizard.state.data.phone,
      note: note || '—',
      cart: text,
    });
    await ctx.reply(summary, {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true },
    });
    await ctx.reply('Tasdiqlaysizmi?', orderConfirmKb());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message && ctx.message.text) {
      await ctx.reply('Iltimos, tugmalardan birini bosing.', orderConfirmKb());
    }
  },
);

orderScene.action('order:yes', async (ctx) => {
  await ctx.answerCbQuery('Yuborilmoqda...');
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (_) {}
  try {
    await submitOrder(ctx);
  } catch (e) {
    console.error('[order] submit error:', e);
    await ctx.reply(t('order_error'), mainMenu());
  }
  return ctx.scene.leave();
});

orderScene.action('order:no', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (_) {}
  await ctx.reply(t('order_cancelled'), mainMenu());
  return ctx.scene.leave();
});

function formatMoney(n) {
  return `$${(n || 0).toFixed(2).replace(/\.00$/, '')}`;
}

function renderOrderForAdmin(order) {
  const lines = [`🆕 *Yangi zakaz #${order.id}*`, ''];
  lines.push(`👤 *Mijoz:* ${escapeMd(order.name)}`);
  lines.push(`📱 *Telefon:* ${escapeMd(order.phone)}`);
  lines.push(`🕐 *Vaqt:* ${order.createdAt.replace('T', ' ').slice(0, 16)}`);
  lines.push(`🆔 *Telegram:* @${order.username || '—'} (id:${order.userId})`);
  lines.push('');
  lines.push('🛒 *Savat:*');
  order.items.forEach((it, idx) => {
    const subStr = it.subtotal != null ? ` — ${formatMoney(it.subtotal)}` : ' — (soʻrovga)';
    lines.push(`${idx + 1}. ${escapeMd(it.description)} ${it.modelCode ? `(${escapeMd(it.modelCode)})` : ''} × ${it.qty}${subStr}`);
  });
  lines.push('');
  lines.push(`💰 *Jami:* ${formatMoney(order.total)}`);
  if (order.note) {
    lines.push('');
    lines.push(`📝 *Izoh:* ${escapeMd(order.note)}`);
  }
  if (order.location) {
    const { lat, lng } = order.location;
    lines.push('');
    lines.push(`📍 [Xaritada koʻrish](https://maps.google.com/?q=${lat},${lng})`);
  }
  return lines.join('\n');
}

async function submitOrder(ctx) {
  const data = ctx.wizard.state.data || {};
  const items = cart.getCart(ctx.from.id);
  if (!items || items.size === 0) {
    await ctx.reply(t('cart_empty'), mainMenu());
    return;
  }
  const orderId = orders.nextId();
  let total = 0;
  const orderItems = [];
  for (const [pid, qty] of items.entries()) {
    const p = catalog.getProduct(pid);
    if (!p) continue;
    const sub = p.priceUsd != null ? p.priceUsd * qty : null;
    if (sub != null) total += sub;
    orderItems.push({
      pid,
      description: p.description,
      modelCode: p.modelCode,
      priceUsd: p.priceUsd,
      qty,
      subtotal: sub,
    });
  }
  const order = {
    id: orderId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    userId: ctx.from.id,
    username: ctx.from.username || null,
    name: data.name,
    phone: data.phone,
    note: data.note || '',
    location: data.location || null,
    items: orderItems,
    total,
  };
  orders.appendOrder(order);

  // Supabase ga ham yozish (admin panel uchun)
  if (db.isEnabled()) {
    try {
      const customerId = await db.upsertCustomer(ctx.from, {
        full_name: data.name,
        phone: data.phone,
        customer_type: 'individual',
      });
      const dbItems = orderItems.map((it) => ({
        productId: it.pid,
        name: it.description,
        code: it.modelCode,
        qty: it.qty,
        priceUsd: it.priceUsd,
        lineTotal: it.subtotal,
      }));
      const created = await db.createOrder({
        customerId,
        items: dbItems,
        totalUsd: total,
        comment: data.note || null,
        locationLat: data.location?.lat ?? null,
        locationLng: data.location?.lng ?? null,
      });
      order.dbNumber = created.order_number;
    } catch (e) {
      console.error('[order] supabase save failed:', e.message);
    }
  }

  const adminMsg = renderOrderForAdmin(order);
  if (cfg.adminChatId) {
    try {
      await ctx.telegram.sendMessage(cfg.adminChatId, adminMsg, {
        parse_mode: 'Markdown',
        ...adminOrderKb(orderId),
      });
    } catch (e) {
      console.error('[order] failed to send to admin:', e.message);
      console.log('[order] FALLBACK — order content:\n' + adminMsg);
    }
  } else {
    console.log('[order] ADMIN_CHAT_ID not set — order:\n' + adminMsg);
  }

  cart.clearCart(ctx.from.id);
  await ctx.reply(t('order_done', { id: order.dbNumber || orderId }), {
    parse_mode: 'Markdown',
    ...mainMenu(),
  });
}

module.exports = { orderScene, submitOrder, renderOrderForAdmin, formatMoney };
