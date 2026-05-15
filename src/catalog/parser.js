const XLSX = require('xlsx');
const crypto = require('crypto');
const { SHEET_TO_GROUP, SKIP_SHEETS, TOP_GROUPS } = require('./taxonomy');

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function parseNumLoose(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/\s+/g, '').replace(/,$/, '').replace(',', '.');
  s = s.replace(/[^\d.\-]/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function hashId(...parts) {
  return crypto.createHash('md5').update(parts.join('|')).digest('hex').slice(0, 10);
}

const HEADER_HINTS = new Set([
  'опт', 'Опт', 'наименование', 'Наименование', 'оптом', 'Оптом',
  'Цена', 'цена', null,
]);

function isAtypeSectionHeader(r) {
  if (!isStr(r[0])) return false;
  const c1empty = r[1] == null || r[1] === '';
  if (!c1empty) return false;
  const c2 = r[2];
  if (c2 == null || c2 === '') return true;
  if (typeof c2 === 'string' && HEADER_HINTS.has(c2.trim())) return true;
  if (typeof c2 === 'string' && c2.trim().toLowerCase() === 'опт') return true;
  if (typeof c2 === 'string' && /^наименование|опт/i.test(c2.trim())) return true;
  return false;
}

function parseSheetA(name, rows, topGroup) {
  const products = [];
  let currentSection = name;
  let rowIdx = 0;
  for (const r of rows) {
    rowIdx++;
    if (!r || r.every((c) => c == null || c === '')) continue;
    if (isAtypeSectionHeader(r)) {
      currentSection = String(r[0]).trim();
      continue;
    }
    if (!isStr(r[0])) continue;
    if (r[0].trim().toLowerCase().startsWith('итого')) continue;
    const desc = r[0].trim();
    if (desc.length < 4) continue;
    const code = isStr(r[1]) ? r[1].trim() : (r[1] != null ? String(r[1]).trim() : null);
    const usd = parseNumLoose(r[2]);
    products.push({
      id: hashId(name, rowIdx, desc),
      sheet: name,
      section: currentSection,
      topGroup,
      description: desc,
      modelCode: code || null,
      priceUsd: usd,
      priceUzs: null,
      brand: extractBrand(desc),
    });
  }
  return products;
}

function parseSheetB(name, rows, topGroup) {
  const products = [];
  let rowIdx = 0;
  let started = false;
  for (const r of rows) {
    rowIdx++;
    if (!r || r.every((c) => c == null || c === '')) continue;
    if (!started) {
      const c0 = isStr(r[0]) ? r[0].trim().toLowerCase() : '';
      if (c0 === 'вид номенклатуры' || c0 === 'наименование' || c0 === 'аксессуары') {
        if (c0 === 'вид номенклатуры') started = true;
        continue;
      }
      if (!isStr(r[2]) && !isNum(r[3])) continue;
      started = true;
    }
    const section = isStr(r[0]) ? r[0].trim() : 'Aksessuarlar';
    const code = r[1] != null ? String(r[1]).trim() : null;
    const desc = isStr(r[2]) ? r[2].trim() : null;
    if (!desc) continue;
    const usd = parseNumLoose(r[3]);
    const uzs = parseNumLoose(r[4]);
    products.push({
      id: hashId(name, rowIdx, desc),
      sheet: name,
      section,
      topGroup,
      description: desc,
      modelCode: code || null,
      priceUsd: usd,
      priceUzs: uzs,
      brand: extractBrand(desc) || (name.startsWith('Lenovo') ? 'Lenovo' : name.startsWith('HP') ? 'HP' : null),
    });
  }
  return products;
}

function parseSheetBrand(name, rows, topGroup) {
  const candidates = [
    { code: 2, desc: 3, usd: 4, sectionCol: 0 },   // Lian Li / TRYX
    { code: 1, desc: 3, usd: 5, sectionCol: 0 },   // Genius / Meetion
    { code: null, desc: 1, usd: 3, sectionCol: null }, // Defender / Aula / Redragon (#, name, _, opt, retail)
    { code: null, desc: 1, usd: 4, sectionCol: null }, // Defender variant (retail col)
    { code: null, desc: 2, usd: 4, sectionCol: 0 },    // Sharkoon variant retail
    { code: null, desc: 2, usd: 5, sectionCol: 0 },    // Sharkoon variant opt
    { code: 1, desc: 0, usd: 2, sectionCol: null }, // MSI
    { code: 1, desc: 0, usd: 3, sectionCol: null }, // Gembird
    { code: null, desc: 0, usd: 2, sectionCol: null },
    { code: 2, desc: 0, usd: 3, sectionCol: null },
  ];
  const sheetLower = name.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const seen = new Map();
    for (const r of rows) {
      if (!r) continue;
      const desc = r[c.desc];
      const usd = parseNumLoose(r[c.usd]);
      if (isStr(desc) && desc.trim().length > 5 && usd != null && usd > 0) {
        const t = desc.trim().toLowerCase();
        if (t === sheetLower) continue;
        if (!seen.has(t)) seen.set(t, desc.trim().length);
      }
    }
    let score = 0;
    for (const len of seen.values()) score += len;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore === 0) return [];

  const products = [];
  let rowIdx = 0;
  let currentSection = name;
  for (const r of rows) {
    rowIdx++;
    if (!r || r.every((c) => c == null || c === '')) continue;
    const desc = isStr(r[best.desc]) ? r[best.desc].trim() : null;
    const usd = parseNumLoose(r[best.usd]);
    if (!desc || desc.length < 4) continue;

    if (usd == null) {
      const c2 = r[2];
      if (isStr(desc) && (r[1] == null || r[1] === '') && (c2 == null || c2 === '' || (typeof c2 === 'string' && HEADER_HINTS.has(c2.trim())))) {
        if (desc.toLowerCase() !== name.toLowerCase()) currentSection = desc;
        continue;
      }
    }
    const lower = desc.toLowerCase();
    if (lower === 'наименование' || lower === 'вид номенклатуры' || lower.startsWith('итого')) continue;
    if (lower === name.toLowerCase()) continue;

    const code = best.code != null && r[best.code] != null ? String(r[best.code]).trim() : null;
    products.push({
      id: hashId(name, rowIdx, desc),
      sheet: name,
      section: best.sectionCol != null && isStr(r[best.sectionCol]) ? r[best.sectionCol].trim() : currentSection,
      topGroup,
      description: desc,
      modelCode: code || null,
      priceUsd: usd,
      priceUzs: null,
      brand: name,
    });
  }
  return products;
}

