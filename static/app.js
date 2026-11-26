/* Cassis Order Protocol — four live examples.
 *
 * Nothing here is a recording. The server describes a page, the person
 * poking at it decides what happens next, and the server answers with
 * whatever that implies. Prices, totals and invoices are all worked out
 * from what was actually tapped and typed.
 *
 * The wallet starts on its camera, pointed at a café terrace. Each QR code
 * in the picture is its own merchant, with its own server, and none of them
 * knows about the others.
 */
(() => {
  'use strict';

  const root = document.querySelector('[data-examples]');
  if (!root) return;

  const q = (sel) => root.querySelector(sel);

  const ui = {
    screen: q('[data-example-screen]'),
    codes: Array.from(root.querySelectorAll('[data-code]'))
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usd = (n) => '$' + n.toFixed(2);
  const SATS_PER_USD = 4000;
  const sats = (n) => Math.round(n * SATS_PER_USD).toLocaleString('en-GB') + ' sats';

  /* the camera's view: scene.png at its own size, and the scan frame */
  const SCENE_SRC = root.dataset.scene;
  const SCENE_W = 1024;
  const SCENE_H = 768;
  const FRAME = 150;

  /* tip jar */
  const PRESETS = [2, 5, 10];

  /* terrace café, table 21 */
  const CAFE = {
    espresso: { name: 'Espresso', price: 2.2 },
    cappuccino: { name: 'Cappuccino', price: 3.5 },
    lemonade: { name: 'Lemonade', price: 4 },
    croissant: { name: 'Croissant', price: 2.8 },
    sandwich: { name: 'Club sandwich', price: 8.5 }
  };

  /* the cart on the laptop's screen */
  const CART = 197;

  /* gym membership */
  const MONTH = 40;
  const UNUSED_DAYS = 18;
  const REFUND = (MONTH * UNUSED_DAYS) / 30;

  const given = (c) => {
    const amount = parseFloat(c.amount);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  };

  const cart = (c) => c.cart || {};
  const cartCount = (c) => Object.values(cart(c)).reduce((sum, n) => sum + n, 0);
  const cartTotal = (c) => Object.keys(cart(c)).reduce((sum, id) => sum + CAFE[id].price * cart(c)[id], 0);
  const cartSummary = (c) =>
    Object.keys(cart(c))
      .map((id) => cart(c)[id] + ' × ' + CAFE[id].name.toLowerCase())
      .join(', ');

  /* ------------------------------------------------------------------ *
   * dom helpers
   * ------------------------------------------------------------------ */

  const h = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  /* an element that fades in as the stage plays out */
  const at = (node, threshold) => {
    node.classList.add('reveal');
    node.dataset.r = String(threshold);
    return node;
  };

  /* a tappable thing: always a real <button>, so the keyboard gets it for free */
  const tap = (node, act) => {
    node.type = 'button';
    node.dataset.act = act;
    return node;
  };

  const btn = (cls, text, act, extra) => {
    const node = h('button', cls, text);
    tap(node, act);
    if (extra) Object.assign(node.dataset, extra);
    return node;
  };

  const field = (bind, placeholder) => {
    const box = h('div', 'screen-field');
    const input = h('input', 'screen-input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.dataset.bind = bind;
    input.setAttribute('aria-label', placeholder);
    box.append(input);
    return box;
  };

  const money = (label, amount) => {
    const row = h('p', 'screen-total');
    row.append(h('span', null, label), h('b', null, amount));
    return row;
  };

  const code = (label, value) => {
    const line = h('p', 'screen-mono screen-mono-dim');
    line.append(document.createTextNode(label), h('em', null, value));
    return line;
  };

  const label = (text) => h('p', 'screen-label', text);

  const rowLine = (text) => h('p', 'screen-line', text);

  /* ------------------------------------------------------------------ *
   * the wallet's own screens
   *
   * These are drawn by the wallet, not described by any server. The
   * payment screens take the whole display: whatever surface was up is
   * out of sight behind them.
   * ------------------------------------------------------------------ */

  /* the other party, the way a payment app shows a contact */
  const initials = (name) =>
    name
      .split(/\s+/)
      .filter((word) => /^\p{L}/u.test(word))
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();

  function party(name, memo) {
    const box = h('div', 'pay-party');
    box.append(h('span', 'pay-avatar', initials(name)), h('p', 'pay-name', name), h('p', 'pay-memo', memo));
    return box;
  }

  /* the screen once the money has moved: it stays up until you close it */
  function settled({ heading, amount, line, memo, note }) {
    const box = h('div', 'pay-done');
    box.append(
      at(h('span', 'pay-check', '✓'), 0.08),
      at(h('p', 'pay-heading', heading), 0.16),
      at(h('p', 'pay-amount', amount), 0.22),
      at(h('p', 'pay-name', line), 0.28),
      at(h('p', 'pay-memo', memo), 0.32)
    );
    if (note) box.append(at(h('p', 'pay-fine', note), 0.4));
    return [box, at(btn('pay-btn pay-btn-quiet', 'Done', 'close'), 0.46)];
  }

  /* an invoice arrived: the wallet's payment screen */
  function payScreen({ to, amount, memo, note, done = false }) {
    if (done) {
      return {
        pay: true,
        body: [h('p', 'pay-top', 'Payment sent'), ...settled({ heading: 'Paid', amount, line: 'to ' + to, memo, note })]
      };
    }
    return {
      pay: true,
      body: [
        h('p', 'pay-top', 'Confirm payment'),
        at(party(to, memo), 0.06),
        at(h('p', 'pay-amount', amount), 0.16),
        h('div', 'pay-spacer'),
        at(h('p', 'pay-fine', 'Amount and payee come from the invoice, not from the page.'), 0.3),
        at(btn('pay-btn', 'Pay ' + amount, 'pay'), 0.38)
      ]
    };
  }

  /* an invoice request arrived: someone wants to pay the wallet */
  function receiveScreen({ from, amount, memo, done = false }) {
    if (done) {
      return {
        pay: true,
        body: [
          h('p', 'pay-top', 'Payment received'),
          ...settled({
            heading: 'Received',
            amount: '+' + amount,
            line: 'from ' + from,
            memo,
            note: 'Paid against the invoice your wallet issued.'
          })
        ]
      };
    }
    return {
      pay: true,
      body: [
        h('p', 'pay-top', 'Incoming payment'),
        at(party(from, memo), 0.06),
        at(h('p', 'pay-amount pay-amount-in', '+' + amount), 0.16),
        h('div', 'pay-spacer'),
        at(h('p', 'pay-fine', 'Accepting makes your wallet issue an invoice with its own keys, for ' + from + ' to pay.'), 0.3),
        at(btn('pay-btn', 'Accept ' + amount, 'accept'), 0.38)
      ]
    };
  }

  /* the wallet's home: its camera, looking at the terrace.
   *
   * Dragging moves the picture under a fixed scan frame; a code that sits
   * fully inside the frame for half a second is read. */
  function home() {
    const scene = h('div', 'scan-scene');
    const img = h('img', 'scan-img');
    img.src = SCENE_SRC;
    img.alt = '';
    img.draggable = false;
    scene.append(img);

    const targets = Object.keys(FLOWS).map((id) => {
      const [left, top, right, bottom] = FLOWS[id].box;
      const spot = h('span', 'scan-code');
      Object.assign(spot.style, { left: left + 'px', top: top + 'px', width: right - left + 'px', height: bottom - top + 'px' });
      scene.append(spot);
      return [spot, id];
    });

    const frame = h('div', 'scan-frame');
    frame.style.setProperty('--frame', FRAME + 'px');
    const hint = h('p', 'scan-hint', 'Drag to aim the camera at a code');
    const view = h('div', 'scan-view');
    view.tabIndex = 0;
    view.setAttribute('role', 'application');
    view.setAttribute('aria-label', 'Camera view of a café terrace with four QR codes. Drag, or use the arrow keys, to aim at one.');
    view.append(scene, frame, hint);

    /* the camera remembers where it was pointing; what is already in the
       frame when you come back is not read until you move */
    let { x, y } = camera;
    let drag = null;
    let aimed;
    let timer = 0;
    let read = false;

    /* the picture never slides past its own edges, so the camera zooms in
       just enough for the frame to reach the codes nearest the border */
    const zoom = () => {
      const reach = (v, margin) => ((v - FRAME) / 2 + 8) / margin;
      const vw = view.clientWidth;
      const vh = view.clientHeight;
      return Math.max(
        1,
        ...Object.values(FLOWS).flatMap(({ box: [left, top, right, bottom] }) => [
          reach(vw, left),
          reach(vh, top),
          reach(vw, SCENE_W - right),
          reach(vh, SCENE_H - bottom)
        ])
      );
    };

    const move = (nx, ny) => {
      const z = zoom();
      x = Math.min(0, Math.max(view.clientWidth - SCENE_W * z, nx));
      y = Math.min(0, Math.max(view.clientHeight - SCENE_H * z, ny));
      camera.x = x;
      camera.y = y;
      scene.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
      check();
    };

    function check() {
      if (read) return;
      const f = frame.getBoundingClientRect();
      const inside = (r) => r.left >= f.left && r.right <= f.right && r.top >= f.top && r.bottom <= f.bottom;
      const hit = targets.find(([spot]) => inside(spot.getBoundingClientRect()))?.[1] ?? null;
      if (aimed === undefined) {
        aimed = hit;
        return;
      }
      if (hit === aimed) return;
      aimed = hit;
      clearTimeout(timer);
      frame.classList.toggle('is-locked', Boolean(hit));
      if (hit) {
        timer = setTimeout(() => {
          read = true;
          frame.classList.add('is-read');
          setTimeout(() => view.isConnected && scan(hit), 250);
        }, 500);
      }
    }

    view.addEventListener('pointerdown', (event) => {
      drag = { dx: event.clientX - x, dy: event.clientY - y };
      view.setPointerCapture(event.pointerId);
      view.classList.add('is-dragging');
      hint.hidden = true;
    });
    view.addEventListener('pointermove', (event) => drag && move(event.clientX - drag.dx, event.clientY - drag.dy));
    const end = () => {
      drag = null;
      view.classList.remove('is-dragging');
    };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);

    const STEP = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    view.addEventListener('keydown', (event) => {
      const step = STEP[event.key];
      if (!step) return;
      event.preventDefault();
      hint.hidden = true;
      move(x + step[0] * 16, y + step[1] * 16);
    });

    requestAnimationFrame(() => {
      if (camera.x == null) move((view.clientWidth - SCENE_W * zoom()) / 2, (view.clientHeight - SCENE_H * zoom()) / 2);
      else move(camera.x, camera.y);
    });

    const alt = h('p', 'scan-alt');
    alt.append(document.createTextNode("Can't drag? Scan "));
    Object.keys(FLOWS).forEach((id, i, ids) => {
      if (i > 0) alt.append(document.createTextNode(i === ids.length - 1 ? ' or ' : ', '));
      alt.append(btn(null, FLOWS[id].label, 'scan:' + id));
    });
    alt.append(document.createTextNode('.'));

    const head = h('div', 'wallet-head');
    head.append(h('p', 'wallet-kicker', 'Your wallet'), h('p', 'wallet-balance', '212,400 sats'));

    return { home: true, body: [head, h('p', 'screen-label', 'Scan a code'), view, alt] };
  }

  /* ------------------------------------------------------------------ *
   * surfaces: what the servers describe
   * ------------------------------------------------------------------ */

  /* tip jar: a form the server described, three fields and one button */
  function tipForm(c) {
    const presets = h('div', 'screen-chips');
    PRESETS.forEach((amount, i) => {
      const chosen = c.amount === String(amount);
      const chip = h('button', 'screen-chip screen-chip-money' + (chosen ? ' is-picked' : ''));
      chip.append(h('span', null, usd(amount)), h('em', null, chosen ? '✓' : 'tap to fill'));
      at(chip, 0.24 + i * 0.06);
      tap(chip, 'amount:' + amount);
      presets.append(chip);
    });

    return {
      surface: 'tip_jar',
      body: [
        h('p', 'screen-note', 'server → client · element'),
        at(h('p', 'screen-title', 'Keep the music alive'), 0.05),
        at(h('p', 'screen-sub', 'Leo, live on the square this afternoon'), 0.1),
        at(label('How much?'), 0.16),
        at(presets, 0.22),
        at(field('amount', '0.00'), 0.32),
        at(label('Your name (optional)'), 0.38),
        at(field('name', 'Anon'), 0.42),
        at(label('A request (optional)'), 0.46),
        at(field('message', 'play one more'), 0.5),
        at(btn('screen-btn screen-btn-lime screen-btn-wide', 'Send the tip', 'submit', { needs: 'amount' }), 0.58),
        at(code('"bind": ', '"tip.amount"'), 0.66)
      ]
    };
  }

  /* table 21: the café's menu, ordered straight to the table */
  function cafeMenu(c) {
    const list = h('div', 'screen-list');
    Object.keys(CAFE).forEach((id, i) => {
      const count = cart(c)[id] || 0;
      const row = h('button', 'screen-row' + (count ? ' has-count' : ''));
      const name = h('span', null, CAFE[id].name);
      if (count) name.append(h('b', 'screen-count', '× ' + count));
      row.append(name, h('span', 'screen-price', usd(CAFE[id].price)));
      at(row, 0.14 + i * 0.05);
      tap(row, 'add:' + id);
      list.append(row);
    });

    const body = [
      h('p', 'screen-note', 'server → client · element'),
      at(h('p', 'screen-title', 'Terrace Café · Table 21'), 0.05),
      at(h('p', 'screen-sub', 'Tap to add. We bring it to your table.'), 0.1),
      at(list, 0.14),
      at(money('Total', usd(cartTotal(c))), 0.42)
    ];
    if (cartCount(c)) body.push(at(h('p', 'screen-total-sats', sats(cartTotal(c))), 0.46));
    body.push(
      at(btn('screen-btn screen-btn-lime screen-btn-wide', cartCount(c) ? 'Order to table 21' : 'Pick something first', 'order', { needs: 'cart' }), 0.5)
    );
    if (cartCount(c)) body.push(at(btn('screen-btn screen-btn-wide', 'Start over', 'clear'), 0.54));
    body.push(at(code('each row: button → action ', 'add { "item": … }'), 0.6));
    return { surface: 'table_21', body };
  }

  /* gym: the membership, as the server sees it */
  function membership() {
    return {
      surface: 'membership',
      body: [
        h('p', 'screen-note', 'server → client · element'),
        at(h('p', 'screen-title', 'Riverside Gym'), 0.05),
        at(rowLine('Active · paid until 12 Dec'), 0.14),
        at(h('p', 'screen-sub', UNUSED_DAYS + ' days left this month.'), 0.2),
        at(money('Next month', usd(MONTH)), 0.26),
        at(btn('screen-btn screen-btn-lime screen-btn-wide', 'Pay for next month', 'renew'), 0.34),
        at(btn('screen-btn screen-btn-coral screen-btn-wide', 'Cancel and refund ' + usd(REFUND), 'cancel'), 0.42)
      ]
    };
  }

  /* ------------------------------------------------------------------ *
   * the four flows, one per code in the picture
   *
   * `box` is where the code sits in scene.png, in image pixels:
   * [left, top, right, bottom]. `uri` is what the code says.
   *
   * A stage is what the client is showing, plus what the server does
   * about a tap. `act` is the server's answer: true moves on, a number
   * jumps to that stage, and { set } redraws the stage in place with new
   * state. Stages are built from the flow's own state, so the whole page
   * re-reads the choices that were made in it.
   * ------------------------------------------------------------------ */

  const FLOWS = {
    market: {
      label: 'the laptop',
      box: [440, 235, 497, 291],
      uri: 'cop://9e2a…41d7#order=2817',
      stages: [
        () => ({
          screen: () => payScreen({ to: 'Linen & Co.', amount: usd(CART), memo: 'Order #2817 · shirt, tote bag, sunglasses' }),
          act: (key) => key === 'pay'
        }),
        () => ({
          screen: () => payScreen({ to: 'Linen & Co.', amount: usd(CART), memo: 'Order #2817 · shirt, tote bag, sunglasses', done: true })
        })
      ]
    },

    tip: {
      label: 'the tip sign',
      box: [882, 158, 915, 189],
      uri: 'cop://c07f…be15',
      stages: [
        (c) => ({
          screen: () => tipForm(c),
          act: (key) =>
            key.startsWith('amount:') ? { set: { amount: key.slice(7) } } : key === 'submit' && given(c) > 0
        }),
        (c) => ({
          screen: () => payScreen({ to: 'Leo', amount: usd(given(c)), memo: c.name ? 'Tip from ' + c.name : 'Tip' }),
          act: (key) => key === 'pay'
        }),
        (c) => ({
          screen: () => payScreen({ to: 'Leo', amount: usd(given(c)), memo: c.name ? 'Tip from ' + c.name : 'Tip', done: true })
        })
      ]
    },

    table: {
      label: 'table 21',
      box: [505, 584, 596, 638],
      uri: 'cop://5f1c…0a9b#table=21',
      stages: [
        (c) => ({
          screen: () => cafeMenu(c),
          act: (key) => {
            if (key.startsWith('add:')) {
              const id = key.slice(4);
              return { set: { cart: { ...cart(c), [id]: (cart(c)[id] || 0) + 1 } } };
            }
            if (key === 'clear') return { set: { cart: {} } };
            return key === 'order' && cartCount(c) > 0;
          }
        }),
        (c) => ({
          screen: () => payScreen({ to: 'Terrace Café', amount: sats(cartTotal(c)), memo: 'Table 21 · ' + usd(cartTotal(c)) }),
          act: (key) => key === 'pay'
        }),
        (c) => ({
          screen: () =>
            payScreen({
              to: 'Terrace Café',
              amount: sats(cartTotal(c)),
              memo: 'Table 21 · ' + usd(cartTotal(c)),
              note: 'On its way to table 21: ' + cartSummary(c) + '.',
              done: true
            })
        })
      ]
    },

    gym: {
      label: 'the gym card',
      box: [357, 597, 411, 635],
      uri: 'cop://71b3…e8c0',
      stages: [
        /* 0 */ () => ({
          screen: () => membership(),
          act: (key) => (key === 'renew' ? true : key === 'cancel' ? 3 : false)
        }),
        /* 1 */ () => ({
          screen: () => payScreen({ to: 'Riverside Gym', amount: usd(MONTH), memo: 'Membership · 12 Dec – 12 Jan' }),
          act: (key) => key === 'pay'
        }),
        /* 2 */ () => ({
          screen: () => payScreen({ to: 'Riverside Gym', amount: usd(MONTH), memo: 'Membership · 12 Dec – 12 Jan', done: true })
        }),
        /* 3 */ () => ({
          screen: () => receiveScreen({ from: 'Riverside Gym', amount: usd(REFUND), memo: 'Refund · ' + UNUSED_DAYS + ' unused days' }),
          act: (key) => key === 'accept'
        }),
        /* 4 */ () => ({
          screen: () => receiveScreen({ from: 'Riverside Gym', amount: usd(REFUND), memo: 'Refund · ' + UNUSED_DAYS + ' unused days', done: true })
        })
      ]
    }
  };

  /* ------------------------------------------------------------------ *
   * engine
   * ------------------------------------------------------------------ */

  /* flowId null is the wallet's home, with the camera up */
  const state = { flowId: null, stageIndex: 0, ctx: {}, timer: 0, busy: false, raf: 0, p: 1 };
  const camera = { x: null, y: null };
  let stage = null;
  let reveals = [];

  const flow = () => FLOWS[state.flowId];

  function scan(id) {
    state.flowId = id;
    state.ctx = {};
    enter(0);
  }

  function close() {
    state.flowId = null;
    state.ctx = {};
    enter(0);
  }

  /* ---- what is ready to send ---- */

  const ready = (need) => {
    if (need === 'amount') return given(state.ctx) > 0;
    if (need === 'cart') return cartCount(state.ctx) > 0;
    return true;
  };

  function refresh() {
    ui.screen.querySelectorAll('[data-needs]').forEach((node) => {
      node.disabled = !ready(node.dataset.needs);
    });
  }

  /* ---- render a stage ---- */

  function enter(index, { soft = false } = {}) {
    clearTimeout(state.timer);
    state.timer = 0;

    let scene;
    if (flow()) {
      state.stageIndex = Math.max(0, Math.min(flow().stages.length - 1, index));
      stage = flow().stages[state.stageIndex](state.ctx);
      scene = stage.screen();
    } else {
      stage = null;
      scene = home();
    }

    ui.codes.forEach((node) => node.classList.toggle('is-current', node.dataset.code === state.flowId));

    const status = h('div', 'demo-status');
    const icons = h('span', 'demo-status-icons');
    icons.setAttribute('aria-hidden', 'true');
    icons.append(h('i', 'demo-signal'), h('i', 'demo-battery'));
    status.append(h('span', null, '9:41'), icons);

    const phone = h('div', 'demo-phone' + (scene.pay ? ' is-pay' : ''));
    const body = h('div', 'demo-phone-body');
    const screenEl = h('div', 'screen is-active' + (scene.pay ? ' screen-pay' : ''));
    scene.body.forEach((node) => screenEl.append(node));
    body.append(screenEl);

    phone.append(status);
    if (flow()) {
      /* the wallet's own bar: which code it dialed, and a way out */
      const bar = h('div', 'demo-bar');
      const x = btn('demo-bar-close', '✕', 'close');
      x.setAttribute('aria-label', 'Close');
      bar.append(x, h('span', 'demo-bar-uri', flow().uri));
      phone.append(bar);
    }
    phone.append(body, h('div', 'demo-home'));

    const device = h('div', 'demo-device');
    device.append(phone);
    ui.screen.replaceChildren(device);

    reveals = Array.from(screenEl.querySelectorAll('[data-r]'));
    state.busy = false;
    state.p = reduceMotion || soft ? 1 : 0;
    paint();
    syncInputs();
    refresh();
    if (!soft) animate();
  }

  /* the wallet's own fields keep whatever was typed into them */
  function syncInputs() {
    ui.screen.querySelectorAll('[data-bind]').forEach((input) => {
      const value = state.ctx[input.dataset.bind] || '';
      if (input.value !== value) input.value = value;
    });
  }

  /* ---- the reveal animation on entry ---- */

  function paint() {
    reveals.forEach((node) => node.classList.toggle('is-in', state.p >= Number(node.dataset.r)));
  }

  function animate() {
    cancelAnimationFrame(state.raf);
    if (reduceMotion) {
      state.p = 1;
      paint();
      return;
    }
    const tick = () => {
      state.p += (1 - state.p) * 0.24;
      if (state.p > 0.995) {
        state.p = 1;
        paint();
        state.raf = 0;
        return;
      }
      paint();
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  /* ---- acting: the person at the other end ---- */

  /* stage.act() says what the server does with a tap:
   *   true                      move to the next stage
   *   a stage number            jump to that stage
   *   { set: {...} }            redraw this same stage with new state
   *   { set: {...}, next: true }  remember the choice, then move on
   *
   * `close` and `scan:` belong to the wallet, not to any server. */

  function act(key, node) {
    if (key === 'close') return close();
    if (key.startsWith('scan:')) return scan(key.slice(5));
    if (!stage || !stage.act || state.busy) return;
    const result = stage.act(key);
    if (result === false || result == null) return;

    if (typeof result === 'number') {
      enter(result);
      return;
    }

    if (typeof result === 'object') {
      Object.assign(state.ctx, result.set || {});
      if (!result.next) {
        enter(state.stageIndex, { soft: true });
        return;
      }
    }

    node.classList.add('is-picked');
    state.busy = true;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => enter(state.stageIndex + 1), 520);
  }

  ui.screen.addEventListener('click', (event) => {
    const node = event.target.closest('[data-act]');
    if (!node || node.disabled) return;
    act(node.dataset.act, node);
  });

  ui.screen.addEventListener('input', (event) => {
    const key = event.target.dataset ? event.target.dataset.bind : null;
    if (!key) return;
    state.ctx[key] = event.target.value;
    refresh();
  });

  enter(0);
})();

/* The hero: order pages being put together on screens of different shapes.
 *
 * Only boxes and a frame. The frame takes a new shape, the boxes arrange
 * themselves inside it one by one, and the last of them becomes the pay
 * button and gets pressed.
 */
(() => {
  'use strict';

  const root = document.querySelector('[data-build]');
  if (!root) return;

  const screen = root.querySelector('.build-screen');
  const boxes = Array.from(root.querySelectorAll('.build-box'));
  const pay = root.querySelector('.build-pay');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLORS = ['cop', 'coral', 'amber', 'violet', 'copbright', 'alt'];

  /* aspect is width / height; each rect is [left, top, width, height] in
     percent of the frame, and the last one is always the pay button */
  const LAYOUTS = [
    {
      aspect: 0.52,
      radius: 26,
      colors: [0, 1, 5, 5, 2, 3],
      rects: [[7, 5, 86, 8], [7, 16, 86, 26], [7, 46, 86, 9], [7, 58, 86, 9], [7, 70, 41, 9], [52, 70, 41, 9], [7, 84, 86, 10]]
    },
    {
      aspect: 1.38,
      radius: 16,
      colors: [3, 2, 4, 1, 5, 5],
      rects: [[4, 6, 92, 11], [4, 22, 44, 72], [52, 22, 44, 16], [52, 42, 44, 16], [52, 62, 21, 12], [75, 62, 21, 12], [52, 79, 44, 15]]
    },
    {
      aspect: 0.5,
      radius: 28,
      colors: [3, 0, 1, 2, 4, 5],
      rects: [[7, 4, 86, 7], [7, 14, 86, 12], [7, 29, 86, 12], [7, 44, 86, 12], [7, 59, 86, 12], [7, 74, 86, 6], [7, 85, 86, 10]]
    },
    {
      aspect: 2.1,
      radius: 6,
      colors: [1, 4, 2, 3, 0, 5],
      rects: [[3, 8, 30, 84], [36, 8, 61, 16], [36, 30, 29, 28], [68, 30, 29, 28], [36, 64, 29, 28], [68, 64, 13, 28], [84, 64, 13, 28]]
    },
    {
      aspect: 1,
      radius: 20,
      colors: [2, 0, 3, 1, 4, 5],
      rects: [[8, 8, 84, 14], [8, 27, 40, 30], [52, 27, 40, 30], [8, 62, 26, 12], [37, 62, 26, 12], [66, 62, 26, 12], [8, 79, 84, 13]]
    },
    {
      aspect: 1.65,
      radius: 8,
      colors: [5, 0, 1, 2, 4, 5],
      rects: [[3, 5, 16, 90], [22, 5, 75, 22], [22, 32, 23, 33], [48, 32, 23, 33], [74, 32, 23, 33], [22, 70, 49, 25], [74, 77, 23, 18]]
    },
    {
      aspect: 0.55,
      radius: 24,
      colors: [5, 1, 2, 3, 0, 5],
      rects: [[7, 5, 40, 8], [7, 17, 41, 26], [52, 17, 41, 26], [7, 47, 41, 26], [52, 47, 41, 26], [7, 77, 86, 5], [7, 86, 86, 9]]
    },
    {
      aspect: 0.76,
      radius: 14,
      colors: [4, 3, 0, 1, 2, 5],
      rects: [[6, 4, 88, 12], [6, 20, 88, 30], [6, 54, 27, 16], [36.5, 54, 27, 16], [67, 54, 27, 16], [6, 74, 40, 18], [50, 74, 44, 18]]
    },
    {
      aspect: 1.6,
      radius: 10,
      colors: [5, 1, 2, 3, 5, 4],
      rects: [[4, 6, 56, 10], [4, 22, 56, 22], [4, 50, 56, 22], [4, 78, 56, 16], [64, 6, 32, 50], [64, 60, 32, 14], [64, 79, 32, 15]]
    },
    {
      aspect: 0.66,
      radius: 18,
      colors: [0, 3, 2, 1, 4, 5],
      rects: [[5, 4, 90, 8], [5, 16, 90, 36], [5, 56, 28, 18], [36, 56, 28, 18], [67, 56, 28, 18], [5, 78, 58, 15], [67, 78, 28, 15]]
    }
  ];

  let current = 0;
  let timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));

  /* the frame's size in pixels, fitted into the stage */
  function fit(layout) {
    const fill = 0.9;
    const w = Math.min(root.clientWidth * fill, root.clientHeight * fill * layout.aspect);
    screen.style.width = w + 'px';
    screen.style.height = w / layout.aspect + 'px';
    screen.style.borderRadius = layout.radius + 'px';
  }

  function place(layout) {
    boxes.forEach((box, i) => {
      const [left, top, width, height] = layout.rects[i];
      Object.assign(box.style, { left: left + '%', top: top + '%', width: width + '%', height: height + '%' });
      if (box !== pay) box.style.background = `var(--color-${COLORS[layout.colors[i]]})`;
    });
  }

  function show(on) {
    boxes.forEach((box, i) => {
      box.style.transitionDelay = (on ? i * 110 : i * 35) + 'ms';
      box.classList.toggle('is-in', on);
    });
  }

  function build() {
    const layout = LAYOUTS[current];
    pay.classList.remove('is-ready', 'is-pressed');
    show(false);
    later(450, () => {
      place(layout);
      fit(layout);
    });
    later(1150, () => show(true));
    later(2300, () => {
      pay.style.transitionDelay = '0ms';
      pay.classList.add('is-ready');
    });
    later(2900, () => pay.classList.add('is-pressed'));
    later(5000, () => {
      current = (current + 1) % LAYOUTS.length;
      build();
    });
  }

  if (reduceMotion) {
    place(LAYOUTS[0]);
    fit(LAYOUTS[0]);
    show(true);
    pay.classList.add('is-ready');
  } else {
    build();
  }

  window.addEventListener('resize', () => fit(LAYOUTS[current]));

  /* nobody is looking: start over from a clean frame when they come back */
  document.addEventListener('visibilitychange', () => {
    if (reduceMotion) return;
    timers.forEach(clearTimeout);
    timers = [];
    if (!document.hidden) build();
  });
})();
