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

function firstOrgLink(html) {
  const m = html.match(/href="\/ru\/organization\/([a-f0-9]+)\/?"/);
  return m ? m[1] : null;
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

async function fetchOrgByInn(inn) {
  const searchUrl = `https://orginfo.uz/ru/search/organizations/?q=${encodeURIComponent(inn)}`;
  const searchHtml = await fetchHtml(searchUrl);
  const orgId = firstOrgLink(searchHtml);
  if (!orgId) return null;

  const orgUrl = `https://orginfo.uz/ru/organization/${orgId}/`;
  const orgHtml = await fetchHtml(orgUrl);
  const ld = extractOrgJsonLd(orgHtml);
  if (!ld) return null;

  const taxID = String(ld.taxID ?? ld.identifier ?? '').trim();
  if (taxID && taxID !== inn) return null;

  const addr = ld.address || {};
  const employee = ld.employee || {};

  return {
    inn: taxID || inn,
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
  };
}

module.exports = { fetchOrgByInn };
