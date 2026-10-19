// Pet page: draws Sprout, animates it by mood, shows the usage bubble,
// and handles drag / click / double-click / right-click.
(function () {
  const api = window.petAPI;
  const U = window.PetUsage;
  const S = window.PetSprite;

  const stage = document.getElementById('stage');
  const petEl = document.getElementById('pet');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const badge = document.getElementById('badge');
  const thought = document.getElementById('thought');
  const panel = document.getElementById('panel');
  const content = document.getElementById('content');
  const headline = document.getElementById('headline');
  const footer = document.getElementById('footer');

  const PX = 6; // screen pixels per art pixel
  let state = { loggedIn: true, buckets: [], loading: true };
  let mood = 'confused';
  let pinned = false;
  let hoverTimer = null;

  // ---------- drawing ----------
  let blinkUntil = 0;
  let nextBlink = Date.now() + 3000;
  let hopStart = 0;

  function bounceFor(now) {
    // returns { dy (art px, negative = up), squash }
    if (hopStart && now - hopStart < 450) {
      const t = (now - hopStart) / 450;
      return { dy: -Math.round(Math.sin(t * Math.PI) * 4), squash: 0 };
    }
    switch (mood) {
      case 'happy':
        return { dy: -Math.round(Math.abs(Math.sin(now / 320)) * 2), squash: Math.sin(now / 320) > 0.9 ? 1 : 0 };
      case 'ok':
        return { dy: 0, squash: Math.floor(now / 900) % 2 };
      case 'tired':
        return { dy: 0, squash: Math.floor(now / 1600) % 2 };
      case 'exhausted':
        return { dy: 0, squash: Math.floor(now / 2200) % 3 === 0 ? 1 : 0 };
      case 'asleep':
        return { dy: 0, squash: Math.floor(now / 1800) % 2 };
      default:
        return { dy: 0, squash: 0 };
    }
  }

  function draw() {
    const now = Date.now();
    if (now > nextBlink && mood !== 'asleep') {
      blinkUntil = now + 140;
      nextBlink = now + 2500 + Math.random() * 3500;
    }
    const { dy, squash } = bounceFor(now);
    const sprite = S.drawPet(mood, {
      blink: now < blinkUntil,
      squash,
      species: state.species,
      custom: state.custom,
    });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < sprite.h; y++)
      for (let x = 0; x < sprite.w; x++) {
        const c = sprite.pixels[y * sprite.w + x];
        if (!c) continue;
        ctx.fillStyle = c;
        const yy = y + dy;
        if (yy < 0) continue;
        ctx.fillRect(x * PX, yy * PX, PX, PX);
      }
  }
  // ~12 fps keeps the pixel-art feel and uses almost no CPU
  setInterval(draw, 83);

  // ---------- state → UI ----------
  function levelClass(p) {
    return p >= 90 ? 'bad' : p >= 75 ? 'warn' : 'ok';
  }

  function render() {
    const buckets = U.applyRollover(state.buckets || []);
    const head = U.headlinePercent(buckets);
    mood = U.moodFor(head, { loggedIn: state.loggedIn, error: buckets.length ? null : state.error });
    if (state.loading && !buckets.length && state.loggedIn) mood = 'ok';

    stage.style.zoom = state.scale || 1;

    const sp = S.SPECIES.find((s) => s.id === state.species);
    document.getElementById('title').textContent = state.custom ? 'My pet' : sp ? sp.label : 'Sprout';

    // badge
    badge.className = '';
    if (!state.loggedIn) badge.textContent = '';
    else if (head === null) badge.textContent = state.loading ? '…' : '?';
    else {
      badge.textContent = Math.round(head) + '%';
      badge.classList.add(levelClass(head));
    }
    if (state.loading) badge.classList.add('loading');

    renderHud(buckets);

    // thought bubble above the head
    if (mood === 'asleep') thought.innerHTML = '<span class="z">Z</span><span class="z">z</span><span class="z">z</span>';
    else if (mood === 'confused' || mood === 'login') thought.textContent = '?';
    else thought.textContent = '';

    // panel
    headline.textContent = moodLine(mood, head);
    content.innerHTML = '';
    if (!state.loggedIn) {
      content.appendChild(msg("I can't see your Claude usage yet. Sign in once and I'll keep watch."));
      content.appendChild(button('Sign in to Claude', api.login));
    } else if (!buckets.length) {
      content.appendChild(msg(state.loading ? 'Checking your usage…' : state.error || 'No usage data yet.'));
      if (!state.loading) content.appendChild(button('Try again', api.refresh));
    } else {
      for (const b of buckets.slice(0, 5)) content.appendChild(meter(b));
    }
    footer.textContent = footerText();
  }

  // Always-visible bars: name, bar, "68% · 2h 14m" (percent used · time until reset)
  function renderHud(buckets) {
    const hud = document.getElementById('hud');
    hud.innerHTML = '';
    if (!state.loggedIn) return;
    for (const b of U.hudBuckets(buckets)) {
      const row = document.createElement('div');
      row.className = 'hrow';
      row.title = b.label + (U.formatReset(b) ? ' · ' + U.formatReset(b) : '');
      const name = document.createElement('span');
      name.className = 'hname';
      name.textContent = b.key === 'five_hour' ? 'Session' : b.key === 'seven_day' ? 'Week' : b.label.replace(/^Weekly · /, '');
      const track = document.createElement('div');
      track.className = 'htrack';
      const fill = document.createElement('div');
      const lvl = levelClass(b.percent);
      fill.className = 'hfill' + (lvl === 'ok' ? '' : ' ' + lvl);
      fill.style.width = Math.max(2, b.percent) + '%';
      track.appendChild(fill);
      const text = document.createElement('span');
      text.className = 'htext';
      const left = U.formatRemaining(b);
      text.innerHTML = Math.round(b.percent) + '%' + (left ? ' <small>· ' + left.replace(/[<&]/g, '') + '</small>' : '');
      row.append(name, track, text);
      hud.appendChild(row);
    }
  }

  function moodLine(m, head) {
    switch (m) {
      case 'happy':
        return 'full of energy';
      case 'ok':
        return head === null ? '' : 'doing fine';
      case 'tired':
        return 'getting tired';
      case 'exhausted':
        return 'almost out!';
      case 'asleep':
        return 'out of energy — resting';
      case 'login':
        return 'needs sign-in';
      default:
        return 'confused';
    }
  }

  function footerText() {
    const parts = [];
    if (state.fetchedAt) {
      const mins = Math.round((Date.now() - state.fetchedAt) / 60000);
      parts.push(mins < 1 ? 'updated now' : `updated ${mins}m ago`);
    }
    parts.push('right-click for menu');
    petEl.title = 'Double-click to open Claude · right-click for menu';
    return parts.join(' · ');
  }

  function msg(text) {
    const d = document.createElement('div');
    d.className = 'message';
    d.textContent = text;
    return d;
  }
  function button(text, fn) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = text;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  }
  function meter(b) {
    const wrap = document.createElement('div');
    wrap.className = 'meter';
    wrap.title = 'API key: ' + b.key;
    const row = document.createElement('div');
    row.className = 'row';
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = b.label;
    const p = document.createElement('span');
    p.className = 'pct';
    p.textContent = Math.round(b.percent) + '%';
    row.append(l, p);
    const track = document.createElement('div');
    track.className = 'track';
    const fill = document.createElement('div');
    fill.className = 'fill ' + (levelClass(b.percent) === 'ok' ? '' : levelClass(b.percent));
    fill.style.width = Math.max(2, b.percent) + '%';
    track.appendChild(fill);
    wrap.append(row, track);
    const r = U.formatReset(b);
    if (r) {
      const rs = document.createElement('div');
      rs.className = 'reset';
      rs.textContent = r;
      wrap.appendChild(rs);
    }
    return wrap;
  }

  // ---------- panel visibility ----------
  function showPanel() {
    lastOver = Date.now();
    clearTimeout(hoverTimer);
    panel.classList.remove('hidden');
  }
  function hidePanelSoon() {
    if (pinned) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => panel.classList.add('hidden'), 350);
  }

  // Safety net: hide the bubble once the mouse has really been away from the pet.
  // Hover-only bubble goes after 1.5 s; a bubble opened by clicking stays 30 s.
  const HOVER_GRACE_MS = 1500;
  const PINNED_GRACE_MS = 30000;
  let lastOver = Date.now();
  setInterval(async () => {
    if (panel.classList.contains('hidden')) return;
    const c = await api.cursor().catch(() => null);
    const el = c && document.elementFromPoint(c.x, c.y);
    if (dragging || (el && (petEl.contains(el) || panel.contains(el)))) lastOver = Date.now();
    else if (Date.now() - lastOver > (pinned ? PINNED_GRACE_MS : HOVER_GRACE_MS)) {
      pinned = false;
      panel.classList.add('hidden');
    }
  }, 400);

  // ---------- mouse: click-through except over the pet / open panel ----------
  let over = false;
  function setOver(v) {
    if (v !== over) {
      over = v;
      api.hit(v);
    }
  }
  document.addEventListener('mousemove', (e) => {
    const t = e.target;
    const onPet = petEl.contains(t);
    const onPanel = !panel.classList.contains('hidden') && panel.contains(t);
    setOver(onPet || onPanel || dragging);
    if (onPet || onPanel) showPanel();
    else hidePanelSoon();
  });
  document.addEventListener('mouseleave', () => {
    if (!dragging) setOver(false);
    hidePanelSoon();
  });

  // ---------- drag vs click ----------
  let dragging = false;
  let down = null;
  petEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY, moved: false };
    api.dragStart({ screenX: e.screenX, screenY: e.screenY });
  });
  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    if (!down.moved && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
      down.moved = true;
      dragging = true;
      petEl.classList.add('dragging');
    }
    if (down.moved) api.drag({ screenX: e.screenX, screenY: e.screenY });
  });
  window.addEventListener('mouseup', () => {
    if (!down) return;
    const wasDrag = down.moved;
    down = null;
    dragging = false;
    petEl.classList.remove('dragging');
    api.dragEnd();
    if (!wasDrag) {
      pinned = !pinned;
      hopStart = Date.now();
      if (pinned) showPanel();
      else panel.classList.add('hidden');
    }
  });
  petEl.addEventListener('dblclick', () => api.openClaude());
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.menu();
  });

  // ---------- wire up ----------
  api.onUsage((s) => {
    state = s;
    render();
  });
  api.getState().then((s) => {
    state = s;
    render();
  });
  // keep "updated N min ago" and reset countdowns fresh
  setInterval(render, 30000);
})();
