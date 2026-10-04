const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function game(globals = {}) {
  const elements = new Map();
  const squareClasses = new Map();
  const intervals = new Set();
  let now = 1000;
  let position;
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        textContent: '',
        innerHTML: '',
        style: {},
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
        classList: {
          remove: (name) => classes.delete(name),
          toggle: (name) =>
            classes.has(name) ? classes.delete(name) : classes.add(name),
          contains: (name) => classes.has(name),
        },
        addEventListener(event, handler) {
          this[event] = handler;
        },
      });
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    document: {
      getElementById: element,
      querySelector: () => null,
      addEventListener() {},
    },
    window: {},
    performance: { now: () => now },
    setInterval(fn) {
      intervals.add(fn);
      return fn;
    },
    clearInterval(fn) {
      intervals.delete(fn);
    },
    Chessboard: () => ({
      position(value) {
        position = value;
      },
      resize() {},
    }),
    $: (selector) => ({
      addClass(name) {
        if (!squareClasses.has(selector))
          squareClasses.set(selector, new Set());
        squareClasses.get(selector).add(name);
      },
      removeClass(names) {
        for (const classes of squareClasses.values())
          for (const name of names.split(' ')) classes.delete(name);
      },
      attr() {},
      resize() {},
    }),
    ...globals,
  });
  const run = (code) => vm.runInContext(code, context);
  run(readFileSync(new URL('../main.js', `file://${__filename}`), 'utf8'));
  return {
    run,
    element,
    squareClasses,
    intervals,
    advance: (ms) => (now += ms),
    position: () => position,
  };
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
  assert.deepEqual(
    JSON.parse(g.run('JSON.stringify(targets.map(t => t.square))')),
    safe,
  );
  const optimal = JSON.parse(
    g.run('JSON.stringify(targets.map(t => t.optimal))'),
  );
  assert.deepEqual(
    optimal,
    safe.map((square, i) => (i ? path(safe[i - 1], square).length : 0)),
  );
  assert.match(g.element('statsDisplay').innerHTML, /<th scope="row">e8<\/th>/);
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
      assert.equal(
        g.run(`config.onDrop('${source}', '${destination}')`),
        undefined,
      );
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
  g.element('confirmReset').click();
  assert.equal(g.run('finished'), false);
  assert.equal(g.run('moveCount + targetCount'), 0);
  assert.equal(
    g.run('stats.every(s => s.moves === 0 && s.time === 0 && s.split === 0)'),
    true,
  );
  assert.equal(g.element('timerDisplay').textContent, '00:00:00');
  assert.equal(g.position(), g.run('initialPosition'));
  g.run("config.onDrop('h8', 'g6')");
  assert.equal(g.intervals.size, 1);
});

test('target, queen, and knight hints remain independent and persist after reset', () => {
  const g = game();
  const has = (square, name) =>
    g.squareClasses.get(`#board .square-${square}`)?.has(name) ?? false;
  assert.equal(has('f8', 'next-target'), true);
  assert.equal(has('g6', 'knight-available'), true);
  g.element('queenVision').click();
  g.element('showTarget').click();
  g.element('knightVision').click();
  assert.equal(has('d5', 'queen-attacked'), true);
  assert.equal(has('f8', 'next-target'), false);
  assert.equal(has('g6', 'knight-available'), false);
  assert.equal(g.element('nextTargetDisplay').textContent, '••');
  assert.equal(
    g.element('nextTargetButton').attributes['aria-pressed'],
    'false',
  );
  assert.equal(
    g.run("config.onDrop('h8', 'g6')"),
    undefined,
    'moves remain legal with hints hidden',
  );
  g.element('confirmReset').click();
  assert.equal(has('d5', 'queen-attacked'), true);
  assert.equal(has('g6', 'knight-available'), false);
  g.element('nextTargetButton').click();
  assert.equal(has('f8', 'next-target'), true);
  assert.equal(g.element('showTarget').attributes['aria-pressed'], 'true');
  assert.equal(g.element('nextTargetDisplay').textContent, 'f8');
  g.element('knightVision').click();
  assert.equal(has('g6', 'knight-available'), true);
});

test('timer continues while hidden and restores elapsed time', () => {
  const g = game();
  g.run("config.onDrop('h8', 'g6')");
  g.element('showTimer').click();
  g.advance(61000);
  g.run('updateTimer()');
  assert.equal(g.element('timerDisplay').textContent, '--:--:--');
  assert.equal(g.intervals.size, 1);
  g.element('showTimer').click();
  assert.equal(g.element('timerDisplay').textContent, '00:01:01');
  assert.equal(g.element('showTimer').attributes['aria-pressed'], 'true');
});

