"""
Perft tests for the desktop move generator.

Perft counts every position reachable in N moves. The correct counts for
these positions are published (chessprogramming.org/Perft_Results), so a
mismatch means a move-generation bug: castling, en passant, promotion,
pins or checks.

Run from the repo root:  python3 -m unittest discover desktop/tests
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import ChessEngine  # noqa: E402


def from_fen(fen):
    """Build a GameState from a FEN string."""
    gs = ChessEngine.GameState()
    placement, turn, castling, ep = fen.split()[:4]
    board = []
    for r, row in enumerate(placement.split('/')):
        line = []
        for ch in row:
            if ch.isdigit():
                line += ['--'] * int(ch)
                continue
            color = 'w' if ch.isupper() else 'b'
            kind = 'p' if ch.upper() == 'P' else ch.upper()
            line.append(color + kind)
            if kind == 'K':
                if color == 'w':
                    gs.whiteKingLocation = (r, len(line) - 1)
                else:
                    gs.blackKingLocation = (r, len(line) - 1)
        board.append(line)
    gs.board = board
    gs.whitetoMove = turn == 'w'
    rights = ('K' in castling, 'k' in castling, 'Q' in castling, 'q' in castling)
    gs.currentCastlingRight = ChessEngine.CastleRights(*rights)
    gs.castleRightsLog = [ChessEngine.CastleRights(*rights)]
    if ep != '-':
        gs.enpassantPossible = (8 - int(ep[1]), 'abcdefgh'.index(ep[0]))
    return gs


def perft(gs, depth):
    if depth == 0:
        return 1
    count = 0
    for move in gs.getValidMoves():
        gs.makeMove(move)
        count += perft(gs, depth - 1)
        gs.undoMove()
    return count


class PerftTest(unittest.TestCase):
    def check(self, fen, depth, expected):
        gs = from_fen(fen)
        board_before = [row[:] for row in gs.board]
        self.assertEqual(perft(gs, depth), expected)
        self.assertEqual(gs.board, board_before, 'make/undo changed the board')

    def test_start_position(self):
        self.check('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 3, 8902)

    def test_kiwipete_castling_and_pins(self):
        self.check('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862)

    def test_en_passant_and_pins(self):
        self.check('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238)

    def test_promotions(self):
        self.check('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467)

    def test_promotion_with_check(self):
        self.check('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379)

    def test_rook_captured_at_home_loses_castling(self):
        # After Bxa8, Black must not castle queenside.
        # Reference count from chess.js.
        self.check('r3k2r/8/8/8/8/8/6B1/R3K2R w KQkq - 0 1', 3, 22803)


if __name__ == '__main__':
    unittest.main()
