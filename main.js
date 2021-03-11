let nextTarget = 'f8';

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

  // decrement h to a (104-97)
  // when wrapping, decrement 8-1, then wrap around to 8, give success
  // h8

  if (--file < 97) {
    file = 104;
    if (--rank < 1) {
      rank = 8;
      let t_end = performance.now();
      let ms = Math.trunc(t_end - t_start);
      let duration = new Date(ms).toISOString().substr(11, 8);
      console.log('Success!');
      alert(`Completed in ${duration}`);
      t_start = performance.now();
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
  const red = '#FF0000';
  $(`#board .square-${square}`).css('background', red);
}

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
  onDrop: (source, target, piece) => {
    // snapback if attacked by queen (or capturing), or illegal
    if (inQVision(target) || !legalKnight(source, target)) {
      return "snapback";
    }
    if (target === nextTarget) {
      nextTarget = getNextTarget(nextTarget);
      clearHighlights();
      highlightSquare(nextTarget);
    }
  },

};
var board = Chessboard("board", config);
highlightSquare(nextTarget);

let t_start = performance.now();

document.getElementById('reset').addEventListener('click', () => {
  board.position('7N/8/8/3q4/8/8/8/8 w - - 0 1');
  nextTarget = 'f8';
  clearHighlights();
  highlightSquare(nextTarget);
  t_start = performance.now();
});

$(window).resize(() => {
  board.resize();
  highlightSquare(nextTarget);
});