# CPRS API – ICT461 Lab 4 (Part A)

Contract-first REST API for the Campus Problem Reporting System. The OpenAPI 3.1 file is the single source of truth:
the same JSON Schemas drive request validation (Ajv), the Swagger UI portal and the contract tests.

## Run
```bash
npm install
SEED_DEMO_DATA=true DEV_STAFF_SESSION=some-long-random-value npm start   # http://localhost:3000
```
- Swagger UI: http://localhost:3000/api-docs   - Raw contract: http://localhost:3000/openapi.json
- Env: `PORT`, `RATE_LIMIT_MAX` (default 100), `RATE_LIMIT_WINDOW_MS` (default 900000), `CORS_ORIGINS` (comma list, default http://localhost:5173), `SEED_DEMO_DATA`, `DEV_STAFF_SESSION`.

## Test
```bash
npm test               # 46 contract + rate-limit tests (node:test, Ajv validates every response against the spec)
npm run test:newman    # Postman/Newman collections: 69 + 27 assertions (writes docs/evidence/)
npm start &  bash scripts/curl-contract.sh   # curl evidence
```

## Layout
| Path | Purpose |
|---|---|
| `openapi/openapi.json` (+ `.yaml`) | The contract. Edit/regenerate with `npm run spec:build` (`scripts/build-spec.js`) |
| `src/validation.js` | Builds Ajv validators from the contract: path/query params -> 400, body -> 422 |
| `src/problem.js`, `src/app.js` | RFC 7807 responses, rate limiter, Swagger UI mount, error handler |
| `src/store.js` | In-memory repository – replace with your database/ORM calls |
| `src/priority.js` | Priority ranking (most open reports first) |
| `src/auth.js` | Minimal session check (401). Lab 5 replaces the session store with real login/logout |
| `tests/`, `postman/`, `scripts/` | Contract tests, Newman collections, curl + screenshot scripts |

## Adapting to the real database / frontend
Change the field names in `scripts/build-spec.js` (or edit `openapi.json` directly), run `npm run spec:build`, and update
`src/store.js`. Validation, docs and tests follow the contract automatically.
