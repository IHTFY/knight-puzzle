'use strict';

const initialPosition = '7N/8/8/3q4/8/8/8/8 w - - 0 1';
// Target order and best move counts are shared by gameplay and the stats table.
const targets = [
  { square: 'h8', optimal: 0 },
  { square: 'f8', optimal: 2 },
  { square: 'e8', optimal: 3 },
  { square: 'c8', optimal: 6 },
  { square: 'b8', optimal: 9 },
  { square: 'h7', optimal: 5 },
  { square: 'g7', optimal: 3 },
  { square: 'e7', optimal: 6 },
  { square: 'c7', optimal: 6 },
  { square: 'a7', optimal: 8 },
  { square: 'h6', optimal: 8 },
  { square: 'g6', optimal: 5 },
  { square: 'f6', optimal: 3 },
  { square: 'b6', optimal: 6 },
  { square: 'a6', optimal: 7 },
  { square: 'h4', optimal: 7 },
  { square: 'g4', optimal: 5 },
  { square: 'f4', optimal: 3 },
  { square: 'b4', optimal: 6 },
  { square: 'a4', optimal: 5 },
  { square: 'h3', optimal: 4 },
  { square: 'g3', optimal: 3 },
  { square: 'e3', optimal: 2 },
  { square: 'c3', optimal: 4 },
  { square: 'a3', optimal: 2 },
  { square: 'h2', optimal: 4 },
  { square: 'f2', optimal: 2 },
  { square: 'e2', optimal: 3 },
  { square: 'c2', optimal: 4 },
  { square: 'b2', optimal: 5 },
  { square: 'g1', optimal: 4 },
  { square: 'f1', optimal: 3 },
  { square: 'e1', optimal: 3 },
  { square: 'c1', optimal: 6 },
  { square: 'b1', optimal: 3 },
  { square: 'a1', optimal: 3 },
];
const stats = targets.map((target) => ({
  ...target,
  moves: 0,
  time: 0,
  split: 0,
  rewinds: 0,
}));
let nextTarget = targets[1].square;
let currentSquare = targets[0].square;
let showTargets = true;
let showTimer = true;
let showMoves = true;
let qv = false;
let finished = false;
let timerInterval = null;
let moveCount = 0;
let targetCount = 0;
let t_start = null;
let undoCount = 0;
let showRoute = false;
const routeGraph = new Map();
const routeTrees = new Map();
let cachedRoute = [],
  cachedDestination = null;
function shortestRoute(source, target) {
  if (!target || inQVision(source) || inQVision(target)) return [];
  if (!routeGraph.size) {
    for (const file of 'abcdefgh')
      for (let rank = 1; rank <= 8; rank++) {
        const square = file + rank;
        if (inQVision(square)) continue;
        const neighbors = [];
        for (const [dx, dy] of [
          [-2, -1],
          [-2, 1],
          [-1, -2],
          [-1, 2],
          [1, -2],
          [1, 2],
          [2, -1],
          [2, 1],
        ]) {
          const f = file.charCodeAt(0) + dx,
            r = rank + dy;
          if (f < 97 || f > 104 || r < 1 || r > 8) continue;
          const next = String.fromCharCode(f) + r;
          if (!inQVision(next)) neighbors.push(next);
        }
        routeGraph.set(square, neighbors);
      }
  }
  if (!routeGraph.has(source) || !routeGraph.has(target)) return [];
  let distances = routeTrees.get(target);
  if (!distances) {
    distances = new Map([[target, 0]]);
    const queue = [target];
    for (let head = 0; head < queue.length; head++) {
      const square = queue[head];
      for (const next of routeGraph.get(square))
        if (!distances.has(next)) {
          distances.set(next, distances.get(square) + 1);
          queue.push(next);
        }
    }
    routeTrees.set(target, distances);
  }
  if (!distances.has(source)) return [];
  const path = [source];
  while (path.at(-1) !== target) {
    const square = path.at(-1);
    path.push(
      routeGraph
        .get(square)
        .find((next) => distances.get(next) === distances.get(square) - 1),
    );
  }
  return path;
}
function routeForPosition(source, target) {
  if (target === cachedDestination && cachedRoute[0] === source)
    return cachedRoute;
  if (target === cachedDestination && cachedRoute[1] === source)
    cachedRoute = cachedRoute.slice(1);
  else cachedRoute = shortestRoute(source, target);
  cachedDestination = target;
  return cachedRoute;
}

