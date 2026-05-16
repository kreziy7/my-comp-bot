// orginfo.uz dan STIR (INN) bo'yicha kompaniya ma'lumotini olib chiqadi.

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ru,uz;q=0.9,en;q=0.8' },
  });
  if (!r.ok) throw new Error(`orginfo HTTP ${r.status}`);
  return await r.text();
}

function orgLinks(html) {
  const seen = new Set();
  const re = /href="\/ru\/organization\/([a-f0-9]+)\/?"/g;
  let m;
  while ((m = re.exec(html))) seen.add(m[1]);
  return [...seen];
}

function extractOrgJsonLd(html) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj && (obj['@type'] === 'Organization' || obj['@type'] === 'Corporation')) {
        return obj;
      }
    } catch { /* skip */ }
  }
  return null;
}

function buildResult(ld, orgId, orgUrl, fallbackInn) {
  const taxID = String(ld.taxID ?? ld.identifier ?? '').replace(/\D/g, '');
  const addr = ld.address || {};
  const employee = ld.employee || {};
  return {
    inn: taxID || fallbackInn,
    name: ld.name || '',
    legalName: ld.legalName || ld.name || '',
    email: ld.email || null,
    telephone: ld.telephone || null,
    address: addr.streetAddress || null,
    locality: addr.addressLocality || null,
    foundingDate: ld.foundingDate || null,
    directorName: employee.name || null,
    orginfoId: orgId,
    orginfoUrl: orgUrl,
    _taxID: taxID,
  };
}

async function fetchOrgByInn(inn) {
  const searchUrl = `https://orginfo.uz/ru/search/organizations/?q=${encodeURIComponent(inn)}`;
  const searchHtml = await fetchHtml(searchUrl);
  const ids = orgLinks(searchHtml).slice(0, 5);
  if (!ids.length) return null;

  let firstParsed = null;
  for (const orgId of ids) {
    const orgUrl = `https://orginfo.uz/ru/organization/${orgId}/`;
    let orgHtml;
    try { orgHtml = await fetchHtml(orgUrl); } catch { continue; }
    const ld = extractOrgJsonLd(orgHtml);
    if (!ld) continue;
    const result = buildResult(ld, orgId, orgUrl, inn);
    if (result._taxID === inn) {
      delete result._taxID;
      return result;
    }
    if (!firstParsed) firstParsed = result;
  }

  // No exact match, but search did surface candidates and the first one
  // had no taxID in JSON-LD — accept it as best-effort (orginfo sometimes
  // omits taxID for partner companies).
  if (firstParsed && !firstParsed._taxID) {
    delete firstParsed._taxID;
    return firstParsed;
  }
  return null;
}

module.exports = { fetchOrgByInn };
