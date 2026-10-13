// Pure helpers for turning Claude's usage data into a simple list of meters.
// No Electron imports here, so this file can be unit-tested with plain Node.

const KNOWN_LABELS = {
  five_hour: 'Session (5h)',
  seven_day: 'Weekly · all models',
  seven_day_opus: 'Weekly · Opus',
  seven_day_sonnet: 'Weekly · Sonnet',
  seven_day_fable: 'Weekly · Fable',
  seven_day_oauth_apps: 'Weekly · apps',
  extra_usage: 'Extra usage',
};

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, v));
}

function labelFor(key) {
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key];
  const m = /^seven_day_(.+)$/.exec(key);
  if (m) return 'Weekly · ' + titleCase(m[1]);
  return titleCase(key);
}

function titleCase(s) {
  return String(s)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortBuckets(buckets) {
  const rank = (k) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : k === 'extra_usage' ? 9 : 5);
  return buckets.sort((a, b) => rank(a.key) - rank(b.key));
}

// Normalise the JSON returned by claude.ai's usage endpoint.
// Handles both shapes seen in the wild:
//   { five_hour: {utilization, resets_at}, seven_day: {...}, seven_day_fable: {...}, ... }
//   { limits: [ {kind, group, percent, resets_at, scope:{model:{display_name}}} ] }
function normalizeApiUsage(json) {
  if (!json || typeof json !== 'object') return [];
  const byKey = new Map();

  for (const [key, val] of Object.entries(json)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    if (key === 'extra_usage') {
      if (val.is_enabled && clampPct(val.utilization) !== null) {
        byKey.set(key, { key, label: labelFor(key), percent: clampPct(val.utilization), resetsAt: val.resets_at || null });
      }
      continue;
    }
    const pct = clampPct(val.utilization);
    if (pct === null) continue;
    byKey.set(key, { key, label: labelFor(key), percent: pct, resetsAt: val.resets_at || null });
  }

  if (Array.isArray(json.limits)) {
    for (const lim of json.limits) {
      if (!lim || typeof lim !== 'object') continue;
      const pct = clampPct(lim.percent);
      if (pct === null) continue;
      let key;
      let label;
      const model = lim.scope && lim.scope.model && lim.scope.model.display_name;
      if (lim.kind === 'session') key = 'five_hour';
      else if (lim.kind === 'weekly_all') key = 'seven_day';
      else if (model) {
        key = 'seven_day_' + String(model).toLowerCase().replace(/\W+/g, '_');
        label = 'Weekly · ' + model;
      } else continue;
      if (!byKey.has(key)) {
        byKey.set(key, { key, label: label || labelFor(key), percent: pct, resetsAt: lim.resets_at || null });
      }
    }
  }

  return sortBuckets([...byKey.values()]);
}

// Fallback: parse the visible text of claude.ai/settings/usage.
// Looks for "NN% used" and takes the nearest heading-like line above it as the label.
function normalizePageText(text) {
  if (!text) return [];
  const lines = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /(\d{1,3}(?:\.\d+)?)\s*%\s*used/i.exec(lines[i]);
    if (!m) continue;
    let label = null;
    let resetText = null;
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const l = lines[j];
      if (/^resets?\b/i.test(l)) {
        if (!resetText) resetText = l.replace(/^resets?\s*(in\s*)?/i, '');
        continue;
      }
      if (/%/.test(l)) break;
      label = l;
      break;
    }
    if (!resetText) {
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j++) {
        if (/^resets?\b/i.test(lines[j])) {
          resetText = lines[j].replace(/^resets?\s*(in\s*)?/i, '');
          break;
        }
      }
    }
    label = label || 'Usage';
    let key;
    if (/current session/i.test(label)) key = 'five_hour';
    else if (/all models/i.test(label)) key = 'seven_day';
    else if (/extra/i.test(label)) key = 'extra_usage';
    else key = 'page_' + label.toLowerCase().replace(/\W+/g, '_');
    if (out.some((b) => b.key === key)) continue;
    out.push({
      key,
      label: key === 'five_hour' || key === 'seven_day' ? labelFor(key) : label,
      percent: clampPct(m[1]),
      resetsAt: null,
      resetText,
    });
  }
  return sortBuckets(out);
}

// If a reset time has already passed, that window has rolled over: treat it as 0%.
function applyRollover(buckets, now = Date.now()) {
  return buckets.map((b) => {
    if (b.resetsAt && Date.parse(b.resetsAt) <= now) return { ...b, percent: 0, rolledOver: true };
    return b;
  });
}

// The pet's mood is driven by the most-used limit, but per-model and extra usage
// only count when they are actually close to blocking you.
function headlinePercent(buckets) {
  if (!buckets || !buckets.length) return null;
  let max = 0;
  for (const b of buckets) {
    if (b.key === 'extra_usage') continue;
    if (b.percent > max) max = b.percent;
  }
  return max;
}

function moodFor(percent, { loggedIn = true, error = null } = {}) {
  if (!loggedIn) return 'login';
  if (error || percent === null || percent === undefined) return 'confused';
  if (percent >= 100) return 'asleep';
  if (percent >= 90) return 'exhausted';
  if (percent >= 75) return 'tired';
  if (percent >= 40) return 'ok';
  return 'happy';
}

function formatReset(bucket, now = Date.now()) {
  if (bucket.resetsAt) {
    const ms = Date.parse(bucket.resetsAt) - now;
    if (!Number.isFinite(ms)) return '';
    if (ms <= 0) return 'reset';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `resets in ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `resets in ${hrs} h ${mins % 60} min`;
    const d = new Date(Date.parse(bucket.resetsAt));
    return 'resets ' + d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return bucket.resetText ? `resets ${bucket.resetText}` : '';
}

// Compact countdown to the next reset: "45m", "2h 14m", "3d 4h". '' when unknown.
function formatRemaining(bucket, now = Date.now()) {
  if (bucket.resetsAt) {
    const ms = Date.parse(bucket.resetsAt) - now;
    if (!Number.isFinite(ms)) return '';
    if (ms <= 0) return 'now';
    const mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
  }
  return bucket.resetText ? String(bucket.resetText) : '';
}

// The always-visible bars under the pet: session + weekly, or the two busiest limits.
function hudBuckets(buckets) {
  const real = (buckets || []).filter((b) => b.key !== 'extra_usage');
  const pick = ['five_hour', 'seven_day'].map((k) => real.find((b) => b.key === k)).filter(Boolean);
  if (pick.length) return pick;
  return real.slice().sort((a, b) => b.percent - a.percent).slice(0, 2);
}

const api = {
  formatRemaining,
  hudBuckets,
  normalizeApiUsage,
  normalizePageText,
  applyRollover,
  headlinePercent,
  moodFor,
  formatReset,
  labelFor,
};
// Works with require() in the main process and as a plain <script> in the pet page.
if (typeof module === 'object' && module.exports) module.exports = api;
else self.PetUsage = api;
