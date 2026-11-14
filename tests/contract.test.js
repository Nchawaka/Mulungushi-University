// API contract tests: every response is validated against the response schema, status code,
// content type and headers declared in openapi/openapi.json.
process.env.DEV_STAFF_SESSION = 'test-session-id';
process.env.ENABLE_TEST_ROUTES = 'true';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { Validator } = require('@seriousme/openapi-schema-validator');
const { createApp } = require('../src/app');
const { spec } = require('../src/spec');
const { ajvStrict, rewriteRefs, resolveRef, findOperation } = require('../src/validation');

let server;
let base;
const COOKIE = { Cookie: 'cprs_sid=test-session-id' };
const JSON_H = { 'Content-Type': 'application/json' };

const validReport = (over = {}) => ({
  category: 'electrical',
  title: 'Broken socket near the window',
  description: 'The double socket next to the window has no power.',
  building: 'Block A',
  location: 'Room 12',
  ...over,
});

before(async () => {
  const app = createApp({ rateLimitMax: 10000, seedDemoData: false, enableTestRoutes: true });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { body, headers = {}, raw } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined || raw !== undefined ? JSON_H : {}), ...headers },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, headers: res.headers, json, text };
}

// Core contract assertion
function assertConforms(operationId, res, expectedStatus) {
  const { op } = findOperation(operationId);
  assert.equal(res.status, expectedStatus, `status: expected ${expectedStatus}, got ${res.status} (${res.text})`);
  const def = resolveRef(op.responses[String(expectedStatus)]);
  assert.ok(def, `status ${expectedStatus} is not documented for ${operationId}`);
  const [mediaType, media] = Object.entries(def.content)[0];
  assert.ok(res.headers.get('content-type').startsWith(mediaType), `content-type ${res.headers.get('content-type')} != ${mediaType}`);
  const validate = ajvStrict.compile(rewriteRefs(media.schema));
  assert.ok(validate(res.json), `body does not match schema: ${JSON.stringify(validate.errors)}`);
  for (const h of Object.keys(def.headers || {})) {
    if (h === 'Retry-After' && expectedStatus !== 429) continue;
    assert.ok(res.headers.has(h), `documented header ${h} missing`);
  }
}

describe('specification itself', () => {
  test('is a valid OpenAPI 3.1 document', async () => {
    const v = new Validator();
    const result = await v.validate(spec);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(v.version, '3.1');
  });
  test('/api-docs serves Swagger UI and /openapi.json serves the contract', async () => {
    const docs = await fetch(base + '/api-docs/');
    assert.equal(docs.status, 200);
    assert.match(await docs.text(), /swagger-ui/i);
    const s = await call('GET', '/openapi.json');
    assert.equal(s.json.openapi, '3.1.0');
  });
});

describe('POST /api/v1/reports', () => {
  test('201 Created with Location header and spec-conformant body', async () => {
    const res = await call('POST', '/api/v1/reports', { body: validReport() });
    assertConforms('createReport', res, 201);
    assert.equal(res.json.status, 'submitted');
    assert.equal(res.headers.get('location'), `/api/v1/reports/${res.json.id}`);
  });

  const invalid = [
    ['missing required fields', {}],
    ['wrong type (title is a number)', validReport({ title: 12345 })],
    ['title too short (minLength)', validReport({ title: 'abc' })],
    ['description too short (minLength)', validReport({ description: 'short' })],
    ['title too long (maxLength)', validReport({ title: 'x'.repeat(101) })],
    ['category not in enum', validReport({ category: 'cooking' })],
    ['building violates regex pattern', validReport({ building: '<script>alert(1)</script>' })],
    ['title has leading whitespace (pattern)', validReport({ title: '  padded title' })],
    ['unknown property (additionalProperties:false)', validReport({ isAdmin: true })],
    ['array instead of object', [validReport()]],
  ];
  for (const [name, body] of invalid) {
    test(`422 + RFC 7807 for: ${name}`, async () => {
      const res = await call('POST', '/api/v1/reports', { body });
      assertConforms('createReport', res, 422);
      assert.equal(res.json.status, 422);
      assert.ok(res.json.errors.length >= 1);
      assert.equal(res.json.instance, '/api/v1/reports');
    });
  }

  test('400 + RFC 7807 for malformed JSON', async () => {
    const res = await call('POST', '/api/v1/reports', { raw: '{"category": "electrical", ' });
    assertConforms('createReport', res, 400);
  });
  test('400 + RFC 7807 for wrong Content-Type', async () => {
    const res = await call('POST', '/api/v1/reports', { raw: 'category=electrical', headers: { 'Content-Type': 'text/plain' } });
    assertConforms('createReport', res, 400);
  });
  test('invalid payloads are rejected before reaching business logic (nothing stored)', async () => {
    const before = await call('GET', '/api/v1/reports?limit=50');
    await call('POST', '/api/v1/reports', { body: validReport({ category: 'nope' }) });
    const after = await call('GET', '/api/v1/reports?limit=50');
    assert.equal(after.json.pagination.total, before.json.pagination.total);
  });
});

