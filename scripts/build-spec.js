// Writes openapi/openapi.json. The JSON file is the contract (source of truth);
// this script only keeps the repetitive parts (error responses, rate-limit headers) consistent.
const fs = require('fs');
const path = require('path');

const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const hdr = (n) => ({ $ref: `#/components/headers/${n}` });
const rl = {
  'RateLimit-Policy': hdr('RateLimit-Policy'),
  'RateLimit-Limit': hdr('RateLimit-Limit'),
  'RateLimit-Remaining': hdr('RateLimit-Remaining'),
  'RateLimit-Reset': hdr('RateLimit-Reset'),
};
const problemRef = (name) => ({ $ref: `#/components/responses/${name}` });
const problemBody = { 'application/problem+json': { schema: ref('Problem') } };

const TEXT_PATTERN = "^[A-Za-z0-9][A-Za-z0-9 .,'&()/#-]*$";

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Campus Problem Reporting System (CPRS) API',
    version: '1.0.0',
    summary: 'Contract-first REST API for reporting and prioritising campus problems.',
    description:
      'Students report campus problems (broken sockets, faulty taps, security issues, ...). ' +
      'Open reports describing the same problem in the same place are grouped, and the groups ' +
      'are ranked by number of reports: the issue with the most reports gets the highest priority.\n\n' +
      'All errors use RFC 7807 Problem Details (`application/problem+json`). ' +
      'Status code policy: **400** = malformed request (bad JSON, wrong content type, unknown or invalid ' +
      'query/path parameter); **422** = well-formed JSON that violates the schema (missing field, wrong type, ' +
      'pattern, length, unknown property); **401** = missing or invalid session; **404** = unknown resource; ' +
      '**429** = rate limit exceeded; **500** = unexpected server fault.',
    license: { name: 'Coursework use (ICT461, Mulungushi University)' },
  },
  servers: [
    { url: '/', description: 'Same origin as this documentation portal' },
    { url: 'http://localhost:3000', description: 'Local development' },
  ],
  tags: [
    { name: 'Reports', description: 'Create, read and update problem reports' },
    { name: 'Priorities', description: 'Priority queue ranked by number of open reports' },
  ],
  paths: {
    '/api/v1/reports': {
      get: {
        tags: ['Reports'],
        operationId: 'listReports',
        summary: 'List reports (paginated, filterable)',
        security: [],
        parameters: [
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/StatusFilter' },
          { $ref: '#/components/parameters/CategoryFilter' },
        ],
        responses: {
          200: {
            description: 'A page of reports, newest first',
            headers: rl,
            content: { 'application/json': { schema: ref('ReportList') } },
          },
          400: problemRef('BadRequest'),
          429: problemRef('TooManyRequests'),
          500: problemRef('InternalError'),
        },
      },
      post: {
        tags: ['Reports'],
        operationId: 'createReport',
        summary: 'Submit a new problem report',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('ReportCreate') } },
        },
        responses: {
          201: {
            description: 'Report created',
            headers: {
              ...rl,
              Location: {
                description: 'URL of the newly created report',
                schema: { type: 'string' },
              },
            },
            content: { 'application/json': { schema: ref('Report') } },
          },
          400: problemRef('BadRequest'),
          422: problemRef('UnprocessableEntity'),
          429: problemRef('TooManyRequests'),
          500: problemRef('InternalError'),
        },
      },
    },
    '/api/v1/reports/{reportId}': {
      get: {
        tags: ['Reports'],
        operationId: 'getReport',
        summary: 'Get one report',
        security: [],
        parameters: [{ $ref: '#/components/parameters/ReportId' }],
        responses: {
          200: {
            description: 'The report',
            headers: rl,
            content: { 'application/json': { schema: ref('Report') } },
          },
          400: problemRef('BadRequest'),
          404: problemRef('NotFound'),
          429: problemRef('TooManyRequests'),
          500: problemRef('InternalError'),
        },
      },
    },
    '/api/v1/reports/{reportId}/status': {
      patch: {
        tags: ['Reports'],
        operationId: 'updateReportStatus',
        summary: 'Change the status of a report (staff only)',
        description:
          'Requires a valid session cookie (`cprs_sid`). Session issuance is implemented in Lab 5 (Part B); ' +
          'until then a development session can be supplied through the DEV_STAFF_SESSION environment variable.',
        security: [{ cookieAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ReportId' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('StatusUpdate') } },
        },
        responses: {
          200: {
            description: 'Report with its new status',
            headers: rl,
            content: { 'application/json': { schema: ref('Report') } },
          },
          400: problemRef('BadRequest'),
          401: problemRef('Unauthorized'),
          404: problemRef('NotFound'),
          422: problemRef('UnprocessableEntity'),
          429: problemRef('TooManyRequests'),
          500: problemRef('InternalError'),
        },
      },
    },
    '/api/v1/priorities': {
      get: {
        tags: ['Priorities'],
        operationId: 'listPriorities',
        summary: 'Open issues ranked by number of reports (highest first)',
        description:
          'Open (not yet resolved) reports are grouped by category + building + location (case-insensitive). ' +
          'Groups are sorted by `reportCount` descending; ties are broken by the earliest report (oldest first).',
        security: [],
        parameters: [{ $ref: '#/components/parameters/Limit' }],
        responses: {
          200: {
            description: 'Ranked list of issues',
            headers: rl,
            content: { 'application/json': { schema: ref('PriorityList') } },
          },
          400: problemRef('BadRequest'),
          429: problemRef('TooManyRequests'),
          500: problemRef('InternalError'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'cprs_sid',
        description: 'Server-side session identifier cookie (issued by the login endpoint in Lab 5).',
      },
    },
    parameters: {
      ReportId: {
        name: 'reportId',
        in: 'path',
        required: true,
        description: 'Report identifier (UUID)',
        schema: { type: 'string', format: 'uuid' },
      },
      Page: {
        name: 'page',
        in: 'query',
        required: false,
        description: '1-based page number',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Items per page (or maximum number of ranked issues)',
        schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      StatusFilter: {
        name: 'status',
        in: 'query',
        required: false,
        schema: ref('ReportStatus'),
      },
      CategoryFilter: {
        name: 'category',
        in: 'query',
        required: false,
        schema: ref('Category'),
      },
    },
    headers: {
      'RateLimit-Policy': {
        description: 'Quota policy, e.g. "100;w=900" = 100 requests per 900-second window',
        schema: { type: 'string' },
      },
      'RateLimit-Limit': {
        description: 'Maximum number of requests allowed in the current window',
        schema: { type: 'integer', minimum: 1 },
      },
      'RateLimit-Remaining': {
        description: 'Requests left in the current window',
        schema: { type: 'integer', minimum: 0 },
      },
      'RateLimit-Reset': {
        description: 'Seconds until the window resets',
        schema: { type: 'integer', minimum: 0 },
      },
      'Retry-After': {
        description: 'Seconds to wait before retrying (sent with 429)',
        schema: { type: 'integer', minimum: 0 },
      },
    },
    responses: {
      BadRequest: {
        description: 'Malformed request (invalid JSON, wrong Content-Type, unknown/invalid query or path parameter)',
        headers: rl,
        content: problemBody,
      },
      Unauthorized: {
        description: 'Missing, invalid or expired session',
        headers: rl,
        content: problemBody,
      },
      NotFound: {
        description: 'Resource not found',
        headers: rl,
        content: problemBody,
      },
      UnprocessableEntity: {
        description: 'Well-formed JSON that violates the request schema',
        headers: rl,
        content: problemBody,
      },
      TooManyRequests: {
        description: 'Rate limit exceeded',
        headers: { ...rl, 'Retry-After': hdr('Retry-After') },
        content: problemBody,
      },
      InternalError: {
        description: 'Unexpected server error',
        headers: rl,
        content: problemBody,
      },
    },
    schemas: {
      Category: {
        type: 'string',
        enum: ['electrical', 'plumbing', 'security', 'furniture', 'lighting', 'ict', 'sanitation', 'other'],
        description:
          'Problem category, e.g. electrical = broken sockets, plumbing = faulty taps, security = broken locks or unsafe areas',
      },
      ReportStatus: {
        type: 'string',
        enum: ['submitted', 'in_review', 'assigned', 'in_progress', 'resolved'],
      },
      PriorityLevel: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Derived from reportCount: 1-2 low, 3-4 medium, 5-9 high, 10 or more critical',
      },
      ReportCreate: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'title', 'description', 'building', 'location'],
        properties: {
          category: ref('Category'),
          title: {
            type: 'string',
            minLength: 5,
            maxLength: 100,
            pattern: '^\\S(.*\\S)?$',
            description: 'Short summary, no leading or trailing whitespace',
            examples: ['Broken socket near the window'],
          },
          description: {
            type: 'string',
            minLength: 10,
            maxLength: 1000,
            examples: ['The double socket next to the window has no power and the casing is cracked.'],
          },
          building: {
            type: 'string',
            minLength: 2,
            maxLength: 60,
            pattern: TEXT_PATTERN,
            examples: ['Block A'],
          },
          location: {
            type: 'string',
            minLength: 1,
            maxLength: 60,
            pattern: TEXT_PATTERN,
            description: 'Room or area inside the building',
            examples: ['Room 12'],
          },
        },
      },
      Report: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'category', 'title', 'description', 'building', 'location', 'status', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          category: ref('Category'),
          title: { type: 'string', minLength: 5, maxLength: 100 },
          description: { type: 'string', minLength: 10, maxLength: 1000 },
          building: { type: 'string', minLength: 2, maxLength: 60 },
          location: { type: 'string', minLength: 1, maxLength: 60 },
          status: ref('ReportStatus'),
          statusNote: { type: 'string', minLength: 1, maxLength: 500 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      StatusUpdate: {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: {
          status: ref('ReportStatus'),
          note: { type: 'string', minLength: 1, maxLength: 500, description: 'Optional staff note' },
        },
      },
      Pagination: {
        type: 'object',
        additionalProperties: false,
        required: ['page', 'limit', 'total', 'totalPages'],
        properties: {
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
          total: { type: 'integer', minimum: 0 },
          totalPages: { type: 'integer', minimum: 0 },
        },
      },
      ReportList: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination'],
        properties: {
          data: { type: 'array', items: ref('Report') },
          pagination: ref('Pagination'),
        },
      },
      PriorityItem: {
        type: 'object',
        additionalProperties: false,
        required: ['rank', 'category', 'building', 'location', 'reportCount', 'priorityLevel', 'firstReportedAt', 'latestReportedAt'],
        properties: {
          rank: { type: 'integer', minimum: 1, description: '1 = highest priority' },
          category: ref('Category'),
          building: { type: 'string', minLength: 2, maxLength: 60 },
          location: { type: 'string', minLength: 1, maxLength: 60 },
          reportCount: { type: 'integer', minimum: 1, description: 'Number of open reports for this issue' },
          priorityLevel: ref('PriorityLevel'),
          firstReportedAt: { type: 'string', format: 'date-time' },
          latestReportedAt: { type: 'string', format: 'date-time' },
        },
      },
      PriorityList: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'generatedAt'],
        properties: {
          data: { type: 'array', items: ref('PriorityItem') },
          generatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ValidationError: {
        type: 'object',
        additionalProperties: false,
        required: ['in', 'field', 'message'],
        properties: {
          in: { type: 'string', enum: ['body', 'query', 'path'] },
          field: { type: 'string', description: 'JSON Pointer for body fields; parameter name for query/path' },
          message: { type: 'string' },
          keyword: { type: 'string', description: 'JSON Schema keyword that failed, e.g. minLength' },
        },
      },
      Problem: {
        type: 'object',
        description: 'RFC 7807 Problem Details object',
        additionalProperties: false,
        required: ['type', 'title', 'status'],
        properties: {
          type: { type: 'string', format: 'uri', description: 'URI identifying the problem type' },
          title: { type: 'string' },
          status: { type: 'integer', minimum: 400, maximum: 599 },
          detail: { type: 'string' },
          instance: { type: 'string', description: 'The request path that produced the problem' },
          errors: { type: 'array', items: ref('ValidationError') },
        },
      },
    },
  },
};

fs.writeFileSync(path.join(__dirname, '..', 'openapi', 'openapi.json'), JSON.stringify(spec, null, 2) + '\n');
console.log('openapi/openapi.json written');
