// Demo data so /api/v1/priorities has something to rank. Enabled with SEED_DEMO_DATA=true.
const DAY = 24 * 60 * 60 * 1000;

function seed(store) {
  const now = Date.now();
  const add = (n, daysAgoStart, data) => {
    for (let i = 0; i < n; i++) store.create(data, new Date(now - (daysAgoStart - i * 0.3) * DAY));
  };
  add(7, 6, { category: 'electrical', title: 'Broken socket near the window', description: 'The socket has no power and the cover is cracked.', building: 'Block A', location: 'Room 12' });
  add(4, 5, { category: 'plumbing', title: 'Tap keeps dripping all day', description: 'The tap in the washroom will not close fully.', building: 'Library', location: 'Ground floor washroom' });
  add(2, 3, { category: 'security', title: 'Door lock is broken', description: 'The hostel entrance door does not lock at night.', building: 'Hostel C', location: 'Main entrance' });
  add(1, 1, { category: 'lighting', title: 'Corridor light not working', description: 'Light has been off for two days.', building: 'Block B', location: 'First floor corridor' });
}

module.exports = { seed };
