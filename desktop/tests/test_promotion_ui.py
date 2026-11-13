"""
The desktop app asks which piece to promote to. Drives the real pygame app
headlessly: plays to a promotion, cancels once with Escape, then picks a knight.
Skipped when pygame isn't installed.
"""

import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
os.environ.setdefault('SDL_AUDIODRIVER', 'dummy')

try:
    import pygame
except ImportError:  # pragma: no cover
    pygame = None


@unittest.skipUnless(pygame, 'pygame not installed')
class PromotionPickerTest(unittest.TestCase):
    def test_choose_knight_after_cancelling_once(self):
        import ChessEngine
        import ChessMain

        os.chdir(os.path.join(os.path.dirname(__file__), '..'))  # images/ is relative
        size = ChessMain.SQ_SIZE
        games, picks, seen = [], [], {}

        original_init = ChessEngine.GameState.__init__

        def remember_game(gs, *args, **kwargs):
            original_init(gs, *args, **kwargs)
            games.append(gs)

        original_choose = ChessMain.choosePromotion

        def remember_pick(screen, color):
            choice = original_choose(screen, color)
            picks.append(choice)
            return choice

        ChessEngine.GameState.__init__ = remember_game
        ChessMain.choosePromotion = remember_pick
        mouse = {'pos': (0, 0)}
        real_get_pos = pygame.mouse.get_pos
        pygame.mouse.get_pos = lambda: mouse['pos']

        def click(square):
            col, row = 'abcdefgh'.index(square[0]), 8 - int(square[1])
            mouse['pos'] = (col * size + size // 2, row * size + size // 2)
            pygame.event.post(pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=mouse['pos'], button=1))

        def key(k):
            pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=k, mod=0, unicode=''))

        def script():
            time.sleep(1.0)
            key(pygame.K_1)  # two-player mode
            time.sleep(0.5)
            for m in 'a2a4 b7b5 a4b5 a7a6 b5a6 c8b7 a6b7 b8c6'.split():
                click(m[:2]); time.sleep(0.2); click(m[2:]); time.sleep(0.5)
            click('b7'); time.sleep(0.3); click('a8'); time.sleep(1.0)
            key(pygame.K_ESCAPE); time.sleep(1.0)
            seen['after_cancel'] = (games[-1].board[1][1], games[-1].board[0][0])
            click('b7'); time.sleep(0.3); click('a8'); time.sleep(1.0)
            key(pygame.K_n); time.sleep(1.0)
            pygame.event.post(pygame.event.Event(pygame.QUIT))

        threading.Thread(target=script, daemon=True).start()
        try:
            ChessMain.main()
        except SystemExit:
            pass
        finally:
            ChessEngine.GameState.__init__ = original_init
            ChessMain.choosePromotion = original_choose
            pygame.mouse.get_pos = real_get_pos

        self.assertEqual(picks, [None, 'N'])
        self.assertEqual(seen['after_cancel'], ('wp', 'bR'))  # Escape left the pawn on b7
        self.assertEqual(games[-1].board[0][0], 'wN')


if __name__ == '__main__':
    unittest.main()