const flowOptions = {
  style: 'amber',
  speed: 160,
  curve: 0.7,
  width: 10,
  numbers: true,
  animate: true,
};
let flowFrame = 0;
let flowPhase = 0;
let flowLastTime = 0;
let flowGeometry = null,
  flowScene = null,
  flowDrawingKey = null;
const flowPalettes = {};

const reducedFlow = matchMedia('(prefers-reduced-motion: reduce)');

const statsPanel = document.getElementById('statsPanel');
const statsDisplay = document.getElementById('statsDisplay');
const movesDisplay = document.getElementById('moveCount');
const targetCountDisplay = document.getElementById('targetsHit');
const timerDisplay = document.getElementById('timerDisplay');
const statusDisplay = document.getElementById('gameStatus');

function analyzeSplits(completed) {
  const rates = completed
    .filter((stat) => stat.optimal > 0 && Number.isFinite(Number(stat.split)))
    .map((stat) => Number(stat.split) / stat.optimal)
    .sort((a, b) => a - b);
  const n = rates.length;
  const median = n
    ? n % 2
      ? rates[(n - 1) / 2]
      : (rates[n / 2 - 1] + rates[n / 2]) / 2
    : null;
  return {
    median,
    threshold: n >= 5 ? Math.max(median * 1.75, median + 0.75) : null,
  };
}

function updateStatsDisplay() {
  const longestSplit = Math.max(
    0,
    ...stats
      .slice(1, targetCount + 1)
      .map((stat) => Math.max(0, Number(stat.split) || 0)),
  );
  const { median, threshold } = analyzeSplits(stats.slice(1, targetCount + 1));
  statsDisplay.innerHTML = stats
    .slice(1)
    .map((stat, i) => {
      const completed = i < targetCount;
      const extra = completed ? stat.moves - stat.optimal : 0;
      const rate =
        completed && stat.optimal > 0 ? Number(stat.split) / stat.optimal : 0;
      const slow = completed && threshold !== null && rate > threshold;
      const cutoffSeconds =
        completed && threshold !== null && stat.optimal > 0
          ? threshold * stat.optimal
          : null;
      const fill =
        completed && longestSplit > 0
          ? Math.min(
              100,
              (Math.max(0, Number(stat.split) || 0) / longestSplit) * 100,
            )
          : 0;
      const cutoff =
        cutoffSeconds !== null && longestSplit > 0
          ? (cutoffSeconds / longestSplit) * 100
          : null;
      const excess = cutoff === null ? 0 : Math.max(0, fill - cutoff);
      const moveTitle =
        extra > 0
          ? `${extra} extra move${extra === 1 ? '' : 's'} above the best route`
          : completed
            ? 'Matches the best route'
            : '';
      const timeTitle = slow
        ? `${rate.toFixed(2)} seconds per optimal move; cutoff ${cutoffSeconds.toFixed(2)}s for ${stat.optimal} optimal moves; ${(Number(stat.split) - cutoffSeconds).toFixed(2)}s above cutoff`
        : '';
      return `<tr>
      <th scope="row">${stat.square}</th><td>${stat.optimal}</td>
      <td class="${extra > 0 ? 'extra-moves' : ''}" >${completed ? stat.moves : '—'}${extra > 0 ? `<button class="stat-modifier extra-badge" aria-haspopup="dialog" aria-controls="statTip" aria-expanded="false" data-stat-tip="extra" data-stat-note="${moveTitle}" aria-label="${moveTitle}. Show explanation">+${extra}</button>` : ''}</td>
      <td class="split-cell ${slow ? 'slow-split' : ''}" style="--split-fill:${fill}%;--split-base:${cutoff === null ? fill : Math.min(fill, cutoff)}%;--split-cutoff:${cutoff === null ? 0 : Math.min(100, cutoff)}%;--split-excess:${excess}%" data-cutoff-seconds="${cutoffSeconds === null ? '' : cutoffSeconds}" >${completed ? `${Number(stat.split).toFixed(2)}s` : '—'}${slow ? `<button class="stat-modifier slow-dot" aria-haspopup="dialog" aria-controls="statTip" aria-expanded="false" data-stat-tip="slow" data-stat-note="${timeTitle}" aria-label="Slow split. Show explanation"></button>` : ''}</td>
      <td class="undo-cell">${completed ? stat.rewinds : '—'}</td>
    </tr>`;
    })
    .join('');
}

