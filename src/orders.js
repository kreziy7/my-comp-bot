const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'orders.jsonl');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '');
}

function loadAll() {
  ensureFile();
  const raw = fs.readFileSync(FILE, 'utf8');
  const out = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch (_) {}
  }
  return out;
}

function nextId() {
  const all = loadAll();
  let max = 1000;
  for (const o of all) if (o.id > max) max = o.id;
  return max + 1;
}

function appendOrder(order) {
  ensureFile();
  fs.appendFileSync(FILE, JSON.stringify(order) + '\n');
}

function updateStatus(id, status, by) {
  const all = loadAll();
  const idx = all.findIndex((o) => o.id === id);
  if (idx < 0) return null;
  all[idx].status = status;
  all[idx].statusBy = by || null;
  all[idx].statusAt = new Date().toISOString();
  fs.writeFileSync(FILE, all.map((o) => JSON.stringify(o)).join('\n') + '\n');
  return all[idx];
}

function findById(id) {
  return loadAll().find((o) => o.id === id) || null;
}

function getRecent(limit = 10) {
  const all = loadAll();
  return all.slice(-limit).reverse();
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getSince(date) {
  const ts = +new Date(date);
  return loadAll().filter((o) => +new Date(o.createdAt) >= ts);
}

function summarize(orders) {
  const total = orders.reduce((s, o) => s + (o.total || 0), 0);
  const accepted = orders.filter((o) => o.status === 'accepted').length;
  const rejected = orders.filter((o) => o.status === 'rejected').length;
  const pending = orders.filter((o) => !o.status || o.status === 'pending').length;
  return { count: orders.length, total, accepted, rejected, pending };
}

function stats() {
  const today = startOfDay();
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
  const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 29);
  return {
    today: summarize(getSince(today)),
    week: summarize(getSince(weekAgo)),
    month: summarize(getSince(monthAgo)),
    all: summarize(loadAll()),
  };
}

module.exports = {
  nextId,
  appendOrder,
  updateStatus,
  findById,
  loadAll,
  getRecent,
  getSince,
  startOfDay,
  summarize,
  stats,
};
