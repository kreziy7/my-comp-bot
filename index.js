const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const http = require('http');
require('dotenv').config();
const bot = require('./src/bot');
const catalog = require('./src/catalog/catalog');
const { startStatusNotifier } = require('./src/notifier');

catalog.buildCache();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const WEBHOOK_PATH = `/tg/${process.env.BOT_TOKEN}`;

async function start() {
  // Realtime: admin paneldan status o'zgarganda klientga xabar yuboradi
  startStatusNotifier(bot.telegram);

  if (WEBHOOK_URL) {
    const webhookCallback = await bot.createWebhook({ domain: WEBHOOK_URL, path: WEBHOOK_PATH });
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('my-comp-bot ok');
        return;
      }
      webhookCallback(req, res);
    });
    server.listen(PORT, () => {
      console.log(`[bot] webhook mode — listening on ${PORT}, webhook ${WEBHOOK_URL}${WEBHOOK_PATH}`);
    });
  } else {
    await bot.launch();
    console.log('[bot] polling mode — My-Comp bot launched. Press Ctrl+C to stop.');
    const server = http.createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('my-comp-bot polling');
    });
    server.listen(PORT, () => console.log(`[bot] health endpoint on ${PORT}`));
  }
}

start().catch((e) => {
  console.error('[bot] startup error:', e);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
