// Update helpers (pure, unit-tested). main.js does the network / file / process work.
// Releases live on GitHub: tag "vX.Y.Z" with assets
//   UsagePet-portable-X.Y.Z.exe   (portable build)
//   Usage Pet Setup X.Y.Z.exe     (installer build)
const REPO = 'noless-zz/usage-pet';

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// true when `latest` is strictly newer than `current`
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Picks what to offer from a GitHub "latest release" JSON, or null if there is nothing newer.
// kind: 'portable' | 'installer'
function pickUpdate(release, currentVersion, kind) {
  if (!release || release.draft || release.prerelease) return null;
  if (!isNewer(release.tag_name, currentVersion)) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find((a) => (kind === 'portable' ? /portable.*\.exe$/i : /setup.*\.exe$/i).test(a.name || ''));
  return {
    version: String(release.tag_name).replace(/^v/, ''),
    notes: release.body || '',
    pageUrl: release.html_url,
    asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null,
  };
}

// Batch script that waits for this process to exit, swaps the portable exe, and relaunches it.
function swapScript(newExe, targetExe, pid) {
  const q = (p) => '"' + p.replace(/"/g, '') + '"';
  return [
    '@echo off',
    'set tries=0',
    ':wait',
    `tasklist /FI "PID eq ${pid}" 2>nul | find "${pid}" >nul`,
    'if not errorlevel 1 (',
    '  set /a tries+=1',
    '  if %tries% GTR 30 goto fail',
    '  timeout /t 1 /nobreak >nul',
    '  goto wait',
    ')',
    'set tries=0',
    ':swap',
    `move /y ${q(newExe)} ${q(targetExe)} >nul 2>nul`,
    'if errorlevel 1 (',
    '  set /a tries+=1',
    '  if %tries% GTR 30 goto fail',
    '  timeout /t 1 /nobreak >nul',
    '  goto swap',
    ')',
    `start "" ${q(targetExe)}`,
    'goto end',
    ':fail',
    `start "" ${q(targetExe)}`,
    ':end',
    '(goto) 2>nul & del "%~f0"',
    '',
  ].join('\r\n');
}

module.exports = { REPO, parseVersion, isNewer, pickUpdate, swapScript };