const BRAND_HEAD_RE = /^([A-Za-z][\w\-]{1,20})/;
function extractBrand(desc) {
  if (!isStr(desc)) return null;
  const m = desc.match(BRAND_HEAD_RE);
  if (!m) return null;
  const cand = m[1];
  if (cand.length <= 1) return null;
  const lower = cand.toLowerCase();
  if (['the', 'with', 'и', 'для'].includes(lower)) return null;
  return cand;
}

const ATYPE_SHEETS = new Set([
  'CPU, DDR, HDD', 'MB, GPU', 'Monitors', 'Printers, scanners',
  'Notebook, AIO', 'Cooler, PowerSupply, UPS',
  'Интерактивная панель', 'ВКС', 'Экраны, проекторы, камеры',
]);
const BTYPE_SHEETS = new Set(['Lenovo Аксессуары', 'HP Аксессуары']);

function parseWorkbook(filePath) {
  const wb = XLSX.readFile(filePath);
  const allProducts = [];
  const stats = {};

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue;
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    const topGroup = SHEET_TO_GROUP[sheetName] || 'brand';

    let products = [];
    if (ATYPE_SHEETS.has(sheetName)) products = parseSheetA(sheetName, rows, topGroup);
    else if (BTYPE_SHEETS.has(sheetName)) products = parseSheetB(sheetName, rows, topGroup);
    else products = parseSheetBrand(sheetName, rows, topGroup);

    stats[sheetName] = products.length;
    allProducts.push(...products);
  }

  return { products: allProducts, stats };
}

module.exports = { parseWorkbook };