describe('GET /api/v1/reports', () => {
  test('200 with pagination and filters', async () => {
    await call('POST', '/api/v1/reports', { body: validReport({ category: 'plumbing', title: 'Tap will not close' }) });
    const res = await call('GET', '/api/v1/reports?page=1&limit=5&category=plumbing');
    assertConforms('listReports', res, 200);
    assert.ok(res.json.data.length <= 5);
    assert.ok(res.json.data.every((r) => r.category === 'plumbing'));
    assert.equal(res.json.pagination.limit, 5);
  });
  const badQueries = ['limit=0', 'limit=51', 'limit=abc', 'page=0', 'page=-1', 'status=banana', 'category=cooking', 'sort=asc', 'limit=5&extra=1'];
  for (const q of badQueries) {
    test(`400 + RFC 7807 for ?${q}`, async () => {
      const res = await call('GET', `/api/v1/reports?${q}`);
      assertConforms('listReports', res, 400);
      assert.equal(res.json.errors[0].in, 'query');
    });
  }
});

describe('GET /api/v1/reports/{reportId}', () => {
  test('200 for an existing report', async () => {
    const created = await call('POST', '/api/v1/reports', { body: validReport() });
    const res = await call('GET', `/api/v1/reports/${created.json.id}`);
    assertConforms('getReport', res, 200);
    assert.deepEqual(res.json, created.json);
  });
  test('404 + RFC 7807 for unknown id', async () => {
    const res = await call('GET', '/api/v1/reports/3f2b8c1e-7a4d-4e57-9c63-0d1f2a3b4c5d');
    assertConforms('getReport', res, 404);
  });
  test('400 + RFC 7807 for malformed id', async () => {
    const res = await call('GET', '/api/v1/reports/not-a-uuid');
    assertConforms('getReport', res, 400);
    assert.equal(res.json.errors[0].in, 'path');
  });
});

describe('PATCH /api/v1/reports/{reportId}/status', () => {
  let id;
  before(async () => {
    id = (await call('POST', '/api/v1/reports', { body: validReport() })).json.id;
  });
  test('401 + RFC 7807 without a session cookie', async () => {
    const res = await call('PATCH', `/api/v1/reports/${id}/status`, { body: { status: 'in_review' } });
    assertConforms('updateReportStatus', res, 401);
  });
  test('401 for an unknown session id', async () => {
    const res = await call('PATCH', `/api/v1/reports/${id}/status`, { body: { status: 'in_review' }, headers: { Cookie: 'cprs_sid=forged' } });
    assertConforms('updateReportStatus', res, 401);
  });
  test('401 is returned before validation (no information leak to anonymous callers)', async () => {
    const res = await call('PATCH', `/api/v1/reports/not-a-uuid/status`, { body: { nonsense: true } });
    assertConforms('updateReportStatus', res, 401);
  });
  test('200 with a valid session', async () => {
    const res = await call('PATCH', `/api/v1/reports/${id}/status`, { body: { status: 'assigned', note: 'Electrician booked' }, headers: COOKIE });
    assertConforms('updateReportStatus', res, 200);
    assert.equal(res.json.status, 'assigned');
    assert.equal(res.json.statusNote, 'Electrician booked');
  });
  test('422 for invalid status value', async () => {
    const res = await call('PATCH', `/api/v1/reports/${id}/status`, { body: { status: 'done' }, headers: COOKIE });
    assertConforms('updateReportStatus', res, 422);
  });
  test('422 for unknown property', async () => {
    const res = await call('PATCH', `/api/v1/reports/${id}/status`, { body: { status: 'resolved', priority: 'high' }, headers: COOKIE });
    assertConforms('updateReportStatus', res, 422);
  });
  test('400 for malformed id with a valid session', async () => {
    const res = await call('PATCH', `/api/v1/reports/xyz/status`, { body: { status: 'resolved' }, headers: COOKIE });
    assertConforms('updateReportStatus', res, 400);
  });
  test('404 for unknown id with a valid session', async () => {
    const res = await call('PATCH', `/api/v1/reports/3f2b8c1e-7a4d-4e57-9c63-0d1f2a3b4c5d/status`, { body: { status: 'resolved' }, headers: COOKIE });
    assertConforms('updateReportStatus', res, 404);
  });
});

