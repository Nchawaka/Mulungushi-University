// RFC 7807 Problem Details helpers
const BASE = 'https://cprs.example.org/problems';

const TYPES = {
  400: { slug: 'bad-request', title: 'Bad Request' },
  401: { slug: 'unauthorized', title: 'Unauthorized' },
  404: { slug: 'not-found', title: 'Not Found' },
  422: { slug: 'validation-error', title: 'Unprocessable Entity' },
  429: { slug: 'too-many-requests', title: 'Too Many Requests' },
  500: { slug: 'internal-error', title: 'Internal Server Error' },
};

function problem(status, detail, extra = {}) {
  const t = TYPES[status] || { slug: 'error', title: 'Error' };
  return { type: `${BASE}/${t.slug}`, title: t.title, status, detail, ...extra };
}

function sendProblem(req, res, status, detail, extra = {}) {
  const body = problem(status, detail, { instance: req.originalUrl.split('?')[0], ...extra });
  res.status(status).type('application/problem+json').send(JSON.stringify(body));
}

class HttpProblem extends Error {
  constructor(status, detail, extra) {
    super(detail);
    this.status = status;
    this.extra = extra;
  }
}

module.exports = { problem, sendProblem, HttpProblem };
