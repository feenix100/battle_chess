# Rocket Battle Chess 3D

A standalone Battle Chess-inspired version of the 3D chess app.

Instead of melee combat, legal captures trigger piece-specific projectile attacks and target explosions:

- Pawn — micro rocket
- Knight — arcing homing missile
- Bishop — plasma lance
- Rook — heavy shell
- Queen — three-projectile seeker salvo
- King — royal shock orb

The chess result is always determined by standard chess rules via chess.js. The combat sequence is cinematic only.

## Run locally

Serve the repository with any static HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Publish the `main` branch from the repository root in **Settings → Pages**. The expected project URL is:

`https://feenix100.github.io/battle_chess/`

## Controls

Mouse, keyboard, and USB controller controls are inherited from the original 3D chess project. Captures lock move input until the projectile/explosion sequence has completed.

## Notes

- Capture effects pause the chess clock while they play.
- En passant targets the actually captured pawn square.
- Capture-promotion fires as a pawn, then the promoted piece appears after the effect.
- `prefers-reduced-motion` skips projectile travel and uses a shortened impact effect.