function inQVision(square) {
  return (
    square[0] === 'd' ||
    square[1] === '5' ||
    Math.abs(square.charCodeAt(0) - 100) === Math.abs(Number(square[1]) - 5)
  );
}

function legalKnight(source, target) {
  const dx = Math.abs(source.charCodeAt(0) - target.charCodeAt(0));
  const dy = Math.abs(source.charCodeAt(1) - target.charCodeAt(1));
  return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
}

function startTimer() {
  if (t_start !== null || finished) return;
  t_start = performance.now();
  stats[0].time = t_start;
  timerInterval = setInterval(updateTimer, 1000);
}

function renderHighlights() {
  $('#board .square-55d63').removeClass(
    'queen-attacked knight-available next-target',
  );
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank++) {
      const square = file + rank;
      const cell = $(`#board .square-${square}`);
      const attacked = inQVision(square);
      if (qv && attacked) cell.addClass('queen-attacked');
      if (
        showMoves &&
        !finished &&
        !attacked &&
        legalKnight(currentSquare, square)
      ) {
        cell.addClass('knight-available');
      }
      if (showTargets && square === nextTarget) cell.addClass('next-target');
      cell.attr({
        role: 'button',
        tabindex: square === currentSquare ? 0 : -1,
        'aria-label':
          square +
          (square === currentSquare
            ? ', knight'
            : square === 'd5'
              ? ', queen'
              : '') +
          (showTargets && square === nextTarget ? ', next target' : '') +
          (qv && attacked ? ', attacked by queen' : ''),
      });
    }
  }
  document.getElementById('nextTargetDisplay').textContent = showTargets
    ? nextTarget || '✓'
    : '••';
  document
    .getElementById('showTarget')
    .setAttribute('aria-pressed', String(showTargets));
  document
    .getElementById('nextTargetButton')
    .setAttribute('aria-pressed', String(showTargets));
  document.getElementById('progress').style.width =
    `${(targetCount / (targets.length - 1)) * 100}%`;
  document.getElementById('undoCount').textContent = undoCount;
  document.getElementById('rewind').disabled =
    finished || !stats[targetCount + 1]?.moves;
  document.getElementById('showRoute').disabled = finished;
  renderRoute();
}

function announceTarget() {
  statusDisplay.textContent = finished
    ? 'All targets reached. Open Stats to review your run.'
    : showTargets
      ? `Reach ${nextTarget} next.`
      : 'Target hidden.';
}

const config = {
  draggable: true,
  pieceTheme: 'images/pieces/{piece}.svg',
  position: initialPosition,
  onDragStart: (source, piece) => {
    if (finished || piece !== 'wN') return false;
  },
  onDrop: (source, target) => {
    if (
      finished ||
      source !== currentSquare ||
      !/^[a-h][1-8]$/.test(target) ||
      inQVision(target) ||
      !legalKnight(source, target)
    )
      return 'snapback';
    startTimer();
    currentSquare = target;
    movesDisplay.textContent = ++moveCount;
    stats[targetCount + 1].moves++;
    if (target === nextTarget) {
      targetCountDisplay.textContent = ++targetCount;
      stats[targetCount].time = performance.now();
      stats[targetCount].split = (
        (stats[targetCount].time - stats[targetCount - 1].time) /
        1000
      ).toFixed(2);
      nextTarget = targets[targetCount + 1]?.square ?? null;
      if (nextTarget === null) {
        finished = true;
        showRoute = false;
        document
          .getElementById('showRoute')
          .setAttribute('aria-pressed', 'false');
        clearInterval(timerInterval);
        timerInterval = null;
      }
      updateStatsDisplay();
    }
    renderHighlights();
    updateTimer();
    announceTarget();
  },
  onDragMove: startTimer,
  onSnapEnd: renderHighlights,
};
const board = Chessboard('board', config);
renderHighlights();
updateStatsDisplay();

// Clicking a destination supplements dragging; both use the same validation.
const boardElement = document.getElementById('board');
function moveTo(square) {
  const source = currentSquare;
  if (config.onDrop(source, square) === 'snapback') return;
  board.move(`${source}-${square}`, false);
  renderHighlights();
}
boardElement.addEventListener('click', (event) => {
  const square = event.target.closest('[data-square]')?.dataset.square;
  if (square && square !== currentSquare) moveTo(square);
});
boardElement.addEventListener('keydown', (event) => {
  const cell = event.target.closest('[data-square]');
  if (!cell) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    moveTo(cell.dataset.square);
    boardElement.querySelector(`[data-square="${currentSquare}"]`)?.focus();
    return;
  }
  const offset = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
  }[event.key];
  if (!offset) return;
  event.preventDefault();
  const file = cell.dataset.square.charCodeAt(0) + offset[0];
  const rank = Number(cell.dataset.square[1]) + offset[1];
  if (file >= 97 && file <= 104 && rank >= 1 && rank <= 8) {
    boardElement
      .querySelector(`[data-square="${String.fromCharCode(file)}${rank}"]`)
      ?.focus();
  }
});

