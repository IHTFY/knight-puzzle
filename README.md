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

## Offline app (PWA)

The game installs as an app and works fully offline. `service-worker.js` precaches
every file in `FILES_TO_CACHE`, and its cache name is a hash of those files.
After changing any precached file (or the list), run `npm run stamp`; the tests fail
if the stamp is stale. Installed copies download the new version in the background
and switch to it at the next idle moment (page load or Reset), never mid-game.

Icons are drawn in `images/icon.svg` (rounded) and `images/icon-maskable.svg`
(full-bleed, helm inside the maskable safe zone). The PNGs, `favicon.ico`, and
`images/screenshots/` are rendered from those and the live app with headless Chromium.

## Vendored dependencies

- jQuery 3.7.1: <https://code.jquery.com/jquery-3.7.1.min.js>
- chessboard.js 1.0.0: <https://chessboardjs.com/download>
- Original Alpha pieces: [attribution and terms](licenses/alpha.md).

The interface uses custom CSS and JavaScript. chessboard.js renders the board and
handles dragging. It requires jQuery. Preserve upstream license headers when
updating the vendored libraries.

## Controls and stats

Drag the knight or click a destination. Arrow keys move board focus; Enter or
Space moves the knight to the focused square. The queen and knight buttons toggle
attacked squares and available moves independently. Click the timer card to hide
or reveal elapsed time, or the targets card and next-square badge to toggle the
target. Display settings survive Reset.

Best route shows numbered, center-to-center arrows from the current square to the
next target. Step 1 draws on top. Rewind returns to the last reached target and
clears moves from the current leg while keeping the timer and completed stats.
The Moves card and Stats track rewinds. Split time includes discarded attempts.
Rewind is disabled for an empty leg or a completed run. Full Reset requires
confirmation and clears all moves, targets, rewinds, route arrows, and the timer.

Route searches cache distances to each target. Following the shown route reuses
its remaining moves; a detour chooses a shortest route from the new square.
Unchanged route displays skip rebuilding their SVG elements.

Stats marks extra moves in amber and slow splits in lavender. Slow splits use
seconds per actual move and compare with the median across completed targets.
After five targets, a split is slow only if it exceeds both 1.75 times the median
and the median plus 0.75 seconds per move. Comparisons update within the current
run; no history is stored.

## Deployment

GitHub Pages publishes the root of `master` to <https://knightpuzzle.ihtfy.com/>.
Merging to `master` updates the public site. Confirm the Pages deployment for the
merge commit and check the live UI. The repository has no PR preview deployment.
See [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

To roll back a release, revert its commit on `master`, run `npm run stamp` if any
cached assets changed beyond the revert, and deploy the result. A revert does not
remove Git history. Installed apps apply updates at the next idle point or Reset,
so an active run keeps its current version until then.
