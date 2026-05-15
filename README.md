# My-Comp Bot — Age Computers

Telegram bot do'kon kataloglarini koʻrsatish va zakaz qabul qilish uchun.

Bot: **[@test_my_comp_bot](https://t.me/test_my_comp_bot)**

## Ishga tushirish

```bash
npm install
node index.js
```

`.env` da `BOT_TOKEN` va (zakazlar uchun) `ADMIN_CHAT_ID` boʻlishi kerak. Hozircha admin chat ID belgilanmagan — zakazlar consolega chiqariladi. Olish uchun botga `/myid` yozing va olingan ID ni `.env` ga qoʻshing.

## Maʼlumotlar manbasi

`Price of Age Computers.xlsx` — 38 sheet, ~2318 mahsulot. Parser har turdagi sheetni avtomatik aniqlaydi (A-tip kategoriya, B-tip Lenovo/HP aksessuar, C-tip brend roʻyxati).

## Struktura

```
index.js                # entry — IPv4-first DNS, catalog cache, bot.launch
src/
  config.js             # .env yuklash
  bot.js                # Telegraf bot — barcha handlerlar
  cart.js               # in-memory savat (Map<userId, Map<productId, qty>>)
  catalog/
    parser.js           # XLSX → Product[]
    taxonomy.js         # sheet → top group mapping
    catalog.js          # cache + getTopGroups / getSections / search
  scenes/
    search.js           # qidiruv scene
    order.js            # zakaz wizard (ism → telefon → izoh → tasdiq)
  keyboards/
    main.js             # reply keyboard
    inline.js           # inline tugmalar
  utils/
    format.js           # narx/kartochka/savat formatlash
  i18n/uz.json          # UZ tarjimalari
data/catalog.json       # parser stats (gitignored)
```

## Bot funksiyalari (MVP)

- `/start` — asosiy menyu (Browse / Search / Cart / Contact)
- 🗂 Kategoriya bo'yicha — 7 ta top-group → bo'limchalar → mahsulot pagination (8/sahifa) → kartochka
- 🔎 Qidiruv — substring multi-token, top-10 natija
- 🛒 Savat — qoʻshish/olib tashlash/tozalash, jami summa
- 📞 Zakaz — ism → telefon (request_contact) → izoh → tasdiq → admin chatga yuborish
- `/myid` — chat ID olish (admin sozlash uchun)
- `/help`, `/about`

## Holatlar va sozlash

- `ADMIN_CHAT_ID` boʻsh boʻlsa: zakaz consolega chiqadi.
- Narxi `null` mahsulot: «Narx — soʻrovga koʻra» yoziladi, savatga qoʻshib boʻlmaydi.
- Faqat UZ til. Mahsulot nomlari Excel manbasidagi til (asosan RU).
- Node 20+ kerak, IPv4-first DNS majburlab qoʻyilgan (IPv6 routing muammosi uchun).

## Keyingi qadamlar (faza 2)

- SQLite zakaz arxivi
- Admin paneli (`/orders`, statistika)
- XLSX hot-reload (`/reload_prices`)
- USD→UZS CBU API
- Toʻlov integratsiyasi (Click/Payme)
