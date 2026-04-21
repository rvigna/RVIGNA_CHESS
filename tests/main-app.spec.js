// @ts-check
/**
 * Playwright tests for the main RVIGNA CHESS application (server.js, port 3000).
 * Covers local two-player and vs-computer (offline) game flows.
 *
 * Board squares:  [data-row="R"][data-col="C"]  where row 0 = rank 8, row 7 = rank 1.
 * Status bar:     #status-bar  (classes: turn-white | turn-black | game-over)
 * Status text:    #game-status
 */
const { test, expect } = require('@playwright/test');

// ── helpers ─────────────────────────────────────────────────────────────────

/** Navigate to the app root and wait for the board to render. */
async function openApp(page) {
  await page.goto('http://localhost:3000/');
  // Board is always rendered on load (local game auto-starts).
  await expect(page.locator('#chessboard')).toBeVisible();
  await expect(page.locator('#game-status')).not.toContainText('Connecting');
}

/**
 * Return the locator for a square by algebraic notation, e.g. "e2".
 * Row 0 = rank 8, Col 0 = file a.
 */
function sq(page, alg) {
  const col = alg.charCodeAt(0) - 97;       // a=0 … h=7
  const row = 8 - parseInt(alg[1], 10);     // rank 1 → row 7, rank 8 → row 0
  return page.locator(`#chessboard [data-row="${row}"][data-col="${col}"]`);
}

/** Wait for the status bar to show White's turn. */
async function waitWhiteTurn(page, timeout = 5000) {
  await expect(page.locator('#status-bar')).toHaveClass(/turn-white/, { timeout });
}

/** Wait for the status bar to show Black's turn. */
async function waitBlackTurn(page, timeout = 5000) {
  await expect(page.locator('#status-bar')).toHaveClass(/turn-black/, { timeout });
}

/** Open the vs-Computer modal and start a game (human plays white, Easy). */
async function startVsComputer(page, { humanColor = 'white', difficulty = 1 } = {}) {
  await page.locator('#btn-vs-computer').click();
  await expect(page.locator('#computer-modal')).toHaveClass(/active/);

  // Select human color
  await page.locator(`[data-cc="${humanColor}"]`).click();

  // Select difficulty (1=Easy, 2=Normal, 3=Hard)
  await page.locator(`.difficulty-btn[data-level="${difficulty}"]`).click();

  await page.locator('button:has-text("Start Game")').click();
  await expect(page.locator('#computer-modal')).not.toHaveClass(/active/);

  // Wait for first render after reset
  await expect(page.locator('#game-status')).not.toContainText('Connecting');
}

// ── 1. Page load ─────────────────────────────────────────────────────────────

test('page loads with correct title', async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle(/RVIGNA CHESS/i);
});

test('board has 64 squares on load', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#chessboard .square')).toHaveCount(64);
});

test('initial status is White to move', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);
  await expect(page.locator('#game-status')).toContainText('White to move');
});

// ── 2. Starting position ─────────────────────────────────────────────────────

test('white pawns are on rank 2 at start', async ({ page }) => {
  await openApp(page);
  // All 8 squares on rank 2 (row 6) should have a white pawn image (src contains plt)
  for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const img = sq(page, `${file}2`).locator('img');
    await expect(img).toHaveAttribute('src', /plt/);
  }
});

test('black pawns are on rank 7 at start', async ({ page }) => {
  await openApp(page);
  for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const img = sq(page, `${file}7`).locator('img');
    await expect(img).toHaveAttribute('src', /pdt/);
  }
});

test('back-rank pieces are in starting positions', async ({ page }) => {
  await openApp(page);
  // White rooks
  await expect(sq(page, 'a1').locator('img')).toHaveAttribute('src', /rlt/);
  await expect(sq(page, 'h1').locator('img')).toHaveAttribute('src', /rlt/);
  // White king & queen
  await expect(sq(page, 'e1').locator('img')).toHaveAttribute('src', /klt/);
  await expect(sq(page, 'd1').locator('img')).toHaveAttribute('src', /qlt/);
  // Black king & queen
  await expect(sq(page, 'e8').locator('img')).toHaveAttribute('src', /kdt/);
  await expect(sq(page, 'd8').locator('img')).toHaveAttribute('src', /qdt/);
});

// ── 3. Local two-player moves ────────────────────────────────────────────────

test('clicking a piece then a target moves it', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  // e2 → e4
  await sq(page, 'e2').click();
  await expect(sq(page, 'e4')).toHaveClass(/highlighted/);
  await sq(page, 'e4').click();

  // e4 should now have a white pawn, e2 should be empty
  await expect(sq(page, 'e4').locator('img')).toHaveAttribute('src', /plt/);
  await expect(sq(page, 'e2').locator('img')).toHaveCount(0);
});

test('after white move it becomes black turn', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();

  await waitBlackTurn(page);
  await expect(page.locator('#game-status')).toContainText('Black to move');
});

test('clicking invalid target does not move piece', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  // Select e2 pawn, then click e5 (not a valid pawn target)
  await sq(page, 'e2').click();
  await sq(page, 'e5').click();

  // Pawn should still be on e2
  await expect(sq(page, 'e2').locator('img')).toHaveAttribute('src', /plt/);
  // e5 should be empty
  await expect(sq(page, 'e5').locator('img')).toHaveCount(0);
});

test('clicking empty square after selecting deselects', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  await sq(page, 'e2').click();
  await expect(sq(page, 'e2')).toHaveClass(/selected/);

  // Click an empty square in the middle of the board
  await sq(page, 'e5').click();

  // e2 should no longer be selected
  await expect(sq(page, 'e2')).not.toHaveClass(/selected/);
});

