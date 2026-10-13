const test = require('node:test');
const assert = require('node:assert');
const U = require('../src/usage');

test('keyed bucket shape', () => {
  const b = U.normalizeApiUsage({
    seven_day_fable: { utilization: 55.2, resets_at: '2026-08-07T03:00:00Z' },
    five_hour: { utilization: 37.5, resets_at: '2026-08-06T12:00:00Z' },
    seven_day: { utilization: 82, resets_at: '2026-08-07T03:00:00Z' },
    seven_day_opus: null,
    extra_usage: { is_enabled: true, utilization: 12 },
    some_scalar: 5,
  });
  assert.deepStrictEqual(
    b.map((x) => x.key),
    ['five_hour', 'seven_day', 'seven_day_fable', 'extra_usage'],
  );
  assert.strictEqual(b[0].label, 'Session (5h)');
  assert.strictEqual(b[2].label, 'Weekly · Fable');
  assert.strictEqual(U.headlinePercent(b), 82); // extra usage ignored
});

test('limits array shape', () => {
  const b = U.normalizeApiUsage({
    limits: [
      { kind: 'session', percent: 24, resets_at: '2026-08-06T10:29:59Z' },
      { kind: 'weekly_all', percent: 58, resets_at: '2026-08-07T01:59:59Z' },
      { kind: 'weekly_scoped', percent: 62, scope: { model: { display_name: 'Fable' } } },
    ],
  });
  assert.deepStrictEqual(
    b.map((x) => [x.key, x.percent]),
    [
      ['five_hour', 24],
      ['seven_day', 58],
      ['seven_day_fable', 62],
    ],
  );
});

test('disabled extra usage is hidden', () => {
  const b = U.normalizeApiUsage({ five_hour: { utilization: 3 }, extra_usage: { is_enabled: false, utilization: 0 } });
  assert.deepStrictEqual(b.map((x) => x.key), ['five_hour']);
});

test('page text fallback', () => {
  const text = `Plan usage limits
Current session
Resets in 2 hr 14 min
43% used
Weekly limits
All models
Resets Thu 11:00 AM
18% used
Fable only
Resets Thu 11:00 AM
71% used
Learn more about usage limits`;
  const b = U.normalizePageText(text);
  assert.deepStrictEqual(
    b.map((x) => [x.key, x.percent, x.resetText]),
    [
      ['five_hour', 43, '2 hr 14 min'],
      ['seven_day', 18, 'Thu 11:00 AM'],
      ['page_fable_only', 71, 'Thu 11:00 AM'],
    ],
  );
});

test('rollover after reset time', () => {
  const now = Date.parse('2026-08-06T13:00:00Z');
  const b = U.applyRollover([{ key: 'five_hour', percent: 90, resetsAt: '2026-08-06T12:00:00Z' }], now);
  assert.strictEqual(b[0].percent, 0);
});

test('moods', () => {
  assert.strictEqual(U.moodFor(10), 'happy');
  assert.strictEqual(U.moodFor(50), 'ok');
  assert.strictEqual(U.moodFor(80), 'tired');
  assert.strictEqual(U.moodFor(93), 'exhausted');
  assert.strictEqual(U.moodFor(100), 'asleep');
  assert.strictEqual(U.moodFor(null), 'confused');
  assert.strictEqual(U.moodFor(10, { loggedIn: false }), 'login');
});

test('reset formatting', () => {
  const now = Date.parse('2026-08-06T10:00:00Z');
  assert.strictEqual(U.formatReset({ resetsAt: '2026-08-06T10:45:00Z' }, now), 'resets in 45 min');
  assert.strictEqual(U.formatReset({ resetsAt: '2026-08-06T12:30:00Z' }, now), 'resets in 2 h 30 min');
  assert.strictEqual(U.formatReset({ resetText: 'Thu 11:00 AM' }, now), 'resets Thu 11:00 AM');
});
