const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const { spec } = require('./spec');
const { createStore } = require('./store');
const { seed } = require('./seed');
const reportRoutes = require('./routes/reports');
const { sendProblem, HttpProblem } = require('./problem');

function createApp(options = {}) {
  const {
    rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 100,
    rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    seedDemoData = process.env.SEED_DEMO_DATA === 'true',
    enableTestRoutes = process.env.ENABLE_TEST_ROUTES === 'true',
  } = options;

  const app = express();
  const store = createStore();
  if (seedDemoData) seed(store);

  app.disable('x-powered-by');
  app.use(cors({ origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','), credentials: true }));

  // Interactive documentation (Task 3) - mounted before the rate limiter so the portal itself is never throttled
  app.get('/openapi.json', (req, res) => res.json(spec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'CPRS API Docs' }));

  // Rate limiting (Task 4): 429 + RFC 7807 body + standard RateLimit-* headers
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: rateLimitWindowMs,
      limit: rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) =>
        sendProblem(req, res, 429, `Rate limit of ${rateLimitMax} requests per ${Math.round(rateLimitWindowMs / 1000)} seconds exceeded. Retry later.`),
    })
  );

  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', reportRoutes(store));

  if (enableTestRoutes) {
    // Test-only: lets the contract suite prove the 500 response shape. Never enabled in production.
    app.get('/api/v1/_test/error', () => {
      throw new Error('deliberate test failure with internal details that must not leak');
    });
  }

  app.use((req, res) => sendProblem(req, res, 404, `No route for ${req.method} ${req.originalUrl.split('?')[0]}.`));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpProblem) {
      return sendProblem(req, res, err.status, err.message, err.extra || {});
    }
    // body-parser errors (malformed JSON, payload too large) -> 400
    if (err.type === 'entity.parse.failed') return sendProblem(req, res, 400, 'The request body is not valid JSON.');
    if (err.type === 'entity.too.large') return sendProblem(req, res, 400, 'The request body is too large.');
    console.error(err);
    sendProblem(req, res, 500, 'An unexpected error occurred. Please try again later.');
  });

  return app;
}

module.exports = { createApp };
