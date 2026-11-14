const express = require('express');
const { validator } = require('../validation');
const { requireSession } = require('../auth');
const { HttpProblem } = require('../problem');
const { rankIssues } = require('../priority');

module.exports = function reportRoutes(store) {
  const router = express.Router();

  router.get('/reports', validator('listReports'), (req, res) => {
    const { page = 1, limit = 10, status, category } = req.validQuery;
    let items = store.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (status) items = items.filter((r) => r.status === status);
    if (category) items = items.filter((r) => r.category === category);
    const total = items.length;
    res.json({
      data: items.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  router.post('/reports', validator('createReport'), (req, res) => {
    const report = store.create(req.body);
    res.status(201).location(`/api/v1/reports/${report.id}`).json(report);
  });

  router.get('/reports/:reportId', validator('getReport'), (req, res, next) => {
    const report = store.get(req.params.reportId);
    if (!report) return next(new HttpProblem(404, `Report ${req.params.reportId} was not found.`));
    res.json(report);
  });

  // Authentication runs first (401), then parameter/body validation (400/422), then business logic (404).
  router.patch('/reports/:reportId/status', requireSession, validator('updateReportStatus'), (req, res, next) => {
    const report = store.updateStatus(req.params.reportId, req.body.status, req.body.note);
    if (!report) return next(new HttpProblem(404, `Report ${req.params.reportId} was not found.`));
    res.json(report);
  });

  router.get('/priorities', validator('listPriorities'), (req, res) => {
    const { limit = 10 } = req.validQuery;
    res.json({ data: rankIssues(store.all(), limit), generatedAt: new Date().toISOString() });
  });

  return router;
};
