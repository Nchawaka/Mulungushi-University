// In-memory repository. Swap these functions for ORM/database calls (DB & Auth sub-team) without touching routes.
const crypto = require('crypto');

function createStore() {
  const reports = new Map();
  return {
    create(data, createdAt = new Date()) {
      const now = createdAt.toISOString();
      const report = {
        id: crypto.randomUUID(),
        category: data.category,
        title: data.title,
        description: data.description,
        building: data.building,
        location: data.location,
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      };
      reports.set(report.id, report);
      return report;
    },
    get: (id) => reports.get(id) || null,
    all: () => [...reports.values()],
    updateStatus(id, status, note) {
      const r = reports.get(id);
      if (!r) return null;
      r.status = status;
      if (note !== undefined) r.statusNote = note;
      r.updatedAt = new Date().toISOString();
      return r;
    },
  };
}

module.exports = { createStore };
