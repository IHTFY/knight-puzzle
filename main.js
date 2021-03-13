let nextTarget = 'f8';
let showTargets = true;
let timerInterval;
let moveCount = 0;
let targetCount = 0;

let statsDisplay = document.getElementById('statsDisplay');

function updateStatsDisplay(stats) {
  let rows = [...statsDisplay.children];
  for (let i = 0; i < stats.length; i++) {
    rows[i].children[0].textContent = stats[i].square;
    rows[i].children[1].textContent = stats[i].optimal;
    rows[i].children[2].textContent = stats[i].moves;
    rows[i].children[3].textContent = stats[i].split;
  }

  // for (let obj of stats) {
  //   let tr = document.createElement('tr');
  //   tr.innerHTML = `<th>${obj.square}</th>
  //   <td>${obj.optimal}</td>
  //   <td>${obj.moves}</td>
  //   <td>${obj.split}</td>`;
  //   statsDisplay.appendChild(tr);
  // }
}

let stats = [
  {
    square: 'h8',
    moves: 0,
    optimal: 0,
    time: 0,
    split: 0,
  },
  {
    square: 'f8',
    moves: 0,
    optimal: 2,
    time: 0,
    split: 0,
  },
  {
    square: 'd8',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'c8',
    moves: 0,
    optimal: 6,
    time: 0,
    split: 0,
  },
  {
    square: 'b8',
    moves: 0,
    optimal: 9,
    time: 0,
    split: 0,
  },
  {
    square: 'h7',
    moves: 0,
    optimal: 5,
    time: 0,
    split: 0,
  },
  {
    square: 'g7',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'e7',
    moves: 0,
    optimal: 6,
    time: 0,
    split: 0,
  },
  {
    square: 'c7',
    moves: 0,
    optimal: 6,
    time: 0,
    split: 0,
  },
  {
    square: 'a7',
    moves: 0,
    optimal: 8,
    time: 0,
    split: 0,
  },
  {
    square: 'h6',
    moves: 0,
    optimal: 8,
    time: 0,
    split: 0,
  },
  {
    square: 'g6',
    moves: 0,
    optimal: 5,
    time: 0,
    split: 0,
  },
  {
    square: 'f6',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'b6',
    moves: 0,
    optimal: 6,
    time: 0,
    split: 0,
  },
  {
    square: 'a6',
    moves: 0,
    optimal: 7,
    time: 0,
    split: 0,
  },
  {
    square: 'h4',
    moves: 0,
    optimal: 7,
    time: 0,
    split: 0,
  },
  {
    square: 'g4',
    moves: 0,
    optimal: 5,
    time: 0,
    split: 0,
  },
  {
    square: 'f4',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'b4',
    moves: 0,
    optimal: 6,
    time: 0,
    split: 0,
  },
  {
    square: 'a4',
    moves: 0,
    optimal: 7,
    time: 0,
    split: 0,
  },
  {
    square: 'h3',
    moves: 0,
    optimal: 4,
    time: 0,
    split: 0,
  },
  {
    square: 'g3',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'e3',
    moves: 0,
    optimal: 2,
    time: 0,
    split: 0,
  },
  {
    square: 'c3',
    moves: 0,
    optimal: 4,
    time: 0,
    split: 0,
  },
  {
    square: 'a3',
    moves: 0,
    optimal: 2,
    time: 0,
    split: 0,
  },
  {
    square: 'h2',
    moves: 0,
    optimal: 4,
    time: 0,
    split: 0,
  },
  {
    square: 'f2',
    moves: 0,
    optimal: 2,
    time: 0,
    split: 0,
  },
  {
    square: 'e2',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'c2',
    moves: 0,
    optimal: 4,
    time: 0,
    split: 0,
  },
  {
    square: 'b2',
    moves: 0,
    optimal: 5,
    time: 0,
    split: 0,
  },
  {
    square: 'g1',
    moves: 0,
    optimal: 4,
    time: 0,
    split: 0,
  },
  {
    square: 'f1',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'e1',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'c1',
    moves: 0,
    optimal: 6,
    time: 0,
    split: 0,
  },
  {
    square: 'b1',
    moves: 0,
    optimal: 3,
    time: 0,
    split: 0,
  },
  {
    square: 'a1',
    time: 0,
    split: 0,
    moves: 0,
    optimal: 3,
  }
];


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

