'use strict';
const config = require('./config');
const app = require('./app');
const prisma = require('./config/database');
const { paymentService } = require('./services');
const logger = require('./utils/logger');

const server = app.listen(config.port, () => {
  logger.info('Baguio PC Parts API listening', { port: config.port, env: config.env, docs: `${config.apiPublicUrl}/api-docs` });
});

// L2-06 scheduled reconciliation + reservation expiry (every 60 s)
let sweeping = false;
const timer = setInterval(async () => {
  if (sweeping) return;
  sweeping = true;
  try {
    const r = await paymentService.sweepExpired();
    if (r.checked) logger.info('reservation sweep', r);
  } catch (err) {
    logger.error('reservation sweep failed', { message: err.message });
  } finally {
    sweeping = false;
  }
}, 60 * 1000);

async function shutdown(signal) {
  logger.info('shutting down', { signal });
  clearInterval(timer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
