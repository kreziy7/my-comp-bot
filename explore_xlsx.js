const XLSX = require('xlsx');
const path = require('path');

const file = path.join(__dirname, 'Price of Age Computers.xlsx');
const wb = XLSX.readFile(file);

console.log('=== Sheets:', wb.SheetNames.length);
wb.SheetNames.forEach((n, i) => console.log(`  [${i}] ${n}`));

console.log('\n=== Sample first 10 rows from each of: CPU/MB/Printers/Lenovo/Notebook/Export');
const samples = ['CPU, DDR, HDD', 'MB, GPU', 'Printers, scanners', 'Lenovo Аксессуары', 'Notebook, AIO', 'Export'];
for (const name of samples) {
  if (!wb.Sheets[name]) {
    console.log(`\n--- [${name}] MISSING`);
    continue;
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
  console.log(`\n--- [${name}] rows=${rows.length}, first 10:`);
  rows.slice(0, 12).forEach((r, i) => console.log(`  ${i}:`, JSON.stringify(r).slice(0, 200)));
}

console.log('\n=== Brand sheets sample (TRYX, MSI, Gembird):');
for (const name of ['TRYX', 'MSI', 'Gembird']) {
  if (!wb.Sheets[name]) continue;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
  console.log(`\n--- [${name}] rows=${rows.length}, first 8:`);
  rows.slice(0, 8).forEach((r, i) => console.log(`  ${i}:`, JSON.stringify(r).slice(0, 200)));
}