document.getElementById('confirmReset').addEventListener('click', () => {
  document.getElementById('resetConfirm').close();
  board.position(initialPosition, false);
  currentSquare = targets[0].square;
  nextTarget = targets[1].square;
  finished = false;
  moveCount = targetCount = undoCount = 0;
  showRoute = false;
  document.getElementById('showRoute').setAttribute('aria-pressed', 'false');
  stats.forEach((stat) => {
    stat.moves = stat.time = stat.split = stat.rewinds = 0;
  });
  movesDisplay.textContent = targetCountDisplay.textContent = 0;
  t_start = null;
  clearInterval(timerInterval);
  timerInterval = null;
  renderHighlights();
  updateTimer();
  updateStatsDisplay();
  announceTarget();
  applyPendingUpdate();
});

function updateTimer() {
  const elapsed =
    t_start === null
      ? 0
      : (finished ? stats.at(-1).time : performance.now()) - t_start;
  const seconds = Math.floor(elapsed / 1000);
  const duration = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  timerDisplay.textContent = showTimer ? duration : '--:--:--';
}

document
  .getElementById('reset')
  .addEventListener('click', () =>
    document.getElementById('resetConfirm').showModal(),
  );
document
  .getElementById('cancelReset')
  .addEventListener('click', () =>
    document.getElementById('resetConfirm').close(),
  );

document.getElementById('showTimer').addEventListener('click', () => {
  showTimer = !showTimer;
  document
    .getElementById('showTimer')
    .setAttribute('aria-pressed', String(showTimer));
  updateTimer();
});

function toggleTargets() {
  showTargets = !showTargets;
  renderHighlights();
  announceTarget();
}
document.getElementById('showTarget').addEventListener('click', toggleTargets);
document
  .getElementById('nextTargetButton')
  .addEventListener('click', toggleTargets);
document.getElementById('queenVision').addEventListener('click', () => {
  qv = !qv;
  document
    .getElementById('queenVision')
    .setAttribute('aria-pressed', String(qv));
  renderHighlights();
});
document.getElementById('knightVision').addEventListener('click', () => {
  showMoves = !showMoves;
  document
    .getElementById('knightVision')
    .setAttribute('aria-pressed', String(showMoves));
  renderHighlights();
});

document.getElementById('statsButton').addEventListener('click', () => {
  updateStatsDisplay();
  statsPanel.showModal();
});
document
  .getElementById('closeStats')
  .addEventListener('click', () => statsPanel.close());
statsPanel.addEventListener('click', (event) => {
  if (event.target !== statsPanel) return;
  const bounds = statsPanel.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    statsPanel.close();
});

function resizeBoard() {
  board.resize();
  renderHighlights();
}
$(window).resize(resizeBoard);
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(resizeBoard).observe(
    document.getElementById('boardContainer'),
  );
}

