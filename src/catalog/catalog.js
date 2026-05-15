const fs = require('fs');
const path = require('path');
const { parseWorkbook } = require('./parser');
const { TOP_GROUPS } = require('./taxonomy');
const cfg = require('../config');

let cache = null;

function buildCache() {
  console.log('[catalog] Parsing XLSX...');
  const t0 = Date.now();
  const { products, stats } = parseWorkbook(cfg.priceFile);
  const elapsed = Date.now() - t0;
  console.log(`[catalog] Parsed ${products.length} products in ${elapsed}ms`);

  const byId = new Map();
  for (const p of products) byId.set(p.id, p);

  const sectionsByGroup = new Map();
  for (const g of TOP_GROUPS) sectionsByGroup.set(g.id, new Map());

  for (const p of products) {
    const grpMap = sectionsByGroup.get(p.topGroup);
    if (!grpMap) continue;
    const secKey = `${p.sheet}:::${p.section}`;
    if (!grpMap.has(secKey)) {
      grpMap.set(secKey, {
        id: hashCode(secKey),
        title: p.section || p.sheet,
        sheet: p.sheet,
        section: p.section,
        productIds: [],
      });
    }
    grpMap.get(secKey).productIds.push(p.id);
  }

  const sectionsByGroupArr = {};
  const sectionById = new Map();
  for (const [gId, mp] of sectionsByGroup.entries()) {
    const arr = [...mp.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    sectionsByGroupArr[gId] = arr;
    for (const s of arr) sectionById.set(s.id, s);
  }

  cache = { products, byId, sectionsByGroupArr, sectionById, stats };

  try {
    fs.mkdirSync(path.join(__dirname, '..', '..', 'data'), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, '..', '..', 'data', 'catalog.json'),
      JSON.stringify({ products: products.length, stats }, null, 2),
    );
  } catch (e) {
    console.warn('[catalog] failed to write catalog.json:', e.message);
  }

  console.log('[catalog] Ready.');
  return cache;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 8);
}

function ensureCache() {
  if (!cache) buildCache();
  return cache;
}

function getTopGroups() {
  ensureCache();
  return TOP_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    count: (cache.sectionsByGroupArr[g.id] || []).reduce((s, x) => s + x.productIds.length, 0),
  })).filter((g) => g.count > 0);
}

function getGroup(groupId) {
  return TOP_GROUPS.find((g) => g.id === groupId);
}

function getSections(groupId) {
  ensureCache();
  return (cache.sectionsByGroupArr[groupId] || []).map((s) => ({
    id: s.id,
    title: s.title,
    count: s.productIds.length,
  }));
}

function getSection(sectionId) {
  ensureCache();
  return cache.sectionById.get(sectionId) || null;
}

function getProductsInSection(sectionId, page = 0, pageSize = 8) {
  ensureCache();
  const s = cache.sectionById.get(sectionId);
  if (!s) return { products: [], total: 0, page, pages: 0 };
  const total = s.productIds.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const slice = s.productIds.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return {
    products: slice.map((id) => cache.byId.get(id)).filter(Boolean),
    total,
    page: safePage,
    pages,
  };
}

function getProduct(id) {
  ensureCache();
  return cache.byId.get(id) || null;
}

const ALIASES = {
  videocard: 'video card',
  videocart: 'video card',
  videokarta: 'video card',
  'видеокарта': 'video card',
  'видеокарты': 'video card',
  gpu: 'video card',
  'видюха': 'video card',
  'мать': 'motherboard',
  'материнка': 'motherboard',
  mb: 'motherboard',
  'процессор': 'cpu',
  'проц': 'cpu',
  'опера': 'ddr',
  'оперативка': 'ddr',
  ram: 'ddr',
  'память': 'ddr',
  'диск': 'hdd',
  'жесткий': 'hdd',
  ssd: 'ssd',
  'ноутбук': 'notebook',
  'ноут': 'notebook',
  laptop: 'notebook',
  'моноблок': 'aio',
  'монитор': 'monitor',
  'принтер': 'printer',
  'сканер': 'scanner',
  'мышка': 'mouse',
  'мышь': 'mouse',
  'мыши': 'mouse',
  'клава': 'keyboard',
  'клавиатура': 'keyboard',
  'наушники': 'headphone',
  'кресло': 'кресл',
  'блок': 'powersupply',
  'бп': 'powersupply',
  'упс': 'ups',
};

function normalizeQuery(q) {
  const trimmed = q.trim().toLowerCase();
  const expanded = [];
  for (const tok of trimmed.split(/\s+/).filter(Boolean)) {
    expanded.push(tok);
    if (ALIASES[tok]) expanded.push(...ALIASES[tok].split(/\s+/));
  }
  return [...new Set(expanded)];
}

function buildHaystack(p) {
  return `${p.description} ${p.modelCode || ''} ${p.brand || ''} ${p.sheet || ''} ${p.section || ''}`.toLowerCase();
}

function search(query, limit = 10) {
  ensureCache();
  if (!query || query.trim().length < 2) return [];
  const tokens = normalizeQuery(query);
  if (!tokens.length) return [];

  const hits = [];
  for (const p of cache.products) {
    const hay = buildHaystack(p);
    let score = 0;
    let matched = 0;
    for (const t of tokens) {
      const idx = hay.indexOf(t);
      if (idx < 0) continue;
      matched += 1;
      score += 100 - Math.min(idx, 100);
      if (p.modelCode && p.modelCode.toLowerCase().includes(t)) score += 50;
    }
    if (matched === 0) continue;
    score += matched * 200;
    hits.push({ p, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.p);
}

module.exports = {
  buildCache,
  getTopGroups,
  getGroup,
  getSections,
  getSection,
  getProductsInSection,
  getProduct,
  search,
};
