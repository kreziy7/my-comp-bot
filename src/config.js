require('dotenv').config();

const config = {
  botToken: process.env.BOT_TOKEN,
  adminChatId: process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID).trim() : null,
  priceFile: process.env.PRICE_FILE || './Price of Age Computers.xlsx',
};

if (!config.botToken) {
  console.error('FATAL: BOT_TOKEN .env da topilmadi');
  process.exit(1);
}

if (!config.adminChatId) {
  console.warn('WARN: ADMIN_CHAT_ID set qilinmagan — zakazlar consolega chiqariladi. Botda /myid yozib chat_id ni oling va .env ga qoʻshing.');
}

module.exports = config;
