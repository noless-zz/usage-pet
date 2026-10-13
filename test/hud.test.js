const test = require('node:test');
const assert = require('node:assert');
const { formatRemaining, hudBuckets } = require('../src/usage');

const now = Date.parse('2026-01-01T00:00:00Z');
const at = (ms) => new Date(now + ms).toISOString();
const MIN = 60000;

test('formatRemaining is compact', () => {
  assert.strictEqual(formatRemaining({ resetsAt: at(45 * MIN) }, now), '45m');
  assert.strictEqual(formatRemaining({ resetsAt: at(134 * MIN) }, now), '2h 14m');
  assert.strictEqual(formatRemaining({ resetsAt: at((3 * 24 * 60 + 4 * 60) * MIN) }, now), '3d 4h');
  assert.strictEqual(formatRemaining({ resetsAt: at(-MIN) }, now), 'now');
  assert.strictEqual(formatRemaining({ resetText: 'Fri 6:00 PM' }, now), 'Fri 6:00 PM');
  assert.strictEqual(formatRemaining({}, now), '');
});

test('hudBuckets prefers session + weekly, never extra usage', () => {
  const b = [
    { key: 'seven_day_x', percent: 90 },
    { key: 'extra_usage', percent: 99 },
    { key: 'seven_day', percent: 10 },
    { key: 'five_hour', percent: 5 },
  ];
  assert.deepStrictEqual(hudBuckets(b).map((x) => x.key), ['five_hour', 'seven_day']);
  assert.deepStrictEqual(hudBuckets([{ key: 'a', percent: 1 }, { key: 'b', percent: 9 }, { key: 'c', percent: 5 }]).map((x) => x.key), ['b', 'c']);
});