function flowCurves(points) {
  const k = flowOptions.curve / 6;
  const tangents = points.map((p, i) => {
    const before = points[Math.max(0, i - 1)],
      after = points[Math.min(points.length - 1, i + 1)];
    const x = (after.x - before.x) * k,
      y = (after.y - before.y) * k;
    const scale = Math.min(
      1,
      x ? Math.min(p.x - 30, 770 - p.x) / Math.abs(x) : 1,
      y ? Math.min(p.y - 30, 770 - p.y) / Math.abs(y) : 1,
    );
    return { x: x * scale, y: y * scale };
  });
  return points.slice(1).map((b, i) => {
    const a = points[i],
      ta = tangents[i],
      tb = tangents[i + 1];
    return [
      a,
      { x: a.x + ta.x, y: a.y + ta.y },
      { x: b.x - tb.x, y: b.y - tb.y },
      b,
    ];
  });
}
function curveCommand(c) {
  return `C ${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${c[3].x} ${c[3].y}`;
}
function flowPath(points) {
  return (
    `M ${points[0].x} ${points[0].y} ` +
    flowCurves(points).map(curveCommand).join(' ')
  );
}
function cubicPoint(c, t) {
  const u = 1 - t,
    a = u * u * u,
    b = 3 * u * u * t,
    d = 3 * u * t * t,
    e = t * t * t;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  };
}
function buildFlowGeometry(route) {
  const points = route.map((square) => ({
    x: (square.charCodeAt(0) - 97) * 100 + 50,
    y: (8 - Number(square[1])) * 100 + 50,
  }));
  let distance = 0;
  const steps = flowCurves(points).map((c) => {
    const samples = [{ t: 0, length: 0 }],
      start = distance;
    let length = 0,
      previous = c[0];
    for (let i = 1; i <= 48; i++) {
      const t = i / 48,
        p = cubicPoint(c, t);
      length += Math.hypot(p.x - previous.x, p.y - previous.y);
      samples.push({ t, length });
      previous = p;
    }
    function atLength(value) {
      let lo = 0,
        hi = samples.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].length < value) lo = mid;
        else hi = mid;
      }
      const a = samples[lo],
        b = samples[hi],
        mix = (value - a.length) / (b.length - a.length || 1);
      return cubicPoint(c, a.t + (b.t - a.t) * mix);
    }
    const segments = [],
      count = Math.ceil(length / 12);
    for (let i = 0; i < count; i++) {
      const from = (length * i) / count,
        to = (length * (i + 1)) / count;
      const a = atLength(from),
        m = atLength((from + to) / 2),
        b = atLength(to);
      segments.push({
        d: `M ${a.x} ${a.y} Q ${2 * m.x - (a.x + b.x) / 2} ${2 * m.y - (a.y + b.y) / 2} ${b.x} ${b.y}`,
        distance: start + (from + to) / 2,
      });
    }
    distance += length;
    return { command: curveCommand(c), segments };
  });
  return { route: [...route], curve: flowOptions.curve, points, steps };
}
function flowPalette(style) {
  if (flowPalettes[style]) return flowPalettes[style];
  const size = style === 'rainbow' ? 600 : 360,
    colors = [];
  for (let i = 0; i < size; i++) {
    const wave = i / 2,
      pulse = Math.exp(-Math.pow((wave - 110) / 24, 2));
    colors.push(
      style === 'rainbow'
        ? `hsl(${wave * 1.2} 85% 73%)`
        : style === 'white'
          ? `rgb(${Math.round(124 + 131 * pulse)},${Math.round(167 + 88 * pulse)},${Math.round(222 + 33 * pulse)})`
          : style === 'still'
            ? '#e5c78f'
            : `rgb(${Math.round(197 + 58 * pulse)},${Math.round(146 + 105 * pulse)},${Math.round(63 + 172 * pulse)})`,
    );
  }
  return (flowPalettes[style] = colors);
}
function paintFlow(time) {
  flowFrame = 0;
  if (!flowScene) return;
  const animate =
    flowOptions.animate &&
    flowOptions.style !== 'still' &&
    !reducedFlow.matches &&
    !document.hidden;
  if (animate && flowLastTime)
    flowPhase += (Math.min(time - flowLastTime, 64) / 1000) * flowOptions.speed;
  flowLastTime = animate ? time : 0;
  const colors = flowPalette(flowOptions.style),
    period = colors.length;
  for (const segment of flowScene.segments) {
    const index =
        ((Math.floor((segment.distance - flowPhase) * 2) % period) + period) %
        period,
      color = colors[index];
    if (segment.color !== color) {
      segment.element.setAttribute('stroke', color);
      segment.color = color;
    }
  }
  if (animate) flowFrame = requestAnimationFrame(paintFlow);
}
function refreshFlowAnimation() {
  cancelAnimationFrame(flowFrame);
  flowFrame = 0;
  paintFlow(performance.now());
}
function renderRoute() {
  const overlay = document.getElementById('routeOverlay'),
    realBoard = document.querySelector('.board-b72b1');
  if (!realBoard) return;
  const rect = realBoard.getBoundingClientRect(),
    wrap = document.getElementById('boardContainer'),
    bounds = wrap.getBoundingClientRect();
  const layout = [
    rect.left - bounds.left - wrap.clientLeft,
    rect.top - bounds.top - wrap.clientTop,
    rect.width,
    rect.height,
  ];
  if (overlay.dataset.layout !== layout.join(',')) {
    overlay.dataset.layout = layout.join(',');
    Object.assign(overlay.style, {
      left: layout[0] + 'px',
      top: layout[1] + 'px',
      width: layout[2] + 'px',
      height: layout[3] + 'px',
    });
  }
  const destination = nextTarget;
  const route = showRoute ? routeForPosition(currentSquare, destination) : [];
  const drawingKey = `${showRoute}:${route.join(',')}:${flowOptions.curve}:${flowOptions.width}:${flowOptions.numbers}`;
  if (drawingKey === flowDrawingKey) return;
  flowDrawingKey = drawingKey;
  const steps = Math.max(0, route.length - 1);
  document.getElementById('routeCount').textContent = showRoute
    ? `${steps} move${steps === 1 ? '' : 's'}`
    : '';
  document.getElementById('routeSummary').textContent = showRoute
    ? `Best route from ${currentSquare}: ${route.join(', ')}.`
    : '';
  cancelAnimationFrame(flowFrame);
  flowFrame = 0;
  if (route.length < 2) {
    overlay.innerHTML = '';
    flowScene = null;
    flowLastTime = 0;
    return;
  }
  let offset = flowGeometry?.route.indexOf(route[0]) ?? -1;
  if (
    !flowGeometry ||
    flowGeometry.curve !== flowOptions.curve ||
    offset < 0 ||
    flowGeometry.route.slice(offset).join(',') !== route.join(',')
  ) {
    flowGeometry = buildFlowGeometry(route);
    offset = 0;
  }
  // Following a route keeps its remaining curves and their original arc lengths.
  const geometry = flowGeometry,
    points = geometry.points.slice(offset),
    remaining = geometry.steps.slice(offset);
  const d =
    `M ${points[0].x} ${points[0].y} ` +
    remaining.map((step) => step.command).join(' ');
  const segments = remaining
    .flatMap((step) => step.segments)
    .slice()
    .reverse();
  const paths = segments
    .map(
      (segment, i) =>
        `<path data-flow-segment="${segments.length - 1 - i}" d="${segment.d}"/>`,
    )
    .join('');
  const labels = flowOptions.numbers
    ? points
        .slice(1)
        .map(
          (p, i) =>
            `<g data-route-step="${i + 1}"><rect class="flow-step-bg" x="${p.x - 15}" y="${p.y - 14}" width="30" height="28" rx="9"/><text class="flow-step" x="${p.x}" y="${p.y}">${i + 1}</text></g>`,
        )
        .reverse()
        .join('')
    : '';
  overlay.innerHTML = `<path id="flowTrack" d="${d}" fill="none" stroke="#d8bb7f" stroke-opacity=".55" stroke-width="${flowOptions.width}" stroke-linecap="round" stroke-linejoin="round"/><g id="flowSegments" fill="none" stroke-width="${flowOptions.width}" stroke-linecap="round" stroke-linejoin="round">${paths}</g><g id="flowLabels">${labels}</g>`;
  const elements = overlay.querySelectorAll('#flowSegments path');
  flowScene = {
    segments: segments.map((segment, i) => ({
      element: elements[i],
      distance: segment.distance,
      color: null,
    })),
  };
  refreshFlowAnimation();
}
function updateMotion() {
  refreshFlowAnimation();
}
reducedFlow.addEventListener('change', updateMotion);
document.addEventListener('visibilitychange', () => {
  flowLastTime = 0;
  refreshFlowAnimation();
});

