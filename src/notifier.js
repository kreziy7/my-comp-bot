// Supabase Realtime tinglovchi — admin paneldan status o'zgartirilganda
// botning telegramidan klientga avtomatik xabar yuboradi.

const db = require('./db');
const { t } = require('./utils/format');

function statusLabel(kind, status) {
  const key = `status_${kind}_${status}`;
  const tr = t(key);
  return tr === key ? status : tr;
}

function startStatusNotifier(telegram) {
  if (!db.isEnabled()) {
    console.log('[notifier] Supabase yo\'q — Realtime o\'chirilgan');
    return null;
  }
  console.log('[notifier] Supabase Realtime tinglanmoqda...');

  return db.subscribeStatusChanges(async ({ kind, row }) => {
    try {
      const cust = await db.getCustomerById(row.customer_id);
      if (!cust?.telegram_id) return;
      const num = kind === 'order' ? row.order_number : row.request_number;
      const key = kind === 'order' ? 'notify_order_status' : 'notify_service_status';
      const text = t(key, {
        number: num,
        status: statusLabel(kind, row.status),
      });
      await telegram.sendMessage(cust.telegram_id, text, { parse_mode: 'Markdown' });
      console.log(`[notifier] -> tg:${cust.telegram_id} ${kind}#${num} → ${row.status}`);
    } catch (e) {
      console.warn('[notifier] send failed:', e.message);
    }
  });
}

module.exports = { startStatusNotifier };
