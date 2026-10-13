// Usage Pet — main process.
// Owns: the pet window, the tray icon, a hidden "fetcher" window that is logged in
// to claude.ai, the visible login window, settings, and limit notifications.
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen,
  shell,
  session,
  Notification,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const usage = require('./usage');
const sprite = require('./sprite');
const { buildCustomPet } = require('./pixelize');

const CLAUDE = 'https://claude.ai';
const PARTITION = 'persist:claude';
const BASE_W = 270;
const BASE_H = 420;

// A plain Chrome user agent: claude.ai and Google sign-in treat it like a normal browser.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' +
  process.versions.chrome +
  ' Safari/537.36';

let petWin = null;
let fetchWin = null;
let loginWin = null;
let tray = null;
let pollTimer = null;
let fetching = false;
let state = { loggedIn: true, buckets: [], error: null, fetchedAt: null, source: null, loading: true };
const notified = new Set(); // "bucketKey:threshold" already announced

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = {
  x: null,
  y: null,
  scale: 1,
  intervalMin: 5,
  notify: true,
  visible: true,
  species: 'sprout', // a sprite.js species id, or 'custom'
  custom: null, // 576 colors made from the user's image
};
let settings = { ...DEFAULTS };
function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    settings = { ...DEFAULTS };
  }
}
function saveSettings() {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('could not save settings', e);
  }
}

// ---------- pet window ----------
function createPetWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.round(BASE_W * settings.scale);
  const h = Math.round(BASE_H * settings.scale);
  let x = settings.x ?? wa.x + wa.width - w - 20;
  let y = settings.y ?? wa.y + wa.height - h;
  // keep it on a visible display
  const onScreen = screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    return x + w / 2 >= b.x && x + w / 2 <= b.x + b.width && y + h / 2 >= b.y && y + h / 2 <= b.y + b.height;
  });
  if (!onScreen) {
    x = wa.x + wa.width - w - 20;
    y = wa.y + wa.height - h;
  }

  petWin = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWin.setAlwaysOnTop(true, 'floating');
  petWin.setVisibleOnAllWorkspaces(true);
  // Transparent parts of the window let clicks fall through to the desktop.
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.loadFile(path.join(__dirname, 'pet.html'));
  petWin.once('ready-to-show', () => {
    if (settings.visible) petWin.showInactive();
    pushState();
  });
  petWin.on('closed', () => (petWin = null));
}

function pushState() {
  if (!petWin || petWin.isDestroyed()) return;
  petWin.webContents.send('usage:update', petState());
}

function petState() {
  return {
    ...state,
    scale: settings.scale,
    species: settings.species,
    custom: settings.species === 'custom' ? settings.custom : null,
  };
}

// ---------- choosing a pet ----------
function setSpecies(id) {
  settings.species = id;
  saveSettings();
  pushState();
  if (tray) tray.setContextMenu(buildMenu());
}

async function pickImagePet() {
  const r = await dialog.showOpenDialog({
    title: 'Choose a picture for your pet',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return;
  let img = nativeImage.createFromPath(r.filePaths[0]);
  if (img.isEmpty()) {
    dialog.showErrorBox('Usage Pet', "I couldn't read that image. Try a PNG or JPG.");
    return;
  }
  const { width, height } = img.getSize();
  const k = Math.min(1, 128 / Math.max(width, height));
  if (k < 1) img = img.resize({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), quality: 'best' });
  const size = img.getSize();
  const bgra = img.toBitmap();
  const rgba = Buffer.alloc(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i] = bgra[i + 2];
    rgba[i + 1] = bgra[i + 1];
    rgba[i + 2] = bgra[i];
    rgba[i + 3] = bgra[i + 3];
  }
  settings.custom = buildCustomPet(rgba, size.width, size.height);
  setSpecies('custom');
}

// ---------- claude.ai session ----------
function claudeSession() {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(CHROME_UA);
  return ses;
}

