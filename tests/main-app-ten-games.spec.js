// @ts-check
/**
 * Plays 10 complete AI-vs-AI games on the main RVIGNA CHESS application (server.js, port 3000).
 *
 * Technique: set `computerColor = 'both'` so the built-in `triggerComputerMove`
 * loop drives both sides, then wait for `#status-bar.game-over`.
 *
 * 50-move cap: if neither side has won after 100 half-moves, evaluate material
 * from `serverState.boardState` (lowercase = white, uppercase = black) and call
 * the page's `resign()` function on behalf of the side with less material
 * (current-turn side used as tiebreaker).
 *
 * Screenshots and video are captured for every game.
 */
const { test, expect } = require('@playwright/test');

// Always capture screenshots and video for this suite.
test.use({ screenshot: 'on', video: 'on' });

const GAME_TIMEOUT   = 5 * 60 * 1000;  // 5 min per game
const GAMEOVER_WAIT  = 4 * 60 * 1000;  // max wait for game-over signal
const RESIGN_AFTER   = 100;             // half-moves (= 50 full moves)
const POLL_MS        = 500;             // how often to check move count

// ── helpers ──────────────────────────────────────────────────────────────────

async function openApp(page) {
  await page.goto('http://localhost:3000/');
  await expect(page.locator('#chessboard')).toBeVisible();
  await expect(page.locator('#game-status')).not.toContainText('Connecting', { timeout: 5000 });
}

/** Set both sides to AI and start a fresh game. */
async function startAutoGame(page) {
  await page.evaluate(() => {
    computerColor = 'both';
    resetGame();
  });
}

/**
 * Wait for game-over, applying the 50-move resignation rule if needed.
 * Returns { statusText, moveCount }.
 */
async function waitForGameOver(page) {
  const deadline = Date.now() + GAMEOVER_WAIT;

  while (Date.now() < deadline) {
    const isOver = await page.locator('#status-bar.game-over').count();
    if (isOver) break;

    // Check half-move count via the move-list DOM.
    const halfMoves = await page.locator('#move-list li').count();

    if (halfMoves >= RESIGN_AFTER) {
      // Evaluate material from the page's live serverState.
      const { whiteMat, blackMat, turn } = await page.evaluate(() => {
        const VALS = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        const board = serverState.boardState; // 8×8; lowercase=white, uppercase=black
        let white = 0, black = 0;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            const v = VALS[p.toLowerCase()] || 0;
            if (p === p.toLowerCase()) white += v;
            else                       black += v;
          }
        }
        return { whiteMat: white, blackMat: black, turn: serverState.turn };
      });

      // The side with less material resigns; ties go to whoever is to move.
      const loser = whiteMat < blackMat ? 'white'
                  : blackMat < whiteMat ? 'black'
                  : turn;

      // Flip turn to the loser if needed (play one more AI half-move).
      if (turn !== loser) {
        // Pause the auto-play loop, swap computerColor to only the loser's
        // opponent so one half-move fires, then resign.
        await page.evaluate((loser) => {
          computerColor = loser === 'white' ? 'black' : 'white';
          triggerComputerMove();
        }, loser);
        // Wait for the flip
        await page.waitForTimeout(1500);
        if (await page.locator('#status-bar.game-over').count()) break;
      }

      // Stop further AI moves then resign on behalf of the loser.
      await page.evaluate(() => { computerColor = null; });
      await page.locator('#btn-resign').click();
      break;
    }

    await page.waitForTimeout(POLL_MS);
  }

  await expect(page.locator('#status-bar')).toHaveClass(/game-over/, { timeout: 10_000 });

  const statusText = await page.locator('#game-status').textContent();
  const moveCount  = await page.locator('#move-list li').count();
  return { statusText: statusText?.trim() ?? '', moveCount };
}

// ── 10 games ──────────────────────────────────────────────────────────────────

for (let gameNum = 1; gameNum <= 10; gameNum++) {
  test(`main app game ${gameNum} of 10 completes with a valid result`, async ({ page }, testInfo) => {
    test.setTimeout(GAME_TIMEOUT);

    const t0 = Date.now();
    await openApp(page);
    await startAutoGame(page);

    const { statusText, moveCount } = await waitForGameOver(page);
    const durationMs = Date.now() - t0;

    // ── Attachments ──────────────────────────────────────────────────────────
    const screenshot = await page.locator('#chessboard').screenshot();
    await testInfo.attach(`game-${gameNum}-final-board`, {
      body: screenshot,
      contentType: 'image/png',
    });

    const moves = await page.locator('#move-list').textContent();
    await testInfo.attach(`game-${gameNum}-moves`, {
      body: moves ?? '',
      contentType: 'text/plain',
    });

    // ── Assertions ───────────────────────────────────────────────────────────
    await expect(page.locator('#status-bar')).toHaveClass(/game-over/);

    const validKeywords = ['wins', 'draw', 'stalemate', 'resigns', 'checkmate', '½'];
    const hasValidOutcome = validKeywords.some(kw => statusText.toLowerCase().includes(kw));
    expect(hasValidOutcome, `Status "${statusText}" should contain a known outcome`).toBe(true);

    expect(moveCount, 'Move list should have at least one entry').toBeGreaterThan(0);

    console.log(
      `  Game ${gameNum}: "${statusText}"  ` +
      `(${moveCount} half-moves, ${(durationMs / 1000).toFixed(1)}s)`
    );
  });
}
