// @ts-check
/**
 * Plays 10 complete AI-vs-AI games through the text-client UI.
 * Each game: click AI Move repeatedly until game-over.
 * Verifies the result banner, move history, and that controls are disabled.
 * Screenshots and video are captured for every game.
 */
const { test, expect } = require('@playwright/test');

// Always capture screenshots and video for this suite.
test.use({ screenshot: 'on', video: 'on' });

// Maximum moves to wait for (a full game rarely exceeds 150 half-moves).
const MAX_MOVES = 300;

// Per-move timeout: AI at difficulty 2 is fast, but allow some headroom.
const AI_MOVE_TIMEOUT = 8000;

// Overall per-game timeout (generous: 300 moves × 8 s worst case never happens).
const GAME_TIMEOUT = 5 * 60 * 1000;

/** @param {import('@playwright/test').Page} page */
async function openClient(page) {
  await page.goto('/client');
  await expect(page.locator('#board')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function startNewGame(page) {
  await page.getByRole('button', { name: 'New Game' }).click();
  await expect(page.locator('#start-overlay')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('#game-status')).toContainText("White's turn");
}

// After this many half-moves the side with less material resigns.
const RESIGN_AFTER = 100; // = 50 full moves

/**
 * Play one full AI-vs-AI game by clicking "AI Move" repeatedly until the
 * game-over banner appears.  If neither side has finished after RESIGN_AFTER
 * half-moves, the side with a material disadvantage resigns.
 * Returns { bannerText, moveCount }.
 * @param {import('@playwright/test').Page} page
 */
async function playFullGame(page) {
  let moveCount = 0;
  for (let move = 0; move < MAX_MOVES; move++) {
    const isOver = await page.locator('#game-status.gameover').count();
    if (isOver) break;

    // ── 50-move resignation rule ─────────────────────────────────────────────
    if (moveCount >= RESIGN_AFTER) {
      // Evaluate material directly from the page's gameState / PIECE_VALS globals.
      const { whiteMat, blackMat, turn } = await page.evaluate(() => {
        const s = /** @type {any} */ (window).gameState;
        const vals = /** @type {any} */ (window).PIECE_VALS; // { p:1, n:3, b:3, r:5, q:9 }
        let white = 0, black = 0;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = s.boardState[r][c];
            if (!p) continue;
            const v = vals[p.toLowerCase()] || 0;
            if (p === p.toLowerCase()) white += v; // lowercase = white
            else                       black += v; // uppercase = black
          }
        }
        return { whiteMat: white, blackMat: black, turn: s.turn };
      });

      // Loser = side with less material; ties go to the side currently to move.
      const loser = whiteMat < blackMat ? 'white'
                  : blackMat < whiteMat ? 'black'
                  : turn;

      // If the loser isn't to move, play one more AI half-move to flip turns.
      if (turn !== loser) {
        await page.locator('#btn-ai').click();
        await expect(page.locator('#thinking-overlay')).toBeHidden({ timeout: AI_MOVE_TIMEOUT });
        moveCount++;
        if (await page.locator('#game-status.gameover').count()) break;
      }

      // Two-click resign (text-client uses a confirm-then-resign pattern).
      await page.locator('#btn-resign').click();
      await page.locator('#btn-resign').click();
      break;
    }
    // ────────────────────────────────────────────────────────────────────────

    await page.locator('#btn-ai').click();
    await expect(page.locator('#thinking-overlay')).toBeHidden({ timeout: AI_MOVE_TIMEOUT });
    moveCount++;
  }
  return {
    bannerText: await page.locator('#result-banner').textContent(),
    moveCount,
  };
}

for (let gameNum = 1; gameNum <= 10; gameNum++) {
  test(`game ${gameNum} of 10 completes with a valid result`, async ({ page }, testInfo) => {
    test.setTimeout(GAME_TIMEOUT);

    const t0 = Date.now();
    await openClient(page);
    await startNewGame(page);

    const { bannerText, moveCount } = await playFullGame(page);
    const durationMs = Date.now() - t0;

    // ── Final-board screenshot attached to the test report ───────────────────
    const screenshot = await page.locator('#board').screenshot();
    await testInfo.attach(`game-${gameNum}-final-board`, {
      body: screenshot,
      contentType: 'image/png',
    });

    // Also attach the move list text as a plain-text artifact.
    const moves = await page.locator('#move-list').textContent();
    await testInfo.attach(`game-${gameNum}-moves`, {
      body: moves ?? '',
      contentType: 'text/plain',
    });

    // ── Assertions ──────────────────────────────────────────────────────────

    await expect(page.locator('#game-status')).toHaveClass(/gameover/);
    await expect(page.locator('#result-banner')).toBeVisible();
    const validResults = ['1-0', '0-1', '1/2-1/2'];
    const hasValidResult = validResults.some(r => bannerText?.includes(r));
    expect(hasValidResult, `Banner "${bannerText}" should contain a valid result`).toBe(true);

    const moveListText = await page.locator('#move-list').textContent();
    expect(moveListText?.trim()).not.toBe('—');

    await expect(page.locator('#btn-move')).toBeDisabled();
    await expect(page.locator('#btn-ai')).toBeDisabled();
    await expect(page.locator('#btn-resign')).toBeDisabled();

    console.log(`  Game ${gameNum}: ${bannerText?.trim()}  (${moveCount} half-moves, ${(durationMs / 1000).toFixed(1)}s)`);
  });
}
