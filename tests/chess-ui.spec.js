// @ts-check
const { test, expect } = require('@playwright/test');

// Helper: navigate to the client and wait for it to be interactive
async function openClient(page) {
  await page.goto('/client');
  await expect(page.locator('#board')).toBeVisible();
}

// Helper: click "New Game" and wait for the board to render
async function newGame(page) {
  await page.getByRole('button', { name: 'New Game' }).click();
  // start-overlay disappears once a game is running
  await expect(page.locator('#start-overlay')).toBeHidden({ timeout: 5000 });
  // status line should show White's turn
  await expect(page.locator('#game-status')).toContainText("White's turn");
}

// Helper: get the square locator for an algebraic square (e.g. "e2")
function sq(page, alg) {
  const c = alg.charCodeAt(0) - 97;            // a=0 … h=7
  const r = 8 - parseInt(alg[1], 10);          // rank 1 = row 7
  return page.locator(`.sq[data-r="${r}"][data-c="${c}"]`);
}

// ---------------------------------------------------------------------------
// 1. Page load
// ---------------------------------------------------------------------------
test('page loads with title and board', async ({ page }) => {
  await openClient(page);
  await expect(page).toHaveTitle('Chess');
  await expect(page.locator('header .title')).toContainText('Chess');
  // Board should have 64 squares + 16 label cells
  const squares = page.locator('.sq');
  await expect(squares).toHaveCount(64);
});

test('start overlay is visible before new game', async ({ page }) => {
  await openClient(page);
  await expect(page.locator('#start-overlay')).toBeVisible();
});

test('game buttons are disabled before new game', async ({ page }) => {
  await openClient(page);
  await expect(page.locator('#btn-move')).toBeDisabled();
  await expect(page.locator('#btn-ai')).toBeDisabled();
  await expect(page.locator('#btn-resign')).toBeDisabled();
});

// ---------------------------------------------------------------------------
// 2. New game
// ---------------------------------------------------------------------------
test('new game hides overlay and enables controls', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await expect(page.locator('#start-overlay')).toBeHidden();
  await expect(page.locator('#btn-move')).toBeEnabled();
  await expect(page.locator('#btn-ai')).toBeEnabled();
  await expect(page.locator('#btn-resign')).toBeEnabled();
});

test('new game shows turn indicator in header', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await expect(page.locator('#turn-indicator')).toBeVisible();
  await expect(page.locator('#turn-label')).toHaveText("White's turn");
  await expect(page.locator('#turn-dot')).toHaveClass(/white/);
});

test('new game places pieces in starting positions', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  // White pawns on rank 2
  for (const file of ['a','b','c','d','e','f','g','h']) {
    await expect(sq(page, file + '2')).toHaveText('♙');
  }
  // White king on e1
  await expect(sq(page, 'e1')).toHaveText('♔');
  // Black king on e8
  await expect(sq(page, 'e8')).toHaveText('♚');
  // Black pawns on rank 7
  for (const file of ['a','b','c','d','e','f','g','h']) {
    await expect(sq(page, file + '7')).toHaveText('♟');
  }
});

test('player bar labels show correct colours', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await expect(page.locator('#name-top')).toHaveText('Black');
  await expect(page.locator('#name-bot')).toHaveText('White');
});

// ---------------------------------------------------------------------------
// 3. Move via text input
// ---------------------------------------------------------------------------
test('typing a move in the input and submitting updates the board', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  // Pawn should be on e2 before the move
  await expect(sq(page, 'e2')).toHaveText('♙');

  await page.locator('#move-input').fill('e2e4');
  await page.locator('#btn-move').click();

  // e2 should now be empty, e4 should have the pawn
  await expect(sq(page, 'e2')).toHaveText('');
  await expect(sq(page, 'e4')).toHaveText('♙');
  await expect(page.locator('#game-status')).toContainText("Black's turn");
});

test('Enter key in move input submits the move', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#move-input').fill('d2d4');
  await page.locator('#move-input').press('Enter');

  await expect(sq(page, 'd2')).toHaveText('');
  await expect(sq(page, 'd4')).toHaveText('♙');
});

test('invalid move shows error toast', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#move-input').fill('e2e5'); // illegal
  await page.locator('#btn-move').click();

  await expect(page.locator('#toast')).toHaveClass(/show/, { timeout: 3000 });
});

test('move input is cleared after a successful move', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#move-input').fill('e2e4');
  await page.locator('#btn-move').click();

  await expect(sq(page, 'e4')).toHaveText('♙'); // move landed
  await expect(page.locator('#move-input')).toHaveValue('');
});

// ---------------------------------------------------------------------------
// 4. Click-to-move
// ---------------------------------------------------------------------------
test('clicking a piece selects it and shows valid targets', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await sq(page, 'e2').click();

  // e2 should gain the selected class
  await expect(sq(page, 'e2')).toHaveClass(/selected/);
  // e3 and e4 are valid pawn targets
  await expect(sq(page, 'e3')).toHaveClass(/valid-target/);
  await expect(sq(page, 'e4')).toHaveClass(/valid-target/);
});

test('clicking a valid target moves the piece', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();

  await expect(sq(page, 'e2')).toHaveText('');
  await expect(sq(page, 'e4')).toHaveText('♙');
});

test('clicking empty square deselects without error', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await sq(page, 'e2').click(); // select pawn
  await sq(page, 'e5').click(); // click non-target empty square

  // No selected class should remain
  await expect(sq(page, 'e2')).not.toHaveClass(/selected/);
  await expect(page.locator('#game-status')).toContainText("White's turn");
});

