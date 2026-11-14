// Contract-driven request validation: every schema comes from openapi/openapi.json (OpenAPI 3.1 = JSON Schema 2020-12).
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { spec } = require('./spec');
const { HttpProblem } = require('./problem');

const ID_BASE = 'https://cprs.example.org/schemas/';

// Rewrite "#/components/schemas/X" references to absolute ids so every component schema can be registered in Ajv.
function rewriteRefs(node) {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith('#/components/schemas/')) {
        out[k] = ID_BASE + v.split('/').pop();
      } else {
        out[k] = rewriteRefs(v);
      }
    }
    return out;
  }
  return node;
}

function makeAjv(coerce) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, coerceTypes: coerce, useDefaults: false });
  addFormats(ajv);
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    ajv.addSchema({ $id: ID_BASE + name, ...rewriteRefs(schema) });
  }
  return ajv;
}

const ajvStrict = makeAjv(false); // request bodies: no type coercion
const ajvCoerce = makeAjv(true); // query/path strings -> numbers

function resolveRef(obj) {
  if (obj && obj.$ref) {
    return obj.$ref.replace('#/', '').split('/').reduce((o, k) => o[k], spec);
  }
  return obj;
}

function findOperation(operationId) {
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (op.operationId === operationId) return { path: p, method, op, item };
    }
  }
  throw new Error(`Unknown operationId ${operationId}`);
}

function paramSchema(params, where) {
  const props = {};
  const required = [];
  for (const raw of params) {
    const p = resolveRef(raw);
    if (p.in !== where) continue;
    props[p.name] = rewriteRefs(p.schema);
    if (p.required) required.push(p.name);
  }
  return { type: 'object', properties: props, required, additionalProperties: false };
}

function describe(err, where) {
  const base = where === 'body' ? err.instancePath : err.instancePath.replace(/^\//, '');
  let field = base || (where === 'body' ? '/' : '');
  let message = err.message;
  if (err.keyword === 'required') {
    const m = err.params.missingProperty;
    field = where === 'body' ? `${base}/${m}` : m;
    message = `is required`;
  } else if (err.keyword === 'additionalProperties') {
    const m = err.params.additionalProperty;
    field = where === 'body' ? `${base}/${m}` : m;
    message = where === 'body' ? 'is not allowed (unknown property)' : 'is not a supported query parameter';
  } else if (err.keyword === 'enum') {
    message = `must be one of: ${err.params.allowedValues.join(', ')}`;
  } else {
    message = `${message}`;
  }
  return { in: where, field, message, keyword: err.keyword };
}

function validator(operationId) {
  const { op, item } = findOperation(operationId);
  const params = [...(item.parameters || []), ...(op.parameters || [])];

  const pathSchema = paramSchema(params, 'path');
  const querySchema = paramSchema(params, 'query');
  const vPath = ajvCoerce.compile(pathSchema);
  const vQuery = ajvCoerce.compile(querySchema);

  const bodySchemaRaw = op.requestBody?.content?.['application/json']?.schema;
  const vBody = bodySchemaRaw ? ajvStrict.compile(rewriteRefs(bodySchemaRaw)) : null;

  return function validate(req, res, next) {
    // 1. path parameters -> 400
    if (!vPath(req.params)) {
      return next(new HttpProblem(400, 'One or more path parameters are invalid.', { errors: vPath.errors.map((e) => describe(e, 'path')) }));
    }
    // 2. query parameters (unknown parameters rejected) -> 400
    const q = { ...req.query };
    if (!vQuery(q)) {
      return next(new HttpProblem(400, 'One or more query parameters are invalid or not supported.', { errors: vQuery.errors.map((e) => describe(e, 'query')) }));
    }
    req.validQuery = q; // coerced copy (strings -> numbers)

    // 3. request body
    if (vBody) {
      if (!req.is('application/json')) {
        return next(new HttpProblem(400, 'Content-Type must be application/json.'));
      }
      if (!vBody(req.body)) {
        return next(new HttpProblem(422, 'The request body failed schema validation.', { errors: vBody.errors.map((e) => describe(e, 'body')) }));
      }
    }
    next();
  };
}

module.exports = { validator, ajvStrict, rewriteRefs, resolveRef, findOperation };