describe('GET /api/v1/priorities (highest report count = highest priority)', () => {
  test('issues are ranked by number of reports, resolved reports are excluded', async () => {
    const mk = (n, over) => Promise.all(Array.from({ length: n }, () => call('POST', '/api/v1/reports', { body: validReport(over) })));
    await mk(3, { category: 'security', building: 'Prio Hostel', location: 'Gate', title: 'Gate lock broken' });
    await mk(5, { category: 'plumbing', building: 'Prio Hostel', location: 'Bathroom', title: 'Tap leaking badly' });
    const resolved = await mk(8, { category: 'electrical', building: 'Prio Hostel', location: 'Lab', title: 'Socket sparks' });
    for (const r of resolved) await call('PATCH', `/api/v1/reports/${r.json.id}/status`, { body: { status: 'resolved' }, headers: COOKIE });

    const res = await call('GET', '/api/v1/priorities?limit=50');
    assertConforms('listPriorities', res, 200);
    const list = res.json.data;
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].reportCount >= list[i].reportCount, 'not sorted by reportCount desc');
    list.forEach((it, i) => assert.equal(it.rank, i + 1));
    const bathroom = list.find((x) => x.location === 'Bathroom');
    const gate = list.find((x) => x.location === 'Gate');
    assert.equal(bathroom.reportCount, 5);
    assert.equal(bathroom.priorityLevel, 'high');
    assert.equal(gate.reportCount, 3);
    assert.equal(gate.priorityLevel, 'medium');
    assert.ok(bathroom.rank < gate.rank, 'issue with more reports must rank higher');
    assert.equal(list.find((x) => x.location === 'Lab'), undefined, 'resolved issue must not appear');
  });
  test('grouping ignores letter case and extra spaces', async () => {
    await call('POST', '/api/v1/reports', { body: validReport({ category: 'furniture', building: 'case hall', location: 'room  1', title: 'Chair broken one' }) });
    await call('POST', '/api/v1/reports', { body: validReport({ category: 'furniture', building: 'CASE HALL', location: 'Room 1', title: 'Chair broken two' }) });
    const res = await call('GET', '/api/v1/priorities?limit=50');
    const hit = res.json.data.filter((x) => x.category === 'furniture' && x.building.toLowerCase() === 'case hall');
    assert.equal(hit.length, 1);
    assert.equal(hit[0].reportCount, 2);
  });
  test('400 for invalid limit', async () => {
    const res = await call('GET', '/api/v1/priorities?limit=0');
    assertConforms('listPriorities', res, 400);
  });
});

describe('error handling', () => {
  test('500 + RFC 7807 and no internal details leaked', async () => {
    const res = await call('GET', '/api/v1/_test/error');
    assert.equal(res.status, 500);
    assert.equal(res.headers.get('content-type').startsWith('application/problem+json'), true);
    const validate = ajvStrict.compile(rewriteRefs({ $ref: '#/components/schemas/Problem' }));
    assert.ok(validate(res.json), JSON.stringify(validate.errors));
    assert.doesNotMatch(res.text, /deliberate test failure|at .*\.js/);
  });
  test('404 + RFC 7807 for unknown route', async () => {
    const res = await call('GET', '/api/v1/nope');
    assert.equal(res.status, 404);
    assert.equal(res.json.type, 'https://cprs.example.org/problems/not-found');
  });
});