document.getElementById('showRoute').addEventListener('click', () => {
  showRoute = !showRoute;
  document
    .getElementById('showRoute')
    .setAttribute('aria-pressed', String(showRoute));
  renderRoute();
  statusDisplay.textContent = showRoute
    ? document.getElementById('routeSummary').textContent
    : 'Route hidden.';
});
document.getElementById('rewind').addEventListener('click', () => {
  if (finished || !stats[targetCount + 1]?.moves) return;
  moveCount -= stats[targetCount + 1].moves;
  stats[targetCount + 1].moves = 0;
  stats[targetCount + 1].rewinds++;
  undoCount++;
  currentSquare = targets[targetCount].square;
  board.position({ [currentSquare]: 'wN', d5: 'bQ' }, false);
  movesDisplay.textContent = moveCount;
  renderHighlights();
  updateTimer();
  updateStatsDisplay();
  statusDisplay.textContent = `Rewound to ${currentSquare}. Timer continues. ${undoCount} rewinds used.`;
});
const howTo = document.getElementById('howTo');
const helpCarousel = document.getElementById('helpCarousel');
let helpStep = 0,
  helpScrollFrame = 0;
function updateHelpDots(index) {
  if (helpStep !== index)
    document.getElementById('helpAnnouncement').textContent = [
      'Move',
      'Stay safe',
      'Reach targets',
    ][index];
  helpStep = index;
  document
    .querySelectorAll('[data-help-dot]')
    .forEach((b, i) => b.setAttribute('aria-current', i === index));
}
function showHelpStep(index, instant = false) {
  index = Math.max(0, Math.min(2, index));
  helpCarousel.scrollTo({
    left: helpCarousel.clientWidth * index,
    behavior: instant || reducedFlow.matches ? 'instant' : 'smooth',
  });
  updateHelpDots(index);
}
document.getElementById('howToButton').onclick = () => {
  howTo.showModal();
  showHelpStep(0, true);
};
document.getElementById('closeHowTo').onclick = () => howTo.close();
document.querySelectorAll('[data-help-dot]').forEach((b) => {
  b.onclick = () => showHelpStep(Number(b.dataset.helpDot));
});
helpCarousel.addEventListener('scroll', () => {
  cancelAnimationFrame(helpScrollFrame);
  helpScrollFrame = requestAnimationFrame(() =>
    updateHelpDots(
      Math.round(helpCarousel.scrollLeft / helpCarousel.clientWidth),
    ),
  );
});
function helpKeys(e) {
  let next = helpStep;
  if (e.key === 'ArrowRight') next = Math.min(2, helpStep + 1);
  else if (e.key === 'ArrowLeft') next = Math.max(0, helpStep - 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = 2;
  else return;
  e.preventDefault();
  showHelpStep(next);
  if (e.target.matches('[data-help-dot]'))
    document.querySelector(`[data-help-dot="${next}"]`).focus();
}
helpCarousel.addEventListener('keydown', helpKeys);
document.querySelector('.help-dots').addEventListener('keydown', helpKeys);
let helpDrag = null;
helpCarousel.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  helpDrag = { x: e.clientX, left: helpCarousel.scrollLeft };
  helpCarousel.setPointerCapture(e.pointerId);
  helpCarousel.style.scrollSnapType = 'none';
});
helpCarousel.addEventListener('pointermove', (e) => {
  if (helpDrag)
    helpCarousel.scrollLeft = helpDrag.left + helpDrag.x - e.clientX;
});
function endHelpDrag() {
  if (!helpDrag) return;
  helpDrag = null;
  helpCarousel.style.scrollSnapType = '';
  showHelpStep(Math.round(helpCarousel.scrollLeft / helpCarousel.clientWidth));
}
helpCarousel.addEventListener('pointerup', endHelpDrag);
helpCarousel.addEventListener('pointercancel', endHelpDrag);
window.addEventListener('resize', () => {
  if (howTo.open) showHelpStep(helpStep, true);
});
document
  .querySelectorAll('[data-help-piece]')
  .forEach((img) =>
    img.setAttribute('href', `images/pieces/${img.dataset.helpPiece}.svg`),
  );
