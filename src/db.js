// Supabase client + helpers.
// Bot ishlatadigan yagona DB qatlami — admin panel ham xuddi shu DB ga yozadi.

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

let _db = null;

function db() {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY .env da yo\'q');
  }
  _db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });
  return _db;
}

function isEnabled() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ─── Customers ───────────────────────────────────────────────────────────────
// Telegram user ni topadi yoki yaratadi.
// extra: { full_name, phone, customer_type, legal_name, inn, director_name,
//          company_email, company_phone, company_address, founding_date, orginfo_id }
async function upsertCustomer(tgUser, extra) {
  const row = {
    telegram_id: tgUser.id,
    telegram_username: tgUser.username || null,
    full_name: extra.full_name,
    phone: extra.phone,
    customer_type: extra.customer_type || 'individual',
    legal_name: extra.legal_name ?? null,
    company_name: extra.company_name ?? null,
    inn: extra.inn ?? null,
    director_name: extra.director_name ?? null,
    company_email: extra.company_email ?? null,
    company_phone: extra.company_phone ?? null,
    company_address: extra.company_address ?? null,
    founding_date: extra.founding_date ?? null,
    orginfo_id: extra.orginfo_id ?? null,
  };

  const { data, error } = await db()
    .from('customers')
    .upsert(row, { onConflict: 'telegram_id' })
    .select('id')
    .single();

  if (error) throw new Error('upsertCustomer: ' + error.message);
  return data.id;
}

// ─── Orders ──────────────────────────────────────────────────────────────────
async function createOrder({
  customerId,
  items,
  totalUsd,
  comment = null,
  locationLat = null,
  locationLng = null,
}) {
  const { data, error } = await db()
    .from('orders')
    .insert({
      customer_id: customerId,
      items,
      total_usd: totalUsd,
      comment,
      location_lat: locationLat,
      location_lng: locationLng,
    })
    .select('id, order_number')
    .single();
  if (error) throw new Error('createOrder: ' + error.message);
  return data;
}

// ─── Service requests ────────────────────────────────────────────────────────
async function createServiceRequest({
  customerId,
  deviceType,
  deviceModel,
  problemDescription,
}) {
  const { data, error } = await db()
    .from('service_requests')
    .insert({
      customer_id: customerId,
      device_type: deviceType,
      device_model: deviceModel,
      problem_description: problemDescription,
    })
    .select('id, request_number')
    .single();
  if (error) throw new Error('createServiceRequest: ' + error.message);
  return data;
}

// ─── Realtime: status o'zgarganda bot klientga xabar yuboradi ───────────────
// callback({ kind, row }) — kind: 'order' | 'service'
function subscribeStatusChanges(callback) {
  const channel = db()
    .channel('admin-status-updates')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        if (payload.old?.status !== payload.new?.status) {
          callback({ kind: 'order', row: payload.new });
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'service_requests' },
      (payload) => {
        if (payload.old?.status !== payload.new?.status) {
          callback({ kind: 'service', row: payload.new });
        }
      }
    )
    .subscribe();
  return channel;
}

async function getCustomerById(id) {
  const { data, error } = await db()
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

module.exports = {
  isEnabled,
  upsertCustomer,
  createOrder,
  createServiceRequest,
  getCustomerById,
  subscribeStatusChanges,
};
