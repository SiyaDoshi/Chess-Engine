"""
ChessAI.py — move search for the desktop (pygame) version.

NegaMax with alpha-beta pruning, captures searched first (MVV-LVA), and an
evaluation that counts material plus piece-square bonuses. The web version
(web/public/js/engine) builds on the same ideas and adds quiescence search
and iterative deepening.
"""

import random

PIECE_SCORE = {"K": 0, "Q": 900, "R": 500, "B": 330, "N": 320, "p": 100}
CHECKMATE = 100000
STALEMATE = 0
DEPTH = 3

# Piece-square tables from White's point of view, row 0 = 8th rank.
# Black uses the same tables flipped vertically.
KNIGHT_TABLE = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
]
BISHOP_TABLE = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
]
PAWN_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
]
POSITION_TABLES = {"N": KNIGHT_TABLE, "B": BISHOP_TABLE, "p": PAWN_TABLE}


def findRandomMove(validMoves):
    return random.choice(validMoves)


def findBestMove(gs, validMoves, depth=DEPTH):
    """Return the best move for the side to move, or None if there are no moves."""
    moves = list(validMoves)
    random.shuffle(moves)  # vary play between equally good moves
    turnMultiplier = 1 if gs.whitetoMove else -1
    _, bestMove = negamax(gs, orderMoves(moves), depth, -CHECKMATE, CHECKMATE, turnMultiplier)
    return bestMove


def moveOrderScore(move):
    """Captures first: most valuable victim, least valuable attacker."""
    if move.pieceCaptured == '--':
        return 0
    return 10 * PIECE_SCORE[move.pieceCaptured[1]] - PIECE_SCORE[move.pieceMoved[1]] + 10000


def orderMoves(moves):
    return sorted(moves, key=moveOrderScore, reverse=True)


def negamax(gs, validMoves, depth, alpha, beta, turnMultiplier):
    """Return (score, best move) from the side to move's point of view."""
    if depth == 0:
        return turnMultiplier * scoreBoard(gs), None

    if not validMoves:
        # getValidMoves() has already set checkMate / staleMate.
        return turnMultiplier * scoreBoard(gs), None

    maxScore = -CHECKMATE
    bestMove = None
    for move in validMoves:
        gs.makeMove(move)
        nextMoves = orderMoves(gs.getValidMoves())
        score, _ = negamax(gs, nextMoves, depth - 1, -beta, -alpha, -turnMultiplier)
        score = -score
        gs.undoMove()
        if score > maxScore or bestMove is None:
            maxScore = score
            bestMove = move
        alpha = max(alpha, maxScore)
        if alpha >= beta:
            break
    return maxScore, bestMove


def scoreBoard(gs):
    """Positive is good for White, negative is good for Black."""
    if gs.checkMate:
        return -CHECKMATE if gs.whitetoMove else CHECKMATE
    if gs.staleMate:
        return STALEMATE

    score = 0
    for r, row in enumerate(gs.board):
        for c, square in enumerate(row):
            if square == '--':
                continue
            color, kind = square[0], square[1]
            value = PIECE_SCORE[kind]
            table = POSITION_TABLES.get(kind)
            if table:
                value += table[r][c] if color == 'w' else table[7 - r][c]
            score += value if color == 'w' else -value
    return score
