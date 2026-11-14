// Generates postman/cprs-contract.postman_collection.json and postman/cprs-ratelimit.postman_collection.json
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'postman');

const reportSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'category', 'title', 'description', 'building', 'location', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    category: { enum: ['electrical', 'plumbing', 'security', 'furniture', 'lighting', 'ict', 'sanitation', 'other'] },
    title: { type: 'string', minLength: 5, maxLength: 100 },
    description: { type: 'string', minLength: 10, maxLength: 1000 },
    building: { type: 'string', minLength: 2, maxLength: 60 },
    location: { type: 'string', minLength: 1, maxLength: 60 },
    status: { enum: ['submitted', 'in_review', 'assigned', 'in_progress', 'resolved'] },
    statusNote: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};
const problemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer', minimum: 400, maximum: 599 },
    detail: { type: 'string' },
    instance: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['in', 'field', 'message'],
        properties: { in: { enum: ['body', 'query', 'path'] }, field: { type: 'string' }, message: { type: 'string' }, keyword: { type: 'string' } },
      },
    },
  },
};

const lines = (s) => s.split('\n');
const url = (p, query) => ({
  raw: `{{baseUrl}}${p}${query ? '?' + query : ''}`,
  host: ['{{baseUrl}}'],
  path: p.split('/').filter(Boolean),
  ...(query ? { query: query.split('&').map((kv) => ({ key: kv.split('=')[0], value: kv.split('=')[1] })) } : {}),
});

const JSON_HDR = [{ key: 'Content-Type', value: 'application/json' }];
const rlHeaderChecks = `
pm.test('Rate-limit headers are present (documented in OpenAPI)', () => {
  pm.response.to.have.header('RateLimit-Limit');
  pm.response.to.have.header('RateLimit-Remaining');
  pm.response.to.have.header('RateLimit-Reset');
});`;
const problemChecks = (status) => `
pm.test('Status is ${status}', () => pm.response.to.have.status(${status}));
pm.test('Content-Type is application/problem+json (RFC 7807)', () => {
  pm.expect(pm.response.headers.get('Content-Type')).to.include('application/problem+json');
});
pm.test('Body matches the Problem schema and status field equals ${status}', () => {
  const body = pm.response.json();
  pm.response.to.have.jsonSchema(${JSON.stringify(problemSchema)});
  pm.expect(body.status).to.eql(${status});
});${rlHeaderChecks}`;

const req = (name, method, p, { query, body, headers = [], raw } = {}, test) => ({
  name,
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: lines(test.trim()) } }],
  request: {
    method,
    header: [...(body !== undefined || raw !== undefined ? JSON_HDR : []), ...headers],
    ...(body !== undefined ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}),
    ...(raw !== undefined ? { body: { mode: 'raw', raw } } : {}),
    url: url(p, query),
  },
});

const good = {
  category: 'electrical',
  title: 'Broken socket near the window',
  description: 'The double socket next to the window has no power.',
  building: 'Block A',
  location: 'Room 12',
};

