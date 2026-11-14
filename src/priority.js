// Priority ranking: the issue with the most open reports gets the highest priority.
const LEVELS = [
  { min: 10, level: 'critical' },
  { min: 5, level: 'high' },
  { min: 3, level: 'medium' },
  { min: 1, level: 'low' },
];

const levelFor = (count) => LEVELS.find((l) => count >= l.min).level;
const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function rankIssues(reports, limit = 10) {
  const groups = new Map();
  for (const r of reports) {
    if (r.status === 'resolved') continue;
    const key = [r.category, norm(r.building), norm(r.location)].join('|');
    const g = groups.get(key) || {
      category: r.category,
      building: r.building,
      location: r.location,
      reportCount: 0,
      firstReportedAt: r.createdAt,
      latestReportedAt: r.createdAt,
    };
    g.reportCount += 1;
    if (r.createdAt < g.firstReportedAt) g.firstReportedAt = r.createdAt;
    if (r.createdAt > g.latestReportedAt) g.latestReportedAt = r.createdAt;
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.reportCount - a.reportCount || a.firstReportedAt.localeCompare(b.firstReportedAt))
    .slice(0, limit)
    .map((g, i) => ({ rank: i + 1, ...g, priorityLevel: levelFor(g.reportCount) }));
}

module.exports = { rankIssues, levelFor };
