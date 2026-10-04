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

const statsPanel = document.getElementById('statsPanel');
const statsDisplay = document.getElementById('statsDisplay');
const movesDisplay = document.getElementById('moveCount');
const targetCountDisplay = document.getElementById('targetsHit');
const timerDisplay = document.getElementById('timerDisplay');
const statusDisplay = document.getElementById('gameStatus');

function analyzeSplits(completed) {
  const rates = completed
    .filter((stat) => stat.moves > 0 && Number.isFinite(Number(stat.split)))
    .map((stat) => Number(stat.split) / stat.moves)
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
  const { median, threshold } = analyzeSplits(stats.slice(1, targetCount + 1));
  document.getElementById('statsNote').textContent =
    threshold === null
      ? 'Time comparison after 5 targets.'
      : 'Slow splits account for moves taken.';
  statsDisplay.innerHTML = stats
    .slice(1)
    .map((stat, i) => {
      const completed = i < targetCount;
      const extra = completed ? stat.moves - stat.optimal : 0;
      const rate = completed ? Number(stat.split) / stat.moves : 0;
      const slow = completed && threshold !== null && rate > threshold;
      const moveTitle =
        extra > 0
          ? `${extra} extra move${extra === 1 ? '' : 's'} above the best route`
          : completed
            ? 'Matches the best route'
            : '';
      const timeTitle = slow
        ? `${rate.toFixed(2)} seconds per move; run median ${median.toFixed(2)} seconds per move`
        : '';
      return `<tr>
      <th scope="row">${stat.square}</th><td>${stat.optimal}</td>
      <td class="${extra > 0 ? 'extra-moves' : ''}" title="${moveTitle}">${completed ? stat.moves : '—'}${extra > 0 ? `<span class="extra-badge" aria-label="${moveTitle}">+${extra}</span>` : ''}</td>
      <td class="${slow ? 'slow-split' : ''}" title="${timeTitle}">${completed ? `${Number(stat.split).toFixed(2)}s` : '—'}${slow ? `<span class="slow-dot" role="img" aria-label="Slow split: ${timeTitle}"></span>` : ''}</td>
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

document.getElementById('reset').addEventListener('click', () => {
  board.position(initialPosition, false);
  currentSquare = targets[0].square;
  nextTarget = targets[1].square;
  finished = false;
  moveCount = targetCount = 0;
  stats.forEach((stat) => {
    stat.moves = stat.time = stat.split = 0;
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

// Offline support. A new app version is applied only between games so a reload never loses a run.
let swRegistration = null;
let controllerChanged = false;
function applyPendingUpdate() {
  if (moveCount !== 0 || !swRegistration) return;
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