const contract = {
  info: {
    name: 'CPRS API - Contract Tests',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Verifies status codes, response structures and RFC 7807 error bodies against openapi/openapi.json',
  },
  item: [
    req('POST /reports - valid (201)', 'POST', '/api/v1/reports', { body: good }, `
pm.test('Status is 201 Created', () => pm.response.to.have.status(201));
pm.test('Content-Type is application/json', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'));
pm.test('Body matches the Report schema', () => pm.response.to.have.jsonSchema(${JSON.stringify(reportSchema)}));
pm.test('New report starts as "submitted"', () => pm.expect(pm.response.json().status).to.eql('submitted'));
pm.test('Location header points to the new report', () => pm.expect(pm.response.headers.get('Location')).to.eql('/api/v1/reports/' + pm.response.json().id));
pm.collectionVariables.set('reportId', pm.response.json().id);${rlHeaderChecks}`),

    req('POST /reports - missing required fields (422)', 'POST', '/api/v1/reports', { body: { category: 'plumbing' } }, `${problemChecks(422)}
pm.test('errors[] lists each missing field', () => {
  const fields = pm.response.json().errors.map(e => e.field);
  pm.expect(fields).to.include.members(['/title', '/description', '/building', '/location']);
});`),

    req('POST /reports - wrong type + bad enum + short title (422)', 'POST', '/api/v1/reports', { body: { ...good, category: 'cooking', title: 123 } }, problemChecks(422)),

    req('POST /reports - regex pattern violation (422)', 'POST', '/api/v1/reports', { body: { ...good, building: '<script>alert(1)</script>' } }, `${problemChecks(422)}
pm.test('failed keyword is "pattern"', () => pm.expect(pm.response.json().errors.map(e => e.keyword)).to.include('pattern'));`),

    req('POST /reports - unknown property (422)', 'POST', '/api/v1/reports', { body: { ...good, isAdmin: true } }, `${problemChecks(422)}
pm.test('failed keyword is "additionalProperties"', () => pm.expect(pm.response.json().errors.map(e => e.keyword)).to.include('additionalProperties'));`),

    req('POST /reports - malformed JSON (400)', 'POST', '/api/v1/reports', { raw: '{"category": "electrical", ' }, problemChecks(400)),

    req('GET /reports/{id} - existing (200)', 'GET', '/api/v1/reports/{{reportId}}', {}, `
pm.test('Status is 200', () => pm.response.to.have.status(200));
pm.test('Body matches the Report schema', () => pm.response.to.have.jsonSchema(${JSON.stringify(reportSchema)}));
pm.test('id matches the created report', () => pm.expect(pm.response.json().id).to.eql(pm.collectionVariables.get('reportId')));${rlHeaderChecks}`),

    req('GET /reports/{id} - unknown (404)', 'GET', '/api/v1/reports/3f2b8c1e-7a4d-4e57-9c63-0d1f2a3b4c5d', {}, problemChecks(404)),

    req('GET /reports/{id} - malformed id (400)', 'GET', '/api/v1/reports/not-a-uuid', {}, problemChecks(400)),

    req('GET /reports - list with filter (200)', 'GET', '/api/v1/reports', { query: 'page=1&limit=5&category=electrical' }, `
pm.test('Status is 200', () => pm.response.to.have.status(200));
pm.test('Pagination object is correct', () => {
  const b = pm.response.json();
  pm.expect(b.pagination.page).to.eql(1);
  pm.expect(b.pagination.limit).to.eql(5);
  pm.expect(b.data.length).to.be.at.most(5);
});
pm.test('Every item matches the Report schema and the filter', () => {
  pm.response.json().data.forEach(r => { pm.expect(tv4.validate(r, ${JSON.stringify(reportSchema)})).to.be.true; pm.expect(r.category).to.eql('electrical'); });
});${rlHeaderChecks}`),

    req('GET /reports - invalid limit (400)', 'GET', '/api/v1/reports', { query: 'limit=0' }, problemChecks(400)),

    req('GET /reports - unsupported query parameter (400)', 'GET', '/api/v1/reports', { query: 'sort=asc' }, problemChecks(400)),

    req('PATCH /reports/{id}/status - no session (401)', 'PATCH', '/api/v1/reports/{{reportId}}/status', { body: { status: 'in_review' } }, problemChecks(401)),

    req('PATCH /reports/{id}/status - valid session (200)', 'PATCH', '/api/v1/reports/{{reportId}}/status',
      { body: { status: 'assigned', note: 'Electrician booked' }, headers: [{ key: 'Cookie', value: 'cprs_sid={{staffSession}}' }] }, `
pm.test('Status is 200', () => pm.response.to.have.status(200));
pm.test('Body matches the Report schema', () => pm.response.to.have.jsonSchema(${JSON.stringify(reportSchema)}));
pm.test('Status changed to "assigned"', () => pm.expect(pm.response.json().status).to.eql('assigned'));${rlHeaderChecks}`),

    req('PATCH /reports/{id}/status - invalid status (422)', 'PATCH', '/api/v1/reports/{{reportId}}/status',
      { body: { status: 'done' }, headers: [{ key: 'Cookie', value: 'cprs_sid={{staffSession}}' }] }, problemChecks(422)),

    req('GET /priorities - ranked by report count (200)', 'GET', '/api/v1/priorities', { query: 'limit=50' }, `
pm.test('Status is 200', () => pm.response.to.have.status(200));
pm.test('Issues are sorted by reportCount (highest first) and ranked 1..n', () => {
  const list = pm.response.json().data;
  list.forEach((it, i) => {
    pm.expect(it.rank).to.eql(i + 1);
    if (i > 0) pm.expect(list[i - 1].reportCount).to.be.at.least(it.reportCount);
  });
});
pm.test('priorityLevel follows the documented thresholds', () => {
  pm.response.json().data.forEach(it => {
    const expected = it.reportCount >= 10 ? 'critical' : it.reportCount >= 5 ? 'high' : it.reportCount >= 3 ? 'medium' : 'low';
    pm.expect(it.priorityLevel).to.eql(expected);
  });
});${rlHeaderChecks}`),
  ],
  variable: [{ key: 'reportId', value: '' }],
};

const rate = {
  info: {
    name: 'CPRS API - Rate Limit Test',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Run with --iteration-count 8 against a server started with RATE_LIMIT_MAX=5. Requests 1-5 return 200, requests 6-8 return 429.',
  },
  item: [
    req('GET /reports (repeated)', 'GET', '/api/v1/reports', {}, `
const max = Number(pm.environment.get('rateLimitMax') || 5);
const n = pm.info.iteration + 1;   // request number within the window
if (n <= max) {
  pm.test('Request ' + n + ' of ' + max + ' allowed: 200 OK', () => pm.response.to.have.status(200));
  pm.test('RateLimit-Remaining counts down to ' + (max - n), () => pm.expect(pm.response.headers.get('RateLimit-Remaining')).to.eql(String(max - n)));
} else {
  pm.test('Request ' + n + ' exceeds the limit: 429 Too Many Requests', () => pm.response.to.have.status(429));
  pm.test('Retry-After header present', () => pm.expect(Number(pm.response.headers.get('Retry-After'))).to.be.above(0));
  pm.test('Body is RFC 7807 application/problem+json', () => {
    pm.expect(pm.response.headers.get('Content-Type')).to.include('application/problem+json');
    pm.expect(pm.response.json().status).to.eql(429);
  });
}
pm.test('RateLimit-Limit equals ' + max, () => pm.expect(pm.response.headers.get('RateLimit-Limit')).to.eql(String(max)));`),
  ],
};

fs.writeFileSync(path.join(outDir, 'cprs-contract.postman_collection.json'), JSON.stringify(contract, null, 2));
fs.writeFileSync(path.join(outDir, 'cprs-ratelimit.postman_collection.json'), JSON.stringify(rate, null, 2));
console.log('postman collections written');
