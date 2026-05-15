const TOP_GROUPS = [
  {
    id: 'komp',
    title: '💻 Komplektuyushiylar',
    sheets: ['CPU, DDR, HDD', 'MB, GPU', 'Cooler, PowerSupply, UPS'],
  },
  {
    id: 'monitor',
    title: '🖥 Monitorlar',
    sheets: ['Monitors'],
  },
  {
    id: 'print',
    title: '🖨 Printer va skanerlar',
    sheets: ['Printers, scanners'],
  },
  {
    id: 'note',
    title: '💼 Noutbuk va monobloklar',
    sheets: ['Notebook, AIO'],
  },
  {
    id: 'vks',
    title: '📺 Interaktiv panel / VKS',
    sheets: ['Интерактивная панель', 'ВКС', 'Экраны, проекторы, камеры'],
  },
  {
    id: 'access',
    title: '🎒 Aksessuarlar (Lenovo / HP)',
    sheets: ['Lenovo Аксессуары', 'HP Аксессуары'],
  },
  {
    id: 'brand',
    title: '🏷 Brendlar boʻyicha',
    sheets: [
      'Deepcool GamerStorm', 'TRYX', 'Gembird', 'ID Cooling', 'Genius',
      'Gigabyte', 'DXRacer', 'Gamdias', 'MSI', 'Montech', 'Defender',
      'Aula', 'Lian Li', 'FSP', 'Thermaltake', 'Jonsbo', 'Meetion',
      'PowerCase', 'Игравые Кресла', 'CoolerMaster', 'Redragon',
      'Sharkoon', 'Fenda', 'Edifier', 'Koss', 'Audio-technica',
    ],
  },
];

const SHEET_TO_GROUP = {};
for (const g of TOP_GROUPS) {
  for (const s of g.sheets) SHEET_TO_GROUP[s] = g.id;
}

const SKIP_SHEETS = new Set(['Export']);

module.exports = { TOP_GROUPS, SHEET_TO_GROUP, SKIP_SHEETS };