test('last move squares are highlighted after click-to-move', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();

  // Both the from and to squares should get the .hl class
  await expect(sq(page, 'e2')).toHaveClass(/hl/);
  await expect(sq(page, 'e4')).toHaveClass(/hl/);
});

// ---------------------------------------------------------------------------
// 5. Move history
// ---------------------------------------------------------------------------
test('move history updates after a move', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#move-input').fill('e2e4');
  await page.locator('#btn-move').click();

  // The move list should contain a move entry — look for the SAN fragment
  await expect(page.locator('#move-list')).not.toContainText('—');
  await expect(page.locator('.move-san.white')).toBeVisible();
});

test('latest move in history has current class', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#move-input').fill('e2e4');
  await page.locator('#btn-move').click();
  await expect(sq(page, 'e4')).toHaveText('♙');

  await expect(page.locator('.move-san.current')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 6. AI move
// ---------------------------------------------------------------------------
test('AI Move button causes the AI to play', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  // Make a human move first so it is black's turn
  await page.locator('#move-input').fill('e2e4');
  await page.locator('#btn-move').click();
  await expect(page.locator('#game-status')).toContainText("Black's turn");

  await page.locator('#btn-ai').click();

  // After AI move it should be white's turn again
  await expect(page.locator('#game-status')).toContainText("White's turn", { timeout: 15000 });
  await expect(page.locator('.move-san.black')).toBeVisible();
});

test('thinking overlay appears during AI computation', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#move-input').fill('e2e4');
  await page.locator('#btn-move').click();

  // Intercept the ai-move response to hold it open long enough to check overlay
  await page.route('**/api/ai-move', async route => {
    await new Promise(r => setTimeout(r, 400)); // slight delay
    await route.continue();
  });

  const aiBtn = page.locator('#btn-ai');
  await aiBtn.click();

  await expect(page.locator('#thinking-overlay')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('#thinking-overlay')).toBeHidden({ timeout: 15000 });
});

// ---------------------------------------------------------------------------
// 7. Auto AI toggle
// ---------------------------------------------------------------------------
test('Auto AI button toggles active class', async ({ page }) => {
  await openClient(page);
  const btn = page.locator('#btn-auto');

  await expect(btn).not.toHaveClass(/active/);
  await btn.click();
  await expect(btn).toHaveClass(/active/);
  await btn.click();
  await expect(btn).not.toHaveClass(/active/);
});

test('Auto AI triggers AI response after human move', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#btn-auto').click(); // enable Auto AI
  await expect(page.locator('#btn-auto')).toHaveClass(/active/);

  await page.locator('#move-input').fill('e2e4');
  await page.locator('#btn-move').click();

  // After human move, auto AI fires — wait for it to finish (back to white's turn)
  await expect(page.locator('#game-status')).toContainText("White's turn", { timeout: 15000 });
  // History should have both white and black moves
  await expect(page.locator('.move-san.black')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 8. Flip board
// ---------------------------------------------------------------------------
test('flip board button swaps player bar labels', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await expect(page.locator('#name-top')).toHaveText('Black');
  await expect(page.locator('#name-bot')).toHaveText('White');

  await page.locator('button[title="Flip board"]').click();

  await expect(page.locator('#name-top')).toHaveText('White');
  await expect(page.locator('#name-bot')).toHaveText('Black');
});

test('flip board reverses file labels', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  const labels = page.locator('.file-label');
  const firstLabel  = labels.first();
  const lastLabel   = labels.last();

  await expect(firstLabel).toHaveText('a');
  await expect(lastLabel).toHaveText('h');

  await page.locator('button[title="Flip board"]').click();

  await expect(firstLabel).toHaveText('h');
  await expect(lastLabel).toHaveText('a');
});

// ---------------------------------------------------------------------------
// 9. Resign
// ---------------------------------------------------------------------------
test('resign ends the game', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#btn-resign').click();            // first click → "Confirm?"
  await expect(page.locator('#btn-resign')).toHaveText('Confirm?');
  await page.locator('#btn-resign').click();            // second click → resigns

  await expect(page.locator('#game-status')).toHaveClass(/gameover/, { timeout: 5000 });
  await expect(page.locator('#result-banner')).toBeVisible();
});

test('game controls are disabled after resign', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#btn-resign').click();
  await page.locator('#btn-resign').click();

  await expect(page.locator('#result-banner')).toBeVisible();
  await expect(page.locator('#btn-move')).toBeDisabled();
  await expect(page.locator('#btn-ai')).toBeDisabled();
  await expect(page.locator('#btn-resign')).toBeDisabled();
});

// ---------------------------------------------------------------------------
// 10. API Board (collapsible)
// ---------------------------------------------------------------------------
test('API board is hidden by default and opens on click', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  const details = page.locator('details.card');
  await expect(details).not.toHaveAttribute('open');

  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(page.locator('#text-board')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 11. New game resets state
// ---------------------------------------------------------------------------
test('starting a new game resets the board mid-game', async ({ page }) => {
  await openClient(page);
  await newGame(page);

  await page.locator('#move-input').fill('e2e4');
  await page.locator('#btn-move').click();
  await expect(sq(page, 'e4')).toHaveText('♙');

  // Start a fresh game
  await page.getByRole('button', { name: 'New Game' }).click();
  await expect(page.locator('#start-overlay')).toBeHidden();

  // e2 should have a pawn again, e4 empty
  await expect(sq(page, 'e2')).toHaveText('♙');
  await expect(sq(page, 'e4')).toHaveText('');

  // Move history should be empty
  await expect(page.locator('#move-list')).toContainText('—');
});