test('stats mark only excess moves and slow completed splits, normalized by actual moves', () => {
  const g = game();
  g.run(`targetCount = 8;
    const sample = [[2,4],[5,10],[6,12],[9,18],[7,14],[3,17],[6,12],[8,42]];
    sample.forEach(([moves,split],i) => Object.assign(stats[i+1], { moves, split }));
    updateStatsDisplay();`);
  const html = g.element('statsDisplay').innerHTML;
  assert.equal((html.match(/class="extra-moves"/g) || []).length, 3);
  assert.equal((html.match(/class="slow-split"/g) || []).length, 2);
  const rows = html.split('<tr>').slice(1);
  assert.doesNotMatch(rows[0], /extra-moves|slow-split/);
  assert.doesNotMatch(
    rows[4],
    /slow-split/,
    'a longer route at normal pace is not slow',
  );
  assert.match(rows[5], /slow-split/, 'a perfect route may still be slow');
  assert.doesNotMatch(
    rows[8],
    /extra-moves|slow-split/,
    'unfinished targets have no warnings',
  );
  g.run('targetCount = 4; updateStatsDisplay()');
  assert.doesNotMatch(
    g.element('statsDisplay').innerHTML,
    /class="slow-split"/,
  );
  assert.equal(
    g.element('statsNote').textContent,
    'Time comparison after 5 targets.',
  );
});

test('slow split thresholds handle an even median and small timing differences', () => {
  const g = game();
  assert.equal(g.run('analyzeSplits([]).threshold'), null);
  assert.equal(
    g.run(
      'analyzeSplits([1,2,3,4,5,6].map(split => ({moves:1,split}))).median',
    ),
    3.5,
  );
  assert.equal(
    g.run('analyzeSplits(Array(5).fill({moves:1,split:0})).threshold'),
    0.75,
  );
  assert.equal(
    g.run('analyzeSplits(Array(5).fill({moves:1,split:2})).threshold'),
    3.5,
  );
});

test('best routes are safe and shortest for every pair of safe squares', () => {
  const g = game();
  for (const source of safe) {
    for (const target of safe) {
      const route = JSON.parse(
        g.run(`JSON.stringify(shortestRoute('${source}', '${target}'))`),
      );
      assert.equal(route[0], source);
      assert.equal(route.at(-1), target);
      assert.equal(
        route.length - 1,
        source === target ? 0 : path(source, target).length,
      );
      for (let i = 1; i < route.length; i++) {
        assert.ok(safe.includes(route[i]));
        assert.equal(
          g.run(`legalKnight('${route[i - 1]}', '${route[i]}')`),
          true,
        );
      }
    }
  }
  assert.equal(g.run("shortestRoute('h8', null).length"), 0);
});

test('route cache reuses the remaining path and searches only for new destinations', () => {
  const g = game();
  g.run("const initialRoute = routeForPosition('h8', 'a1')");
  const initial = JSON.parse(g.run('JSON.stringify(initialRoute)'));
  assert.equal(g.run("routeForPosition('h8', 'a1') === initialRoute"), true);
  const trees = g.run('routeTrees.size');
  g.run(`const remainingRoute = routeForPosition('${initial[1]}', 'a1')`);
  assert.deepEqual(
    JSON.parse(g.run('JSON.stringify(remainingRoute)')),
    initial.slice(1),
  );
  assert.equal(g.run('routeTrees.size'), trees);
  assert.equal(
    g.run(`routeForPosition('${initial[1]}', 'a1') === remainingRoute`),
    true,
  );
  const detour = safe.find((square) => !initial.includes(square));
  assert.deepEqual(
    JSON.parse(g.run(`JSON.stringify(routeForPosition('${detour}', 'a1'))`)),
    JSON.parse(g.run(`JSON.stringify(shortestRoute('${detour}', 'a1'))`)),
  );
  assert.equal(g.run('routeTrees.size'), trees);
  g.run("routeForPosition('h8', 'f8')");
  assert.equal(g.run('routeTrees.size'), trees + 1);
  assert.equal(g.run("shortestRoute('h8', 'a8').length"), 0);
  assert.equal(g.run("routeForPosition('h8', null).length"), 0);
});

