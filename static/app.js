/* Cassis Order Protocol — five live examples.
 *
 * Nothing here is a recording. The server describes a page, the person
 * poking at it decides what happens next, and the server answers with
 * whatever that implies. Prices, totals and invoices are all worked out
 * from what was actually tapped and typed.
 *
 * Each example is its own merchant, with its own server, and none of them
 * knows about the others.
 */
(() => {
  'use strict';

  const root = document.querySelector('[data-examples]');
  if (!root) return;

  const q = (sel) => root.querySelector(sel);

  const ui = {
    menu: q('[data-example-menu]'),
    screen: q('[data-example-screen]')
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usd = (n) => '$' + n.toFixed(2);
  const SATS_PER_USD = 4000;
  const sats = (n) => Math.round(n * SATS_PER_USD).toLocaleString('en-GB') + ' sats';

  /* tip jar */
  const PRESETS = [2, 5, 10];

  /* ramen bar, table 12 */
  const BILL_ITEMS = [
    ['2 × Shoyu ramen', 22],
    ['1 × Gyoza', 5.5],
    ['1 × Iced green tea', 3]
  ];
  const BILL = BILL_ITEMS.reduce((sum, line) => sum + line[1], 0);
  const TIPS = { none: 0, ten: 0.1, twenty: 0.2 };

  /* pizza delivery */
  const PIZZAS = {
    margherita: { name: 'Margherita', price: 8.5 },
    pepperoni: { name: 'Pepperoni', price: 10 },
    funghi: { name: 'Funghi', price: 9.5 }
  };
  const TOPPINGS = {
    none: { name: 'No extra topping', price: 0 },
    olives: { name: 'Olives', price: 1 },
    chili: { name: 'Chili', price: 0.75 }
  };

  /* gym membership */
  const MONTH = 40;
  const UNUSED_DAYS = 18;
  const REFUND = (MONTH * UNUSED_DAYS) / 30;

  const pizza = (c) => PIZZAS[c.pizza] || null;
  const extra = (c) => TOPPINGS[c.topping] || TOPPINGS.none;
  const total = (c) => (pizza(c) ? pizza(c).price : 0) + extra(c).price;
  const summary = (c) =>
    (pizza(c) ? pizza(c).name : '') + (c.topping && c.topping !== 'none' ? ' + ' + extra(c).name.toLowerCase() : '');

  const given = (c) => {
    const amount = parseFloat(c.amount);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  };
  const tipAmount = (c) => Math.round(BILL * (TIPS[c.tip] || 0) * 100) / 100;
  const billTotal = (c) => BILL + tipAmount(c);

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

  const items = (lines, from) => {
    const list = h('div', 'screen-items');
    lines.forEach((line, i) => {
      const row = h('div', 'screen-item');
      row.append(h('span', null, line[0]), h('span', null, line[1]));
      at(row, from + i * 0.04);
      list.append(row);
    });
    return list;
  };

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

  /* the screen once the money has moved: it stays up until you leave */
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
    return box;
  }

  /* an invoice arrived: the wallet's payment screen */
  function payScreen({ to, amount, memo, done = false }) {
    if (done) {
      return {
        pay: true,
        body: [h('p', 'pay-top', 'Payment sent'), settled({ heading: 'Paid', amount, line: 'to ' + to, memo })]
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
          settled({
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
        at(h('p', 'screen-title', 'Tip the band'), 0.05),
        at(h('p', 'screen-sub', 'The Lanterns, playing on the square tonight'), 0.1),
        at(label('How much?'), 0.16),
        at(presets, 0.22),
        at(field('amount', '0.00'), 0.32),
        at(label('Your name (optional)'), 0.38),
        at(field('name', 'Anon'), 0.42),
        at(label('A message (optional)'), 0.46),
        at(field('message', 'play the encore'), 0.5),
        at(btn('screen-btn screen-btn-lime screen-btn-wide', 'Send the tip', 'submit', { needs: 'amount' }), 0.58),
        at(code('"bind": ', '"tip.amount"'), 0.66)
      ]
    };
  }

  /* ramen bar: a bill in dollars, a tip you choose, the same bill in sats */
  function bill(c) {
    const lines = BILL_ITEMS.map((line) => [line[0], usd(line[1])]);
    const body = [
      h('p', 'screen-note', 'server → client · ' + (c.tip ? 'signal' : 'element')),
      at(h('p', 'screen-title', 'Table 12'), 0.05),
      at(items(lines, 0.12), 0.12),
      at(money('Subtotal', usd(BILL)), 0.26)
    ];

    const chips = h('div', 'screen-chips');
    Object.keys(TIPS).forEach((id, i) => {
      const name = id === 'none' ? 'No tip' : id === 'ten' ? '10%' : '20%';
      const chosen = (c.tip || 'none') === id;
      const chip = h('button', 'screen-chip screen-chip-money' + (chosen ? ' is-picked' : ''));
      chip.append(h('span', null, name), h('em', null, chosen ? usd(tipAmount({ ...c, tip: id })) : 'tap to add'));
      at(chip, 0.34 + i * 0.06);
      tap(chip, 'tip:' + id);
      chips.append(chip);
    });

    body.push(
      at(label('Add a tip'), 0.3),
      at(chips, 0.34),
      at(money('Total', usd(billTotal(c))), 0.44),
      at(h('p', 'screen-total-sats', sats(billTotal(c))), 0.5),
      at(btn('screen-btn screen-btn-lime screen-btn-wide', 'Pay ' + usd(billTotal(c)), 'pay'), 0.58)
    );
    return { surface: 'table_12', body };
  }

  /* pizza delivery: menu, toppings, address */
  function menu() {
    const list = h('div', 'screen-list');
    Object.keys(PIZZAS).forEach((id, i) => {
      const row = h('button', 'screen-row');
      row.append(h('span', null, PIZZAS[id].name), h('span', 'screen-price', usd(PIZZAS[id].price)));
      at(row, 0.18 + i * 0.1);
      tap(row, 'pizza:' + id);
      list.append(row);
    });
    return {
      surface: 'pizza_menu',
      body: [
        h('p', 'screen-note', 'server → client · element'),
        at(h('p', 'screen-title', 'Choose your pizza'), 0.05),
        at(list, 0.18),
        at(code('each row: button → action ', 'selectPizza { "pizza": … }'), 0.6)
      ]
    };
  }

  function toppings(c) {
    const chips = h('div', 'screen-chips');
    Object.keys(TOPPINGS).forEach((id, i) => {
      const chip = h('button', 'screen-chip' + (id === 'none' ? ' screen-chip-quiet' : ''));
      chip.append(h('span', null, TOPPINGS[id].name), h('em', null, id === 'none' ? '' : '+' + usd(TOPPINGS[id].price)));
      at(chip, 0.3 + i * 0.1);
      tap(chip, 'topping:' + id);
      chips.append(chip);
    });
    return {
      surface: 'pizza_menu',
      body: [
        h('p', 'screen-note', 'server → client · element'),
        at(h('p', 'screen-title', 'Your order'), 0.05),
        at(rowLine(pizza(c).name + ' — ' + usd(pizza(c).price)), 0.14),
        at(h('p', 'screen-sub', 'Add an extra topping?'), 0.24),
        at(chips, 0.3)
      ]
    };
  }

  function checkout(c) {
    const model = h('p', 'screen-mono screen-mono-dim');
    model.dataset.show = 'address';
    return {
      surface: 'pizza_menu',
      body: [
        h('p', 'screen-note', 'server → client · element'),
        at(h('p', 'screen-title', 'Where should we deliver?'), 0.05),
        at(rowLine(summary(c)), 0.12),
        at(money('Total', usd(total(c))), 0.2),
        at(label('Delivery address'), 0.26),
        at(field('address', '221B Baker St, London'), 0.32),
        at(model, 0.38),
        at(btn('screen-btn screen-btn-lime screen-btn-wide', 'Pay ' + usd(total(c)), 'pay', { needs: 'address' }), 0.46),
        at(code('"bind": ', '"order.address"'), 0.54)
      ]
    };
  }

  /* gym: the membership, as the server sees it */
  function membership() {
    return {
      surface: 'membership',
      body: [
        h('p', 'screen-note', 'server → client · element'),
        at(h('p', 'screen-title', 'Iron Club Gym'), 0.05),
        at(rowLine('Active · paid until 12 Oct'), 0.14),
        at(h('p', 'screen-sub', UNUSED_DAYS + ' days left this month.'), 0.2),
        at(money('Next month', usd(MONTH)), 0.26),
        at(btn('screen-btn screen-btn-lime screen-btn-wide', 'Pay for next month', 'renew'), 0.34),
        at(btn('screen-btn screen-btn-coral screen-btn-wide', 'Cancel and refund ' + usd(REFUND), 'cancel'), 0.42)
      ]
    };
  }

  /* ------------------------------------------------------------------ *
   * the five flows
   *
   * A stage is what the client is showing, plus what the server does
   * about a tap. `act` is the server's answer: true moves on, a number
   * jumps to that stage, and { set } redraws the stage in place with new
   * state. Stages are built from the flow's own state, so the whole page
   * re-reads the choices that were made in it.
   * ------------------------------------------------------------------ */

  const CASE_LIST = [
    {
      id: 'till',
      name: 'Pay at the till',
      blurb: 'Scan the code on a till. An invoice comes straight back, with no page at all.',
      stages: [
        () => ({
          screen: () => payScreen({ to: 'Corner Café', amount: usd(3.4), memo: '1 × flat white' }),
          act: (key) => key === 'pay'
        }),
        () => ({
          screen: () => payScreen({ to: 'Corner Café', amount: usd(3.4), memo: '1 × flat white', done: true })
        })
      ]
    },

    {
      id: 'tip',
      name: 'Tip the band',
      blurb: 'A form with an amount, a name and a message. The invoice is for whatever you typed.',
      stages: [
        (c) => ({
          screen: () => tipForm(c),
          act: (key) =>
            key.startsWith('amount:') ? { set: { amount: key.slice(7) } } : key === 'submit' && given(c) > 0
        }),
        (c) => ({
          screen: () => payScreen({ to: 'The Lanterns', amount: usd(given(c)), memo: c.name ? 'Tip from ' + c.name : 'Tip' }),
          act: (key) => key === 'pay'
        }),
        (c) => ({
          screen: () => payScreen({ to: 'The Lanterns', amount: usd(given(c)), memo: c.name ? 'Tip from ' + c.name : 'Tip', done: true })
        })
      ]
    },

    {
      id: 'table',
      name: 'Pay the table',
      blurb: 'The bill for table 12 at a ramen bar, a tip you choose, and the total in sats.',
      stages: [
        (c) => ({
          screen: () => bill(c),
          act: (key) => (key.startsWith('tip:') ? { set: { tip: key.slice(4) } } : key === 'pay')
        }),
        (c) => ({
          screen: () => payScreen({ to: 'Kōji Ramen', amount: sats(billTotal(c)), memo: 'Table 12 · ' + usd(billTotal(c)) + ' incl. tip' }),
          act: (key) => key === 'pay'
        }),
        (c) => ({
          screen: () =>
            payScreen({ to: 'Kōji Ramen', amount: sats(billTotal(c)), memo: 'Table 12 · ' + usd(billTotal(c)) + ' incl. tip', done: true })
        })
      ]
    },

    {
      id: 'pizza',
      name: 'Pizza delivery',
      blurb: 'A menu, toppings, an address field, and a pay button that is just a button.',
      stages: [
        () => ({
          screen: () => menu(),
          act: (key) => key.startsWith('pizza:') && { set: { pizza: key.slice(6) }, next: true }
        }),
        (c) => ({
          screen: () => toppings(c),
          act: (key) => key.startsWith('topping:') && { set: { topping: key.slice(8) }, next: true }
        }),
        (c) => ({
          screen: () => checkout(c),
          act: (key) => key === 'pay' && Boolean((c.address || '').trim())
        }),
        (c) => ({
          screen: () => payScreen({ to: 'Luigi’s Pizza', amount: usd(total(c)), memo: summary(c) }),
          act: (key) => key === 'pay'
        }),
        (c) => ({
          screen: () => payScreen({ to: 'Luigi’s Pizza', amount: usd(total(c)), memo: summary(c), done: true })
        })
      ]
    },

    {
      id: 'gym',
      name: 'Gym membership',
      blurb: 'Pay for next month, or cancel and get the unused days back.',
      stages: [
        /* 0 */ () => ({
          screen: () => membership(),
          act: (key) => (key === 'renew' ? true : key === 'cancel' ? 3 : false)
        }),
        /* 1 */ () => ({
          screen: () => payScreen({ to: 'Iron Club Gym', amount: usd(MONTH), memo: 'Membership · 12 Oct – 12 Nov' }),
          act: (key) => key === 'pay'
        }),
        /* 2 */ () => ({
          screen: () => payScreen({ to: 'Iron Club Gym', amount: usd(MONTH), memo: 'Membership · 12 Oct – 12 Nov', done: true })
        }),
        /* 3 */ () => ({
          screen: () => receiveScreen({ from: 'Iron Club Gym', amount: usd(REFUND), memo: 'Refund · ' + UNUSED_DAYS + ' unused days' }),
          act: (key) => key === 'accept'
        }),
        /* 4 */ () => ({
          screen: () => receiveScreen({ from: 'Iron Club Gym', amount: usd(REFUND), memo: 'Refund · ' + UNUSED_DAYS + ' unused days', done: true })
        })
      ]
    }
  ];

  /* ------------------------------------------------------------------ *
   * engine
   * ------------------------------------------------------------------ */

  const state = { caseIndex: 0, stageIndex: 0, ctx: {}, timer: 0, busy: false, raf: 0, p: 1 };
  let stage = null;
  let reveals = [];

  const flow = () => CASE_LIST[state.caseIndex];
  const totalStages = () => flow().stages.length;
  const reset = () => {
    state.ctx = {};
  };

  /* ---- case menu ---- */

  const caseButtons = CASE_LIST.map((entry, index) => {
    const button = h('button', 'demo-case');
    button.type = 'button';
    button.append(
      h('span', 'demo-case-num', String(index + 1).padStart(2, '0')),
      h('span', 'demo-case-name', entry.name),
      h('span', 'demo-case-blurb', entry.blurb)
    );
    button.addEventListener('click', () => {
      if (state.caseIndex === index) return;
      state.caseIndex = index;
      reset();
      enter(0);
    });
    ui.menu.append(button);
    return button;
  });

  /* ---- what is ready to send ---- */

  const ready = (need) => {
    if (need === 'address') return Boolean((state.ctx.address || '').trim());
    if (need === 'amount') return given(state.ctx) > 0;
    return true;
  };

  function refresh() {
    ui.screen.querySelectorAll('[data-needs]').forEach((node) => {
      node.disabled = !ready(node.dataset.needs);
    });
    ui.screen.querySelectorAll('[data-show]').forEach((node) => {
      if (node.dataset.show === 'address') node.textContent = 'order.address → ' + JSON.stringify(state.ctx.address || '');
    });
  }

  /* ---- render a stage ---- */

  function enter(index, { soft = false } = {}) {
    clearTimeout(state.timer);
    state.timer = 0;
    state.stageIndex = Math.max(0, Math.min(totalStages() - 1, index));
    stage = flow().stages[state.stageIndex](state.ctx);

    caseButtons.forEach((button, i) => {
      button.classList.toggle('is-current', i === state.caseIndex);
      if (i === state.caseIndex) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });

    const scene = stage.screen();
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
    phone.append(status, body, h('div', 'demo-home'));

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
   */

  function act(key, node) {
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
