// Rate limiting: threshold breach returns 429 + RFC 7807 body + Retry-After; headers match the spec.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { ajvStrict, rewriteRefs } = require('../src/validation');

const MAX = 5;
let server;
let base;

before(async () => {
  const app = createApp({ rateLimitMax: MAX, rateLimitWindowMs: 60_000, seedDemoData: false });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test('requests 1..5 succeed and expose RateLimit-* headers that count down', async () => {
  for (let i = 1; i <= MAX; i++) {
    const res = await fetch(`${base}/api/v1/reports`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('ratelimit-limit'), String(MAX));
    assert.equal(res.headers.get('ratelimit-remaining'), String(MAX - i));
    assert.ok(Number(res.headers.get('ratelimit-reset')) > 0);
    assert.match(res.headers.get('ratelimit-policy'), /^5;w=60$/);
    await res.arrayBuffer();
  }
});

test('request 6 is rejected with 429, Retry-After and an RFC 7807 body', async () => {
  const res = await fetch(`${base}/api/v1/reports`);
  assert.equal(res.status, 429);
  assert.ok(res.headers.get('content-type').startsWith('application/problem+json'));
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  assert.equal(res.headers.get('ratelimit-remaining'), '0');
  const body = await res.json();
  assert.ok(ajvStrict.compile(rewriteRefs({ $ref: '#/components/schemas/Problem' }))(body));
  assert.equal(body.status, 429);
});

test('the limit also applies to invalid requests and other routes under /api/v1', async () => {
  const res = await fetch(`${base}/api/v1/priorities`);
  assert.equal(res.status, 429);
  await res.arrayBuffer();
});

test('the documentation portal is not rate limited', async () => {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${base}/openapi.json`);
    assert.equal(res.status, 200);
    await res.arrayBuffer();
  }
});