howTo.addEventListener('click', (e) => {
  if (e.target === howTo) {
    const r = howTo.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      howTo.close();
  }
});
const statTip = document.getElementById('statTip');
let tipOwner = null,
  tipPinned = false;
function statExplanation(key) {
  const { median, threshold } = analyzeSplits(stats.slice(1, targetCount + 1));
  const copy = {
    square: [
      'Square',
      'The target for this leg. Each leg starts at the previous target.',
    ],
    best: ['Best', 'Fewest safe knight moves from the previous target.'],
    moves: [
      'Moves',
      'Moves kept for this leg. Rewind clears moves on the unfinished leg.',
    ],
    split: [
      'Split time',
      'Time to reach this target, including retries. Bar width compares this time with the longest split. Blue shows used time up to the slow cutoff; red shows excess. The remaining space is unused. One seconds-per-optimal-move cutoff applies to every completed row, using its optimal move count, and updates throughout the run. Extra moves do not raise the time allowance. Hidden timer time still counts.',
    ],
    rewinds: [
      'Rewinds',
      `${undoCount} used this run. Each row counts retries for that target. Rewind keeps the timer running.`,
    ],
    extra: [
      'Extra moves',
      'Amber +N is how many moves exceeded the best route. Matching routes stay unmarked.',
    ],
    slow: [
      'Slow split',
      threshold === null
        ? 'Compared after 5 targets. Split time per optimal move must exceed both 1.75× the run median and the median + 0.75 seconds. Retries count toward time.'
        : `Split time per optimal move exceeds ${threshold.toFixed(2)} seconds. This is the higher of 1.75× the run median or the median + 0.75 seconds. Retries count toward time.`,
    ],
  };
  return copy[key];
}
function hideStatTip() {
  if (statTip.matches(':popover-open')) statTip.hidePopover();
  if (tipOwner) {
    tipOwner.setAttribute('aria-expanded', 'false');
    tipOwner.removeAttribute('aria-describedby');
  }
  tipOwner = null;
  tipPinned = false;
}
function showStatTip(owner, pin = false) {
  if (tipOwner === owner && tipPinned && !pin) return;
  hideStatTip();
  tipOwner = owner;
  tipPinned = pin;
  const [title, text] = statExplanation(owner.dataset.statTip);
  document.getElementById('statTipTitle').textContent = title;
  document.getElementById('statTipText').textContent =
    (owner.dataset.statNote ? owner.dataset.statNote + '. ' : '') + text;
  owner.setAttribute('aria-expanded', 'true');
  owner.setAttribute('aria-describedby', 'statTipText');
  statTip.showPopover();
  const r = owner.getBoundingClientRect(),
    box = statTip.getBoundingClientRect();
  statTip.style.left =
    Math.max(
      12,
      Math.min(
        innerWidth - box.width - 12,
        r.left + r.width / 2 - box.width / 2,
      ),
    ) + 'px';
  const below = r.bottom + 8;
  statTip.style.top =
    Math.max(
      12,
      Math.min(
        innerHeight - box.height - 12,
        below + box.height < innerHeight - 12 ? below : r.top - box.height - 8,
      ),
    ) + 'px';
}
statsPanel.addEventListener('pointerover', (e) => {
  const b = e.target.closest('[data-stat-tip]');
  if (b && e.pointerType === 'mouse' && !tipPinned) showStatTip(b);
});
statsPanel.addEventListener('pointerout', (e) => {
  const b = e.target.closest('[data-stat-tip]');
  if (
    b &&
    b === tipOwner &&
    !tipPinned &&
    !b.contains(e.relatedTarget) &&
    !statTip.contains(e.relatedTarget)
  )
    hideStatTip();
});
statsPanel.addEventListener('focusin', (e) => {
  const b = e.target.closest('[data-stat-tip]');
  if (b && !tipPinned) showStatTip(b);
});
statsPanel.addEventListener('focusout', (e) => {
  if (
    !tipPinned &&
    !statTip.contains(e.relatedTarget) &&
    !e.relatedTarget?.closest('[data-stat-tip]')
  )
    hideStatTip();
});
statsPanel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-stat-tip]');
  if (b) {
    if (tipOwner === b && tipPinned) hideStatTip();
    else showStatTip(b, true);
  } else if (!statTip.contains(e.target)) hideStatTip();
});
document.getElementById('closeStatTip').onclick = () => hideStatTip();
statsPanel.addEventListener('cancel', (e) => {
  if (statTip.matches(':popover-open')) {
    e.preventDefault();
    hideStatTip();
  }
});
statsPanel.addEventListener('close', hideStatTip);
statsPanel.querySelector('.table-wrap').addEventListener('scroll', hideStatTip);
window.addEventListener('resize', hideStatTip);
document.querySelectorAll('[data-stat-tip]').forEach((b) => {
  b.setAttribute('aria-controls', 'statTip');
  b.setAttribute('aria-haspopup', 'dialog');
  b.setAttribute('aria-expanded', 'false');
});

updateMotion();

// Offline support. A new app version is applied only between games so a reload never loses a run.
let swRegistration = null;
let controllerChanged = false;
function applyPendingUpdate() {
  if (t_start !== null || !swRegistration) return;
  if (controllerChanged) location.reload();
  else if (swRegistration.waiting && navigator.serviceWorker.controller) {
    swRegistration.waiting.postMessage('skipWaiting');
  }
}
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first install takes control without a reload; later ones swap in the new version.
    if (!hadController) return;
    controllerChanged = true;
    applyPendingUpdate();
  });
  navigator.serviceWorker
    .register('./service-worker.js')
    .then((registration) => {
      swRegistration = registration;
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') applyPendingUpdate();
        });
      });
      applyPendingUpdate();
      // Installed apps can stay open for days, so check for updates when brought back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible')
          registration.update().catch(() => {});
      });
    })
    .catch((err) => console.error('Service worker not registered.', err));
}
