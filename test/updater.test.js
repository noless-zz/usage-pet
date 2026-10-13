const test = require('node:test');
const assert = require('node:assert');
const { isNewer, pickUpdate, swapScript } = require('../src/updater');

test('version comparison', () => {
  assert.ok(isNewer('v0.2.0', '0.1.0'));
  assert.ok(isNewer('0.1.10', '0.1.9'));
  assert.ok(!isNewer('0.1.0', '0.1.0'));
  assert.ok(!isNewer('v0.0.9', '0.1.0'));
  assert.ok(!isNewer('garbage', '0.1.0'));
});

const release = {
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/x/y/releases/tag/v0.2.0',
  body: 'notes',
  assets: [
    { name: 'Usage Pet Setup 0.2.0.exe', browser_download_url: 'https://dl/setup', size: 1 },
    { name: 'UsagePet-portable-0.2.0.exe', browser_download_url: 'https://dl/portable', size: 2 },
  ],
};

test('picks the right asset per build kind', () => {
  assert.strictEqual(pickUpdate(release, '0.1.0', 'portable').asset.url, 'https://dl/portable');
  assert.strictEqual(pickUpdate(release, '0.1.0', 'installer').asset.url, 'https://dl/setup');
  assert.strictEqual(pickUpdate(release, '0.1.0', 'portable').version, '0.2.0');
});

test('nothing to offer when current, draft or prerelease', () => {
  assert.strictEqual(pickUpdate(release, '0.2.0', 'portable'), null);
  assert.strictEqual(pickUpdate({ ...release, draft: true }, '0.1.0', 'portable'), null);
  assert.strictEqual(pickUpdate({ ...release, prerelease: true }, '0.1.0', 'portable'), null);
});

test('swap script waits for the pid, moves, relaunches', () => {
  const s = swapScript('C:\\a\\x.exe.new', 'C:\\a\\x.exe', 1234);
  assert.ok(s.includes('PID eq 1234'));
  assert.ok(s.includes('move /y "C:\\a\\x.exe.new" "C:\\a\\x.exe"'));
  assert.ok(s.includes('start "" "C:\\a\\x.exe"'));
});
