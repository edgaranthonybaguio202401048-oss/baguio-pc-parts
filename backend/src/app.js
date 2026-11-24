'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const requestId = require('./middleware/requestId');
const { apiLimiter } = require('./middleware/rateLimiters');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const webhookRoutes = require('./routes/webhooks');
const v1 = require('./routes');
const { registerOrderListeners } = require('./patterns/observer/listeners');
const { ok } = require('./utils/response');

registerOrderListeners();

const app = express();
app.disable('x-powered-by');
// Render/Railway sit behind one proxy – needed for correct req.ip (rate limits, Maya IP allow-list)
app.set('trust proxy', 1);

app.use(requestId);
// Security headers everywhere; Swagger UI gets the same headers minus CSP (it injects inline init code).
const strictHelmet = helmet();
const docsHelmet = helmet({ contentSecurityPolicy: false });
app.use((req, res, next) => (req.path.startsWith('/api-docs') ? docsHelmet : strictHelmet)(req, res, next));

// S-09: explicit allow-list, no wildcard with credentials
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // server-to-server (webhooks, curl, Postman)
    if (config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS_ORIGIN_DENIED'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed', 'X-Delete-Mode'],
  credentials: false,
  maxAge: 600,
}));

app.get('/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));

// Webhooks need the raw body – mount before the JSON parser
app.use('/api/v1/webhooks', webhookRoutes);

app.use(express.json({ limit: '100kb' }));
app.use('/api/v1', apiLimiter, v1);

// T-11: live Swagger UI rendering the repository's openapi.yaml
const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
spec.servers = [{ url: `${config.apiPublicUrl}/api/v1`, description: 'This server' }, ...(spec.servers || [])];
app.get('/api-docs/openapi.json', (_req, res) => res.json(spec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
  customSiteTitle: 'Baguio PC Parts API',
  swaggerOptions: { persistAuthorization: true },
}));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