test('valid target squares are highlighted after piece selection', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  await sq(page, 'e2').click();
  // e3 and e4 should both be highlighted (pawn can move 1 or 2 squares)
  await expect(sq(page, 'e3')).toHaveClass(/highlighted/);
  await expect(sq(page, 'e4')).toHaveClass(/highlighted/);
});

test('last-move squares are highlighted after a move', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();
  await waitBlackTurn(page);

  await expect(sq(page, 'e2')).toHaveClass(/last-move/);
  await expect(sq(page, 'e4')).toHaveClass(/last-move/);
});

// ── 4. New game / reset ───────────────────────────────────────────────────────

test('new game button resets board to starting position', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  // Make a move first
  await sq(page, 'e2').click();
  await sq(page, 'e4').click();
  await expect(sq(page, 'e4').locator('img')).toHaveAttribute('src', /plt/);

  // Click the New Game button (chess-piece icon, top bar)
  await page.locator('.desktop-header button[title="New game"]').first().click();
  await waitWhiteTurn(page);

  // e4 empty again, e2 has white pawn
  await expect(sq(page, 'e4').locator('img')).toHaveCount(0);
  await expect(sq(page, 'e2').locator('img')).toHaveAttribute('src', /plt/);
});

// ── 5. Move history ───────────────────────────────────────────────────────────

test('move list updates after a move', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();

  // Move list should contain at least one entry
  await expect(page.locator('#move-list li')).toHaveCount(1);
});

test('move list grows with alternating moves', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();
  await waitBlackTurn(page);

  await sq(page, 'e7').click();
  await sq(page, 'e5').click();
  await waitWhiteTurn(page);

  // One list item contains the full pair (1. e4 e5)
  await expect(page.locator('#move-list')).toContainText('e4');
  await expect(page.locator('#move-list')).toContainText('e5');
});

// ── 6. Undo ───────────────────────────────────────────────────────────────────

test('undo restores board after one move', async ({ page }) => {
  await openApp(page);
  await waitWhiteTurn(page);

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();
  await waitBlackTurn(page);

  // Undo button appears after the first move
  await page.locator('#btn-undo').click();
  await waitWhiteTurn(page);

  await expect(sq(page, 'e4').locator('img')).toHaveCount(0);
  await expect(sq(page, 'e2').locator('img')).toHaveAttribute('src', /plt/);
});

// ── 7. vs Computer modal ─────────────────────────────────────────────────────

test('vs Computer modal opens and closes', async ({ page }) => {
  await openApp(page);
  await page.locator('#btn-vs-computer').click();
  await expect(page.locator('#computer-modal')).toHaveClass(/active/);

  await page.locator('#computer-modal button:has-text("Close")').click();
  await expect(page.locator('#computer-modal')).not.toHaveClass(/active/);
});

test('selecting difficulty highlights the button', async ({ page }) => {
  await openApp(page);
  await page.locator('#btn-vs-computer').click();

  await page.locator('.difficulty-btn[data-level="2"]').click();
  await expect(page.locator('.difficulty-btn[data-level="2"]')).toHaveClass(/selected/);
  await expect(page.locator('.difficulty-btn[data-level="1"]')).not.toHaveClass(/selected/);
});

// ── 8. vs Computer game flow ─────────────────────────────────────────────────

test('vs Computer game starts and white pawn can be moved', async ({ page }) => {
  await openApp(page);
  await startVsComputer(page, { humanColor: 'white', difficulty: 1 });

  await waitWhiteTurn(page);

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();

  // After the human move the computer (black) should respond
  await waitWhiteTurn(page, 15000);   // wait for computer reply + back to white

  // e4 should still hold a white pawn (game ongoing)
  await expect(sq(page, 'e4').locator('img')).toHaveAttribute('src', /plt/);
});

test('computer makes a move after human plays', async ({ page }) => {
  await openApp(page);
  await startVsComputer(page, { humanColor: 'white', difficulty: 1 });
  await waitWhiteTurn(page);

  const listBefore = await page.locator('#move-list li').count();

  await sq(page, 'd2').click();
  await sq(page, 'd4').click();

  // Wait for computer to reply (move list should grow by 1 item)
  await expect(page.locator('#move-list li')).not.toHaveCount(listBefore, { timeout: 15000 });
});

test('Local Game button in computer modal returns to 2-player mode', async ({ page }) => {
  await openApp(page);
  await startVsComputer(page, { humanColor: 'white', difficulty: 1 });

  await page.locator('#btn-vs-computer').click();
  await page.locator('button:has-text("Local Game")').click();

  // btn-vs-computer should no longer have active-mode class (no computer opponent)
  await expect(page.locator('#btn-vs-computer')).not.toHaveClass(/active-mode/);
  // Status should return to white to move
  await waitWhiteTurn(page);
});

// ── 9. Resign (vs Computer, at least 1 move played) ──────────────────────────

test('resign ends the game when playing vs computer', async ({ page }) => {
  await openApp(page);
  await startVsComputer(page, { humanColor: 'white', difficulty: 1 });
  await waitWhiteTurn(page);

  // Make one move so resign becomes available
  await sq(page, 'e2').click();
  await sq(page, 'e4').click();
  await waitWhiteTurn(page, 15000);  // wait for computer reply

  // Resign button should now be visible
  await expect(page.locator('#btn-resign')).toBeVisible();

  // Single click — no confirm() dialog in the main app
  await page.locator('#btn-resign').click();

  await expect(page.locator('#status-bar')).toHaveClass(/game-over/, { timeout: 5000 });
  await expect(page.locator('#game-status')).toContainText('resigns');
});
