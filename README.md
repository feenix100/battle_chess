# Battle Chess

A standalone version of the original Rain Dust 3D chess game.

This version intentionally keeps the original board, chess rules, appearance controls, clocks, mouse/keyboard/gamepad controls, STL support, move history, and captured-piece display.

The main difference is the capture presentation:

- Captures launch a 3D projectile from the attacking piece.
- Each piece class has a slightly different projectile profile.
- The captured piece explodes into debris at impact.
- Timed chess pauses during the capture animation.
- En passant uses the actual captured pawn square.
- Promotion happens normally after the capture animation.
- Reduced-motion users skip the battle animation.

Built with Three.js and chess.js.
