const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function game(globals = {}) {
  const elements = new Map();
  const colors = new Map();
  const intervals = new Set();
  let now = 1000;
  let position;
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        textContent: '', innerHTML: '',
        classList: {
          remove: name => classes.delete(name),
          toggle: name => classes.has(name) ? classes.delete(name) : classes.add(name),
          contains: name => classes.has(name),
        },
        addEventListener(event, handler) { this[event] = handler; },
      });
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element, addEventListener() {} }, window: {},
    performance: { now: () => now },
    setInterval(fn) { intervals.add(fn); return fn; },
    clearInterval(fn) { intervals.delete(fn); },
    Chessboard: () => ({ position(value) { position = value; }, resize() {} }),
    $: selector => ({
      css(property, value) {
        if (selector === '#board .square-55d63') colors.clear();
        else colors.set(selector, value);
      },
      resize() {},
    }),
    ...globals,
  });
  const run = code => vm.runInContext(code, context);
  run(readFileSync(new URL('../main.js', `file://${__filename}`), 'utf8'));
  return { run, element, colors, intervals, advance: ms => now += ms, position: () => position };
}

// Independently enumerate safe squares and shortest knight paths.
const safe = [];
for (let rank = 8; rank >= 1; rank--) {
  for (let file = 7; file >= 0; file--) {
    if (file !== 3 && rank !== 5 && Math.abs(file - 3) !== Math.abs(rank - 5)) {
      safe.push(String.fromCharCode(97 + file) + rank);
    }
  }
}
function path(source, target) {
  const queue = [[source]];
  const seen = new Set([source]);
  for (const route of queue) {
    const last = route.at(-1);
    if (last === target) return route.slice(1);
    for (const square of safe) {
      const dx = Math.abs(square.charCodeAt(0) - last.charCodeAt(0));
      const dy = Math.abs(Number(square[1]) - Number(last[1]));
      if (dx * dy === 2 && !seen.has(square)) {
        seen.add(square);
        queue.push([...route, square]);
      }
    }
  }
  throw new Error(`No route from ${source} to ${target}`);
}

test('targets cover all safe squares in order and best counts are shortest paths', () => {
  const g = game();
  assert.deepEqual(JSON.parse(g.run('JSON.stringify(targets.map(t => t.square))')), safe);
  const optimal = JSON.parse(g.run('JSON.stringify(targets.map(t => t.optimal))'));
  assert.deepEqual(optimal, safe.map((square, i) => i ? path(safe[i - 1], square).length : 0));
  assert.match(g.element('statsDisplay').innerHTML, /<th>e8<\/th>/);
});

test('rejects illegal, attacked, and off-board drops and prevents moving the queen', () => {
  const g = game();
  for (const target of ['offboard', 'h7', 'f7', 'd5']) {
    assert.equal(g.run(`config.onDrop('h8', '${target}')`), 'snapback');
  }
  assert.equal(g.run("config.onDragStart('d5', 'bQ')"), false);
  assert.equal(g.run('moveCount'), 0);
  assert.equal(g.intervals.size, 0);
  assert.equal(g.run("config.onDrop('h8', 'g6')"), undefined);
  assert.equal(g.run('moveCount'), 1);
  assert.equal(g.intervals.size, 1);
});

test('complete a tour, freeze final results, then reset and start again', () => {
  const g = game();
  g.run('config.onDragMove()');
  let source = safe[0];
  let moves = 0;
  for (const target of safe.slice(1)) {
    for (const destination of path(source, target)) {
      g.advance(1100);
      assert.equal(g.run(`config.onDrop('${source}', '${destination}')`), undefined);
      source = destination;
      moves++;
    }
  }
  assert.equal(g.run('finished'), true);
  assert.equal(g.run('nextTarget'), null);
  assert.equal(g.run('targetCount'), 35);
  assert.equal(g.run('moveCount'), moves);
  assert.equal(g.intervals.size, 0);
  const finalTime = new Date(moves * 1100).toISOString().slice(11, 19);
  assert.equal(g.element('timerDisplay').textContent, finalTime);
  g.advance(5000);
  assert.equal(g.run("config.onDrop('a1', 'c2')"), 'snapback');
  assert.equal(g.run("config.onDragStart('a1', 'wN')"), false);
  g.run('config.onDragMove()');
  assert.equal(g.intervals.size, 0);
  assert.equal(g.run('moveCount'), moves);
  assert.equal(g.element('timerDisplay').textContent, finalTime);
  g.element('reset').click();
  assert.equal(g.run('finished'), false);
  assert.equal(g.run('moveCount + targetCount'), 0);
  assert.equal(g.run('stats.every(s => s.moves === 0 && s.time === 0 && s.split === 0)'), true);
  assert.equal(g.element('timerDisplay').textContent, '00:00:00');
  assert.equal(g.position(), g.run('initialPosition'));
  g.run("config.onDrop('h8', 'g6')");
  assert.equal(g.intervals.size, 1);
});

test('hiding targets preserves Queen Vision, including after reset', () => {
  const g = game();
  g.element('queenVision').click();
  g.element('showTarget').click();
  assert.equal(g.colors.get('#board .square-d5'), '#202020');
  assert.notEqual(g.colors.get('#board .square-f8'), '#FF0000');
  g.element('reset').click();
  assert.equal(g.colors.get('#board .square-d5'), '#202020');
  g.element('showTarget').click();
  assert.equal(g.colors.get('#board .square-f8'), '#FF0000');
});

test('app updates wait until no game is in progress', async () => {
  const listeners = {};
  const posted = [];
  let reloads = 0;
  const registration = {
    waiting: null,
    addEventListener(event, handler) { listeners[event] = handler; },
    update: async () => {},
  };
  const serviceWorker = {
    controller: {},
    addEventListener(event, handler) { listeners[event] = handler; },
    register: async () => registration,
  };
  const g = game({ navigator: { serviceWorker }, location: { reload: () => reloads++ } });
  await new Promise(setImmediate);

  // Start a game, then a new version finishes installing.
  g.run("config.onDrop('h8', 'g6')");
  const installing = { state: 'installing', addEventListener(event, handler) { this.onchange = handler; } };
  registration.installing = installing;
  listeners.updatefound();
  installing.state = 'installed';
  registration.waiting = { postMessage: message => posted.push(message) };
  installing.onchange();
  assert.deepEqual(posted, [], 'no update while a game is in progress');

  // Another tab activates it: still no reload mid-game.
  listeners.controllerchange();
  assert.equal(reloads, 0);

  // Resetting applies the update.
  g.element('reset').click();
  assert.equal(reloads, 1);
});

test('a waiting update is activated straight away when idle', async () => {
  const posted = [];
  const registration = {
    waiting: { postMessage: message => posted.push(message) },
    addEventListener() {},
    update: async () => {},
  };
  const serviceWorker = { controller: {}, addEventListener() {}, register: async () => registration };
  game({ navigator: { serviceWorker }, location: { reload() {} } });
  await new Promise(setImmediate);
  assert.deepEqual(posted, ['skipWaiting']);
});
