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
const stats = targets.map(target => ({ ...target, moves: 0, time: 0, split: 0 }));
let nextTarget = targets[1].square;
let showTargets = true;
let qv = false;
let finished = false;
let timerInterval = null;
let moveCount = 0;
let targetCount = 0;
let t_start = null;

const statsDisplay = document.getElementById('statsDisplay');
const movesDisplay = document.getElementById('moveCount');
const targetCountDisplay = document.getElementById('targetsHit');
const timerDisplay = document.getElementById('timerDisplay');

function updateStatsDisplay() {
  statsDisplay.innerHTML = stats.map(stat => `<tr>
    <th>${stat.square}</th><td>${stat.optimal}</td>
    <td>${stat.moves}</td><td>${stat.split}</td>
  </tr>`).join('');
}

function inQVision(square) {
  // Queen on d5;
  if (square[0] === "d" || square[1] === "5") {
    return true;
  }
  const dx = Math.abs(square.charCodeAt(0) - 100); // 'd'.charCodeAt(0)
  const dy = Math.abs(square[1] - 5);
  return dx === dy;
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
  clearHighlights();
  showQV();
  highlightSquare(nextTarget);
}

function clearHighlights() {
  $('#board .square-55d63').css('background', '');
}

function highlightSquare(square) {
  if (showTargets && square) {
    $(`#board .square-${square}`).css('background', '#FF0000');
  }
}

const config = {
  draggable: true,
  pieceTheme:
    'images/pieces/{piece}.svg',
  position: initialPosition,
  onDragStart: (source, piece) => {
    if (finished || piece !== "wN") {
      return false;
    }
  },
  onDrop: (source, target) => {
    // snapback if attacked by queen (or capturing), or illegal
    if (finished || !/^[a-h][1-8]$/.test(target) || inQVision(target) || !legalKnight(source, target)) {
      return "snapback";
    }
    startTimer();
    movesDisplay.textContent = ++moveCount;
    if (stats[targetCount + 1]) {
      stats[targetCount + 1].moves++;
    }
    if (target === nextTarget) {
      targetCountDisplay.textContent = ++targetCount;
      stats[targetCount].time = performance.now();
      stats[targetCount].split = ((stats[targetCount].time - stats[targetCount - 1].time) / 1000).toFixed(2);
      updateStatsDisplay();
      nextTarget = targets[targetCount + 1]?.square ?? null;
      if (nextTarget === null) {
        finished = true;
        updateTimer();
        clearInterval(timerInterval);
        timerInterval = null;
        timerDisplay.classList.remove('is-hidden');
      }
      renderHighlights();
    }
  },
  onDragMove: startTimer,
};
const board = Chessboard("board", config);
highlightSquare(nextTarget);
updateStatsDisplay();

document.getElementById('reset').addEventListener('click', () => {
  board.position(initialPosition, false);
  nextTarget = targets[1].square;
  finished = false;
  moveCount = 0;
  stats.forEach(o => { o.moves = 0; o.time = 0; o.split = 0; })
  movesDisplay.textContent = moveCount;
  targetCount = 0;
  targetCountDisplay.textContent = targetCount;
  renderHighlights();
  t_start = null;
  clearInterval(timerInterval);
  timerInterval = null;
  updateTimer();
  updateStatsDisplay();
});

function updateTimer() {
  let t_end = performance.now();
  let ms = t_start === null ? 0 : Math.trunc(t_end - t_start);
  let duration = new Date(ms).toISOString().slice(11, 19);
  document.getElementById('timerDisplay').textContent = duration;
}

const showTimerButton = document.getElementById('showTimer');
showTimerButton.addEventListener('click', () => {
  document.getElementById('timerDisplay').classList.toggle('is-hidden');
});

const showTargetButton = document.getElementById('showTarget');
showTargetButton.addEventListener('click', () => {
  showTargets = !showTargets;
  showTargetButton.textContent = showTargets ? 'Hide Target' : 'Show Target';
  renderHighlights();
});

function showQV() {
  let color = qv ? '#202020' : '';
  for (let j of 'abcdefgh') {
    for (let i = 1; i <= 8; i++) {
      if (inQVision(j + i)) {
        $(`#board .square-${j + i}`).css('background-color', color);
      }
    }
  }
}

document.getElementById('queenVision').addEventListener('click', () => {
  qv = !qv;
  showQV();
});

document.getElementById('statsButton').addEventListener('click', () => {
  statsDisplay.parentElement.classList.toggle('is-hidden');
});

$(window).resize(() => {
  board.resize();
  renderHighlights();
});