function ensureFetchWindow() {
  if (fetchWin && !fetchWin.isDestroyed()) return Promise.resolve(fetchWin);
  fetchWin = new BrowserWindow({
    show: false,
    width: 1100,
    height: 800,
    webPreferences: { session: claudeSession(), contextIsolation: true, nodeIntegration: false },
  });
  fetchWin.webContents.setAudioMuted(true);
  fetchWin.on('closed', () => (fetchWin = null));
  return fetchWin
    .loadURL(CLAUDE + '/settings/usage', { userAgent: CHROME_UA })
    .catch(() => {}) // a redirect to /login rejects with ERR_ABORTED; that's fine
    .then(() => waitForSettle(fetchWin))
    .then(() => fetchWin);
}

function waitForSettle(win, ms = 2500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLoginUrl(url) {
  return /\/login|\/logout|accounts\.google|\/magic-link|appleid/i.test(url || '');
}

const API_SCRIPT = `
(async () => {
  try {
    const r = await fetch('/api/organizations', { credentials: 'include', headers: { accept: 'application/json' } });
    if (r.status === 401) return { auth: false };
    if (!r.ok) return { error: 'organizations ' + r.status };
    const orgs = await r.json();
    const list = Array.isArray(orgs) ? orgs.slice() : [];
    const chatty = (o) => (Array.isArray(o.capabilities) && o.capabilities.some((c) => /chat|claude_pro|claude_max|raven/.test(c))) ? 1 : 0;
    list.sort((a, b) => chatty(b) - chatty(a));
    for (const o of list) {
      if (!o || !o.uuid) continue;
      const u = await fetch('/api/organizations/' + o.uuid + '/usage', { credentials: 'include', headers: { accept: 'application/json' } });
      if (u.ok) return { org: o.name || null, data: await u.json() };
    }
    return { error: 'usage endpoint not available' };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
})()`;

const PAGE_TEXT_SCRIPT = `
(async () => {
  for (let i = 0; i < 30; i++) {
    const t = document.body ? document.body.innerText : '';
    if (/%\\s*used/i.test(t)) return t;
    await new Promise((r) => setTimeout(r, 500));
  }
  return document.body ? document.body.innerText : '';
})()`;

async function fetchUsageOnce() {
  const win = await ensureFetchWindow();
  const wc = win.webContents;
  if (isLoginUrl(wc.getURL())) return { loggedIn: false };

  // 1) JSON endpoint the usage page itself uses
  const api = await wc.executeJavaScript(API_SCRIPT, true).catch((e) => ({ error: String(e) }));
  if (api && api.auth === false) return { loggedIn: false };
  if (api && api.data) {
    const buckets = usage.normalizeApiUsage(api.data);
    if (buckets.length) return { loggedIn: true, buckets, source: 'api', org: api.org };
  }

  // 2) Fallback: read the numbers off the Settings → Usage page
  await wc.loadURL(CLAUDE + '/settings/usage', { userAgent: CHROME_UA }).catch(() => {});
  if (isLoginUrl(wc.getURL())) return { loggedIn: false };
  const text = await wc.executeJavaScript(PAGE_TEXT_SCRIPT, true).catch(() => '');
  const buckets = usage.normalizePageText(text);
  if (buckets.length) return { loggedIn: true, buckets, source: 'page' };
  return { loggedIn: true, buckets: [], error: (api && api.error) || 'Could not read usage' };
}

async function refresh() {
  if (fetching) return;
  fetching = true;
  state = { ...state, loading: true };
  pushState();
  try {
    const r = await fetchUsageOnce();
    state = {
      loggedIn: r.loggedIn !== false,
      buckets: r.buckets || [],
      error: r.error || null,
      source: r.source || null,
      fetchedAt: Date.now(),
      loading: false,
    };
    if (r.loggedIn === false) {
      state.buckets = [];
    }
  } catch (e) {
    state = { ...state, error: String(e.message || e), loading: false, fetchedAt: Date.now() };
  } finally {
    fetching = false;
  }
  pushState();
  updateTray();
  maybeNotify();
}

function schedulePolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, Math.max(1, settings.intervalMin) * 60 * 1000);
}

