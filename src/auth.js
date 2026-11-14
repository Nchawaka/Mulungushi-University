// Minimal session check so the 401 contract is real in Lab 4.
// Lab 5 (Part B) replaces sessionStore with the real login/logout flow; the middleware stays the same.
const { HttpProblem } = require('./problem');

const COOKIE_NAME = 'cprs_sid';
const sessionStore = new Set();

// A development session can be injected through the environment. Nothing is seeded by default.
if (process.env.DEV_STAFF_SESSION) sessionStore.add(process.env.DEV_STAFF_SESSION);

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function requireSession(req, res, next) {
  const sid = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!sid || !sessionStore.has(sid)) {
    res.set('WWW-Authenticate', 'Cookie realm="cprs"');
    return next(new HttpProblem(401, 'A valid session is required to access this resource.'));
  }
  next();
}

module.exports = { requireSession, sessionStore, COOKIE_NAME };