function getNextTarget(prev) {
  let file = prev.charCodeAt(0);
  let rank = prev[1];

  if (--file < 97) {
    file = 104;
    if (--rank < 1) {
      // rank = 8;
      let t_end = performance.now();
      let ms = Math.trunc(t_end - t_start);
      let duration = new Date(ms).toISOString().substr(11, 8);
      document.getElementById('timerDisplay').classList.remove('is-hidden');
      clearInterval(timerInterval);
    }
  }

  let next = String.fromCharCode(file) + rank;

  if (inQVision(next)) {
    next = getNextTarget(next);
  }
  return next;
}

function clearHighlights() {
  $('#board .square-55d63').css('background', '');
}

function highlightSquare(square) {
  if (showTargets) {
    $(`#board .square-${square}`).css('background', '#FF0000');
  }
}

let movesDisplay = document.getElementById('moveCount');
let targetCountDisplay = document.getElementById('targetsHit');
let t_start;
let t_checkpoint;

let config = {
  draggable: true,
  pieceTheme:
    "https://lichess1.org/assets/_v88h3i/piece/alpha/{piece}.svg",
  position: "7N/8/8/3q4/8/8/8/8 w - - 0 1",
  onDragStart: (source, piece) => {
    if (piece.includes("b")) {
      return false;
    }
  },
  onDrop: (source, target) => {
    // snapback if attacked by queen (or capturing), or illegal
    if (inQVision(target) || !legalKnight(source, target)) {
      return "snapback";
    }
    movesDisplay.textContent = ++moveCount;
    if (stats[targetCount + 1]) {
      stats[targetCount + 1].moves++;
    }
    if (target === nextTarget) {
      targetCountDisplay.textContent = ++targetCount;
      stats[targetCount].time = performance.now();
      stats[targetCount].split = ((stats[targetCount].time - stats[targetCount - 1].time) / 1000).toFixed(2);
      updateStatsDisplay(stats);
      nextTarget = getNextTarget(nextTarget);
      clearHighlights();
      showQV();
      highlightSquare(nextTarget);
    }
  },
  onDragMove: () => {
    if (moveCount === 0 && !timerInterval) {
      t_start = performance.now();
      stats[0].time = t_start;
      timerInterval = setInterval(updateTimer, 1000);
    }
  },
};
var board = Chessboard("board", config);
highlightSquare(nextTarget);
updateStatsDisplay(stats);

document.getElementById('reset').addEventListener('click', () => {
  board.position('7N/8/8/3q4/8/8/8/8 w - - 0 1');
  nextTarget = 'f8';
  moveCount = 0;
  stats.forEach(o => { o.moves = 0; o.time = 0; o.split = 0; })
  movesDisplay.textContent = moveCount;
  targetCount = 0;
  targetCountDisplay.textContent = targetCount;
  clearHighlights();
  showQV();
  highlightSquare(nextTarget);
  t_start = performance.now();
  clearInterval(timerInterval);
  timerInterval = null;
  updateTimer();
  updateStatsDisplay(stats);
});

function updateTimer() {
  let t_end = performance.now();
  let ms = Math.trunc(t_end - t_start);
  let duration = new Date(ms).toISOString().substr(11, 8);
  document.getElementById('timerDisplay').textContent = duration;
}

const showTimerButton = document.getElementById('showTimer');
showTimerButton.addEventListener('click', () => {
  document.getElementById('timerDisplay').classList.toggle('is-hidden');
});

const showTargetButton = document.getElementById('showTarget');
showTargetButton.addEventListener('click', () => {
  if (showTargets) {
    // turn off
    showTargets = false;
    showTargetButton.textContent = 'Show Target';
    clearHighlights();
  } else {
    // turn on
    showTargets = true;
    showTargetButton.textContent = 'Hide Target';
    highlightSquare(nextTarget);
  }
});

let qv = false;

function showQV() {
  let color = qv ? '#202020' : '';
  for (let j of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
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
  highlightSquare(nextTarget);
  showQV();
});