// ---------- login ----------
function openLogin() {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.show();
    loginWin.focus();
    return;
  }
  loginWin = new BrowserWindow({
    width: 480,
    height: 720,
    title: 'Sign in to Claude — Usage Pet',
    autoHideMenuBar: true,
    webPreferences: { session: claudeSession(), contextIsolation: true, nodeIntegration: false },
  });
  loginWin.loadURL(CLAUDE + '/login', { userAgent: CHROME_UA });

  // Open Google / Apple sign-in popups inside the same session.
  loginWin.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      autoHideMenuBar: true,
      webPreferences: { session: claudeSession() },
    },
  }));

  const check = (_e, url) => {
    if (/^https:\/\/claude\.ai\//.test(url) && !isLoginUrl(url)) {
      // Signed in: close and fetch right away.
      setTimeout(() => {
        if (loginWin && !loginWin.isDestroyed()) loginWin.close();
        if (fetchWin && !fetchWin.isDestroyed()) fetchWin.destroy();
        refresh();
      }, 1200);
    }
  };
  loginWin.webContents.on('did-navigate', check);
  loginWin.webContents.on('did-navigate-in-page', check);
  loginWin.on('closed', () => (loginWin = null));
}

async function signOut() {
  await claudeSession().clearStorageData();
  if (fetchWin && !fetchWin.isDestroyed()) fetchWin.destroy();
  state = { loggedIn: false, buckets: [], error: null, fetchedAt: Date.now(), loading: false };
  pushState();
  updateTray();
}

// ---------- notifications ----------
function maybeNotify() {
  if (!settings.notify || !Notification.isSupported()) return;
  for (const b of state.buckets) {
    if (b.key === 'extra_usage') continue;
    for (const t of [80, 95]) {
      const id = `${b.key}:${t}`;
      if (b.percent >= t && !notified.has(id)) {
        notified.add(id);
        new Notification({
          title: t >= 95 ? 'Sprout is almost out of energy' : 'Sprout is getting tired',
          body: `${b.label}: ${Math.round(b.percent)}% used. ${usage.formatReset(b)}`.trim(),
          icon: path.join(__dirname, '..', 'build', 'icon.png'),
        }).show();
      } else if (b.percent < t - 10) {
        notified.delete(id); // window reset: allow announcing again next time
      }
    }
  }
}

// ---------- tray ----------
const MOOD_COLORS = {
  happy: [127, 216, 178],
  ok: [127, 216, 178],
  tired: [233, 196, 92],
  exhausted: [236, 140, 72],
  asleep: [214, 84, 84],
  confused: [160, 160, 175],
  login: [160, 160, 175],
};

// 16x16 dot icon drawn in code (BGRA, as Electron expects for createFromBitmap).
function dotIcon(rgb) {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - 8;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (d <= 6.5) {
        buf[i] = rgb[2];
        buf[i + 1] = rgb[1];
        buf[i + 2] = rgb[0];
        buf[i + 3] = 255;
      } else if (d <= 7.5) {
        buf[i] = 40;
        buf[i + 1] = 40;
        buf[i + 2] = 40;
        buf[i + 3] = 200;
      }
    }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function currentMood() {
  return usage.moodFor(usage.headlinePercent(state.buckets), { loggedIn: state.loggedIn, error: state.error });
}

function updateTray() {
  if (!tray) return;
  tray.setImage(dotIcon(MOOD_COLORS[currentMood()] || MOOD_COLORS.ok));
  let tip = 'Usage Pet';
  if (!state.loggedIn) tip += ' — not signed in';
  else if (state.buckets.length)
    tip += '\n' + state.buckets.map((b) => `${b.label}: ${Math.round(b.percent)}%`).join('\n');
  else if (state.error) tip += ' — ' + state.error;
  tray.setToolTip(tip.slice(0, 127));
  tray.setContextMenu(buildMenu());
}

function setVisible(v) {
  settings.visible = v;
  saveSettings();
  if (!petWin) return;
  if (v) petWin.showInactive();
  else petWin.hide();
  if (tray) tray.setContextMenu(buildMenu());
}

function setScale(s) {
  settings.scale = s;
  saveSettings();
  if (petWin) {
    const [x, y] = petWin.getPosition();
    const [ow, oh] = petWin.getSize();
    const w = Math.round(BASE_W * s);
    const h = Math.round(BASE_H * s);
    // keep the pet's feet in the same spot
    petWin.setBounds({ x: x + Math.round((ow - w) / 2), y: y + (oh - h), width: w, height: h });
    pushState();
  }
  if (tray) tray.setContextMenu(buildMenu());
}