test('rewind clears only the current leg and preserves elapsed time and completed stats', () => {
  const g = game();
  g.run("config.onDrop('h8', 'g6')");
  const start = g.run('t_start');
  g.advance(5000);
  g.element('rewind').click();
  assert.equal(g.run('currentSquare'), 'h8');
  assert.equal(g.run('moveCount'), 0);
  assert.equal(g.run('stats[1].moves'), 0);
  assert.equal(g.run('undoCount'), 1);
  assert.equal(g.run('t_start'), start);
  assert.equal(g.intervals.size, 1);
  assert.equal(g.element('timerDisplay').textContent, '00:00:05');
  g.element('rewind').click();
  assert.equal(g.run('undoCount'), 1, 'empty legs do not count as rewinds');
  g.run("config.onDrop('h8', 'g6')");
  g.advance(1000);
  g.run("config.onDrop('g6', 'f8')");
  const completed = g.run('JSON.stringify(stats[1])');
  assert.equal(g.run('stats[1].moves'), 2);
  assert.equal(g.run('stats[1].rewinds'), 1);
  assert.equal(g.run('Number(stats[1].split)'), 6);
  g.run("config.onDrop('f8', 'g6')");
  g.element('rewind').click();
  assert.equal(g.run('currentSquare'), 'f8');
  assert.equal(g.run('nextTarget'), 'e8');
  assert.equal(g.run('moveCount'), 2);
  assert.equal(g.run('targetCount'), 1);
  assert.equal(g.run('undoCount'), 2);
  assert.equal(g.run('stats[2].rewinds'), 1);
  assert.equal(g.run('JSON.stringify(stats[1])'), completed);
  g.element('confirmReset').click();
  assert.equal(g.run('undoCount'), 0);
  assert.equal(g.run('stats.every(s => s.rewinds === 0)'), true);
  assert.equal(g.run('t_start'), null);
});

test('reset opens confirmation and cancellation preserves the run', () => {
  const g = game();
  g.run("config.onDrop('h8', 'g6')");
  g.element('reset').click();
  assert.equal(g.element('resetConfirm').open, true);
  assert.equal(g.run('moveCount'), 1);
  g.element('cancelReset').click();
  assert.equal(g.element('resetConfirm').open, false);
  assert.equal(g.run('currentSquare'), 'g6');
  assert.equal(g.intervals.size, 1);
  g.element('reset').click();
  g.element('confirmReset').click();
  assert.equal(g.element('resetConfirm').open, false);
  assert.equal(g.run('currentSquare'), 'h8');
  assert.equal(g.run('moveCount'), 0);
  assert.equal(g.intervals.size, 0);
});

test('app updates wait until no game is in progress', async () => {
  const listeners = {};
  const posted = [];
  let reloads = 0;
  const registration = {
    waiting: null,
    addEventListener(event, handler) {
      listeners[event] = handler;
    },
    update: async () => {},
  };
  const serviceWorker = {
    controller: {},
    addEventListener(event, handler) {
      listeners[event] = handler;
    },
    register: async () => registration,
  };
  const g = game({
    navigator: { serviceWorker },
    location: { reload: () => reloads++ },
  });
  await new Promise(setImmediate);

  // Start a game, then a new version finishes installing.
  g.run("config.onDrop('h8', 'g6')");
  const installing = {
    state: 'installing',
    addEventListener(event, handler) {
      this.onchange = handler;
    },
  };
  registration.installing = installing;
  listeners.updatefound();
  installing.state = 'installed';
  registration.waiting = { postMessage: (message) => posted.push(message) };
  installing.onchange();
  assert.deepEqual(posted, [], 'no update while a game is in progress');

  // Rewinding to zero moves still leaves a run in progress.
  g.element('rewind').click();
  assert.equal(g.run('moveCount'), 0);
  assert.equal(g.run('t_start !== null'), true);
  g.run('applyPendingUpdate()');
  assert.deepEqual(posted, []);

  // Another tab activates it: still no reload mid-game.
  listeners.controllerchange();
  assert.equal(reloads, 0);

  // Resetting applies the update.
  g.element('confirmReset').click();
  assert.equal(reloads, 1);
});

test('a waiting update is activated straight away when idle', async () => {
  const posted = [];
  const registration = {
    waiting: { postMessage: (message) => posted.push(message) },
    addEventListener() {},
    update: async () => {},
  };
  const serviceWorker = {
    controller: {},
    addEventListener() {},
    register: async () => registration,
  };
  game({ navigator: { serviceWorker }, location: { reload() {} } });
  await new Promise(setImmediate);
  assert.deepEqual(posted, ['skipWaiting']);
});
