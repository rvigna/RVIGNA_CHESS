'use strict';

const Chess = require('./chess');
const AI = require('./ai');

function badge(cpLoss) {
  if (cpLoss <=   5) return { label: 'Best',       cls: 'badge-best' };
  if (cpLoss <=  20) return { label: 'Good',       cls: 'badge-good' };
  if (cpLoss <=  50) return { label: 'Okay',       cls: 'badge-ok' };
  if (cpLoss <= 100) return { label: 'Inaccuracy', cls: 'badge-inaccuracy' };
  if (cpLoss <= 200) return { label: 'Mistake',    cls: 'badge-mistake' };
  return                    { label: 'Blunder',    cls: 'badge-blunder' };
}

// Maps centipawn loss to a 0-100 move quality score
function moveAccuracyScore(cpLoss) {
  if (cpLoss <=   5) return 100;
  if (cpLoss <=  20) return 90;
  if (cpLoss <=  50) return 75;
  if (cpLoss <= 100) return 55;
  if (cpLoss <= 200) return 25;
  return 0;
}

function analyseGame(state) {
  const history = state.moveHistory;
  if (history.length === 0) return { moves: [], summary: null };

  const results = [];
  const blunders = { white: 0, black: 0 };
  const mistakes = { white: 0, black: 0 };
  const inaccuracies = { white: 0, black: 0 };
  const best = { white: 0, black: 0 };
  const accScores = { white: 0, black: 0 };
  const totalLoss = { white: 0, black: 0 };
  const movesByColor = { white: 0, black: 0 };

  for (let i = 0; i < history.length; i++) {
    const mv = history[i];
    const color = mv.player;
    movesByColor[color]++;

    // Restore pre-move state from boardHistory[i]
    const preSnap = state.boardHistory[i];
    if (!preSnap) {
      results.push({ mv, badge: { label: '?', cls: '' }, cpLoss: 0 });
      continue;
    }

    // Build a temp state from the snapshot
    const tempState = {
      boardState: Chess.deepCopy(preSnap.board),
      canCastle: Chess.deepCopy(preSnap.canCastle),
      enPassantTarget: preSnap.enPassantTarget || null,
      boardHistory: state.boardHistory.slice(0, i + 1),
      turn: color,
    };

    // Find the best possible score from this position
    const legalMoves = Chess.getAllValidMoves(tempState, color);
    let bestScore = -Infinity;
    for (const m of legalMoves) {
      const s = AI.scoreMoveWithLookahead(tempState, m, color);
      if (s > bestScore) bestScore = s;
    }

    // Score the actual move played
    const playedMove = legalMoves.find(m =>
      m.startR === mv.from.r && m.startC === mv.from.c &&
      m.endR   === mv.to.r   && m.endC   === mv.to.c
    );
    const actualScore = playedMove
      ? AI.scoreMoveWithLookahead(tempState, playedMove, color)
      : bestScore;

    const cpLoss = Math.max(0, bestScore - actualScore);
    const b = badge(cpLoss);

    if (b.cls === 'badge-best')            best[color]++;
    else if (b.cls === 'badge-blunder')    blunders[color]++;
    else if (b.cls === 'badge-mistake')    mistakes[color]++;
    else if (b.cls === 'badge-inaccuracy') inaccuracies[color]++;

    accScores[color] += moveAccuracyScore(cpLoss);
    totalLoss[color] += cpLoss;
    results.push({ mv, badge: b, cpLoss, moveIndex: i });
  }

  // Detect game phase
  const phase = history.length <= 20 ? 'opening' : history.length <= 50 ? 'middlegame' : 'endgame';

  // Calculate accuracy percentages using weighted move quality scores
  const accuracy = {
    white: movesByColor.white > 0 ? Math.round(accScores.white / movesByColor.white) : 0,
    black: movesByColor.black > 0 ? Math.round(accScores.black / movesByColor.black) : 0,
  };

  const totalMoves = Math.ceil(history.length / 2);
  const resultStr = state.gameResult || (state.gameOver ? '1/2-1/2' : '*');

  return {
    moves: results.map(({ mv, badge: b, cpLoss }) => ({
      notation: mv.notation,
      player: mv.player,
      badge: b,
      cpLoss,
    })),
    summary: {
      result: resultStr,
      totalMoves,
      phase,
      white: {
        moves: movesByColor.white,
        best: best.white,
        blunders: blunders.white,
        mistakes: mistakes.white,
        inaccuracies: inaccuracies.white,
        accuracy: accuracy.white,
        totalLoss: totalLoss.white,
      },
      black: {
        moves: movesByColor.black,
        best: best.black,
        blunders: blunders.black,
        mistakes: mistakes.black,
        inaccuracies: inaccuracies.black,
        accuracy: accuracy.black,
        totalLoss: totalLoss.black,
      },
    },
  };
}

module.exports = { analyseGame, badge };