function buildMenu() {
  const loginItem = app.getLoginItemSettings();
  return Menu.buildFromTemplate([
    { label: settings.visible ? 'Hide pet' : 'Show pet', click: () => setVisible(!settings.visible) },
    {
      label: 'Choose pet',
      submenu: [
        ...sprite.SPECIES.map((s) => ({
          label: s.label,
          type: 'radio',
          checked: settings.species === s.id,
          click: () => setSpecies(s.id),
        })),
        { type: 'separator' },
        ...(settings.custom
          ? [{ label: 'My picture', type: 'radio', checked: settings.species === 'custom', click: () => setSpecies('custom') }]
          : []),
        { label: 'Make a pet from an image…', click: pickImagePet },
      ],
    },
    { label: 'Refresh now', click: refresh },
    { label: 'Open Claude', click: () => shell.openExternal(CLAUDE + '/new') },
    { label: 'Open usage page', click: () => shell.openExternal(CLAUDE + '/settings/usage') },
    { type: 'separator' },
    state.loggedIn
      ? { label: 'Sign out of Claude (pet only)', click: signOut }
      : { label: 'Sign in to Claude…', click: openLogin },
    { type: 'separator' },
    {
      label: 'Check every',
      submenu: [1, 2, 5, 10, 15].map((m) => ({
        label: `${m} min`,
        type: 'radio',
        checked: settings.intervalMin === m,
        click: () => {
          settings.intervalMin = m;
          saveSettings();
          schedulePolling();
        },
      })),
    },
    {
      label: 'Pet size',
      submenu: [
        [0.75, 'Small'],
        [1, 'Normal'],
        [1.5, 'Big'],
      ].map(([s, l]) => ({ label: l, type: 'radio', checked: settings.scale === s, click: () => setScale(s) })),
    },
    {
      label: 'Notify at 80% / 95%',
      type: 'checkbox',
      checked: settings.notify,
      click: (mi) => {
        settings.notify = mi.checked;
        saveSettings();
      },
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: !!loginItem.openAtLogin,
      click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked }),
    },
    { type: 'separator' },
    { label: 'Quit Usage Pet', click: () => app.quit() },
  ]);
}

// ---------- IPC from the pet ----------
let dragOffset = null;
ipcMain.on('pet:hit', (_e, overPet) => {
  if (!petWin) return;
  if (overPet) petWin.setIgnoreMouseEvents(false);
  else if (!dragOffset) petWin.setIgnoreMouseEvents(true, { forward: true });
});
ipcMain.on('pet:drag-start', (_e, { screenX, screenY }) => {
  if (!petWin) return;
  const [wx, wy] = petWin.getPosition();
  dragOffset = { sx: screenX, sy: screenY, wx, wy };
});
ipcMain.on('pet:drag', (_e, { screenX, screenY }) => {
  if (!petWin || !dragOffset) return;
  const [w, h] = petWin.getSize();
  // setBounds (not setPosition) avoids a Windows DPI quirk that slowly grows the window
  petWin.setBounds({
    x: Math.round(dragOffset.wx + screenX - dragOffset.sx),
    y: Math.round(dragOffset.wy + screenY - dragOffset.sy),
    width: w,
    height: h,
  });
});
ipcMain.on('pet:drag-end', () => {
  dragOffset = null;
  if (!petWin) return;
  const [x, y] = petWin.getPosition();
  settings.x = x;
  settings.y = y;
  saveSettings();
});
ipcMain.on('pet:menu', () => {
  if (petWin) buildMenu().popup({ window: petWin });
});
ipcMain.on('pet:open-claude', () => shell.openExternal(CLAUDE + '/new'));
ipcMain.on('pet:login', openLogin);
ipcMain.on('pet:refresh', refresh);
ipcMain.handle('pet:get-state', () => petState());

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setVisible(true));

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.noam.usagepet');
    loadSettings();
    createPetWindow();
    tray = new Tray(dotIcon(MOOD_COLORS.confused));
    tray.on('click', () => setVisible(!settings.visible));
    updateTray();
    refresh().then(() => {
      if (!state.loggedIn) openLogin();
    });
    schedulePolling();
  });

  // The pet lives in the tray; closing the login window must not quit the app.
  app.on('window-all-closed', (e) => e.preventDefault());
}
