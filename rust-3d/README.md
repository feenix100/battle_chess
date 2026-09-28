# Battle Chess 3D — Rust

Native desktop 3D Battle Chess for the `battle_chess` repository.

This is a separate implementation from the browser app. It lives entirely in
`rust-3d/` and does not replace or modify the web version.

## Current features

- Native Bevy 3D board and procedural battle-character chess pieces
- Full legal chess rules via `shakmaty`
  - castling
  - en passant
  - promotion
  - check/checkmate
  - stalemate
  - insufficient material
  - fifty-move rule
  - threefold repetition tracking
- Mouse click-to-move
- Keyboard board cursor
- Camera orbit, zoom, and board flip
- Optional built-in CPU opponent
  - CPU can play White or Black
  - alpha-beta search with material/position evaluation
  - CPU-aware undo rolls back a full human/CPU exchange when possible
- Optional chess clocks
  - 1 / 5 / 10 minute presets
  - custom 0.25–180 minute setting
  - capture effects pause the clock
- Move history in SAN
- Captured-piece display behind each side
- Appearance controls
  - Walnut / Marble / Tournament / Slate / Obsidian / Neon board presets
  - Ivory / Walnut / Brass / Chrome / Glass / Neon piece presets
  - custom board, piece, background, and light colors
  - gloss/matte-style finish
  - knight orientation
- Battle captures
  - role-specific projectile size, arc, and timing
  - impact debris
  - optional animation toggle

## Run locally

A current stable Rust toolchain is required. `bevy_egui 0.42` requires Rust
1.95 or newer.

```bash
cd rust-3d
cargo run --release
```

On Linux, Bevy may require the normal X11/Wayland development packages for
your distribution.

## Controls

| Input | Action |
| --- | --- |
| Left click | Select a piece / choose destination |
| Arrow keys | Move board cursor |
| Enter / Space | Select cursor square |
| Escape | Cancel selection |
| Q / E | Orbit camera |
| F | Flip board |
| Z / X | Zoom in / out |

All major game settings are also available in the right-side HUD.

## Layout

```text
rust-3d/
├── Cargo.toml
└── src/
    ├── main.rs   Bevy scene, HUD, input, clocks, effects, rendering
    ├── game.rs   pure chess rules/history/capture/undo layer
    └── cpu.rs    built-in alpha-beta CPU
```

## Relationship to the web app

The browser Battle Chess remains the reference for feature parity and visual
direction. The native version intentionally starts with procedural geometry so
it can run as a self-contained local Rust program without requiring a browser
or JavaScript runtime.

The next parity targets are importing the repository's humanoid STL models,
gamepad controls, richer camera interaction, and more exact matching of the web
capture effects and materials.
