"""Tests for the desktop AI. Run: python3 -m unittest discover desktop/tests"""

import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import ChessAI  # noqa: E402
from test_perft import from_fen  # noqa: E402


def best(fen, depth=ChessAI.DEPTH):
    gs = from_fen(fen)
    move = ChessAI.findBestMove(gs, gs.getValidMoves(), depth)
    return move.getChessNotation()


class AITest(unittest.TestCase):
    def test_mate_in_one(self):
        self.assertEqual(best('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), 'a1a8')

    def test_mate_in_one_for_black(self):
        self.assertEqual(best('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1'), 'a8a1')

    def test_takes_free_queen(self):
        self.assertEqual(best('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', depth=2), 'd1d5')

    def test_search_leaves_board_unchanged(self):
        gs = from_fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1')
        before = [row[:] for row in gs.board]
        ChessAI.findBestMove(gs, gs.getValidMoves(), 2)
        self.assertEqual(gs.board, before)

    def test_default_depth_is_fast_enough_to_play(self):
        start = time.time()
        best('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
        self.assertLess(time.time() - start, 10)


if __name__ == '__main__':
    unittest.main()
