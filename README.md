# Knight's Tour Around the Queen

[**Play Here**](https://knightpuzzle.ihtfy.com/)

- The knight starts on h8, and the queen is permanently on d5.

- The knight must visit each free square on the board from right to left, top to bottom.

- The knight can never go to a square attacked by the queen, and it cannot capture the queen.

Try to visit each free square in order, and arrive at a1 as quickly as possible.

## GM Ben Finegold's Explanation
[![GM Ben Finegold's Explanation](https://i3.ytimg.com/vi/SrQlpY_eGYU/maxresdefault.jpg)](https://youtu.be/SrQlpY_eGYU?t=45)


## Local development and checks

Serve this directory with `python3 -m http.server 8000`, then open
<http://localhost:8000>. No build or dependency installation is required.

With Node.js 22 or newer, run `npm run check` for syntax checks and the regression
tests (or `npm test` for tests alone). Tests cover target order, shortest move
counts, move validation, completion/reset, highlights, and offline caching.

## Vendored dependencies

- jQuery 3.7.1: <https://code.jquery.com/jquery-3.7.1.min.js>
- Bulma 0.9.4: <https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css>
- chessboard.js 1.0.0: <https://chessboardjs.com/download>
- Original Alpha pieces: [attribution and terms](licenses/alpha.md).

The libraries are checked in directly. Preserve upstream license headers when
updating them. Major upgrades can be evaluated alongside the UI redesign.

## Offline updates

The service worker precaches the complete game, including pieces and icons.
Offline play is available after one successful online load on HTTPS or localhost.
When changing any cached file, bump `CACHE_NAME` in `service-worker.js` and update
`FILES_TO_CACHE` if files were added or renamed. A new version activates once all
existing tabs using the previous version close, so an active game is not replaced
mid-session. The site can also be served from a subdirectory.
