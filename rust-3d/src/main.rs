//! Native 3D Battle Chess.
//!
//! This binary keeps the web game's core idea—local chess with optional CPU,
//! clocks, appearance controls, captured-piece display, and battle capture
//! effects—but runs as a standalone Bevy desktop application.

mod cpu;
mod game;

use std::f32::consts::PI;

use anyhow::Result;
use bevy::{
    math::primitives::InfinitePlane3d,
    prelude::*,
    window::{PrimaryWindow, WindowResolution},
};
use bevy_egui::{egui, EguiContexts, EguiPlugin, EguiPrimaryContextPass};
use shakmaty::{Color as ChessColor, Move, Piece as ChessPiece, Role, Square};

use cpu::choose_cpu_move;
use game::{
    capture_square, color_name, display_move_to, move_from, square_from_indices, square_indices,
    status_text, BattleGame,
};

const CPU_DELAY_SECONDS: f32 = 0.42;
const BOARD_Y: f32 = 0.0;

fn main() {
    App::new()
        .insert_resource(ClearColor(Color::srgb(0.56, 0.67, 0.74)))
        .add_plugins(
            DefaultPlugins.set(WindowPlugin {
                primary_window: Some(Window {
                    title: "Battle Chess 3D — Rust".to_owned(),
                    resolution: WindowResolution::new(1320, 860),
                    resize_constraints: bevy::window::WindowResizeConstraints {
                        min_width: 900.0,
                        min_height: 620.0,
                        ..default()
                    },
                    ..default()
                }),
                ..default()
            }),
        )
        .add_plugins(EguiPlugin::default())
        .init_resource::<BattleGame>()
        .init_resource::<InteractionState>()
        .init_resource::<CpuSettings>()
        .init_resource::<ChessClock>()
        .init_resource::<Appearance>()
        .init_resource::<BattleSettings>()
        .init_resource::<CameraRig>()
        .init_resource::<SceneSync>()
        .init_resource::<UiCapture>()
        .init_resource::<FxPause>()
        .add_systems(Startup, setup_scene)
        .add_systems(
            EguiPrimaryContextPass,
            (hud_system, board_input_system).chain(),
        )
        .add_systems(
            Update,
            (
                cpu_turn_system,
                clock_system,
                appearance_system,
                sync_scene_system,
                capture_fx_system,
                camera_system,
            )
                .chain(),
        )
        .run();
}

// ============================================================
// Resources
// ============================================================

#[derive(Resource)]
struct InteractionState {
    selected: Option<Square>,
    legal_destinations: Vec<Square>,
    keyboard_cursor: Square,
    pending_promotion: Option<Vec<Move>>,
    show_legal_moves: bool,
}

impl Default for InteractionState {
    fn default() -> Self {
        Self {
            selected: None,
            legal_destinations: Vec::new(),
            keyboard_cursor: Square::E2,
            pending_promotion: None,
            show_legal_moves: true,
        }
    }
}

impl InteractionState {
    fn clear_selection(&mut self) {
        self.selected = None;
        self.legal_destinations.clear();
    }

    fn reset(&mut self) {
        *self = Self::default();
    }
}

#[derive(Resource)]
struct CpuSettings {
    enabled: bool,
    color: ChessColor,
    delay_remaining: f32,
}

impl Default for CpuSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            color: ChessColor::Black,
            delay_remaining: CPU_DELAY_SECONDS,
        }
    }
}

#[derive(Resource)]
struct ChessClock {
    enabled: bool,
    initial_seconds: f32,
    white_seconds: f32,
    black_seconds: f32,
    timed_out: Option<ChessColor>,
}

impl Default for ChessClock {
    fn default() -> Self {
        Self {
            enabled: false,
            initial_seconds: 5.0 * 60.0,
            white_seconds: 5.0 * 60.0,
            black_seconds: 5.0 * 60.0,
            timed_out: None,
        }
    }
}

impl ChessClock {
    fn reset(&mut self) {
        self.white_seconds = self.initial_seconds;
        self.black_seconds = self.initial_seconds;
        self.timed_out = None;
    }

    fn set_minutes(&mut self, minutes: f32) {
        self.initial_seconds = minutes.clamp(0.25, 180.0) * 60.0;
        self.reset();
    }

    fn remaining_mut(&mut self, color: ChessColor) -> &mut f32 {
        match color {
            ChessColor::White => &mut self.white_seconds,
            ChessColor::Black => &mut self.black_seconds,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BoardPreset {
    Walnut,
    Marble,
    Tournament,
    Slate,
    Obsidian,
    Neon,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PiecePreset {
    Ivory,
    Walnut,
    Brass,
    Chrome,
    Glass,
    Neon,
}

#[derive(Resource)]
struct Appearance {
    board_preset: BoardPreset,
    piece_preset: PiecePreset,
    light_square: [f32; 3],
    dark_square: [f32; 3],
    background: [f32; 3],
    light_color: [f32; 3],
    white_piece: [f32; 3],
    black_piece: [f32; 3],
    board_roughness: f32,
    board_metallic: f32,
    piece_roughness: f32,
    piece_metallic: f32,
    glossy: bool,
    show_captured: bool,
    captured_upright: bool,
    knight_orientation: i32,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            board_preset: BoardPreset::Walnut,
            piece_preset: PiecePreset::Ivory,
            light_square: hex_rgb(0xd7bd96),
            dark_square: hex_rgb(0x6d4327),
            background: hex_rgb(0x8faabd),
            light_color: hex_rgb(0xfff8ee),
            white_piece: hex_rgb(0xefe8d7),
            black_piece: hex_rgb(0x252525),
            board_roughness: 0.58,
            board_metallic: 0.01,
            piece_roughness: 0.62,
            piece_metallic: 0.02,
            glossy: false,
            show_captured: true,
            captured_upright: false,
            knight_orientation: 0,
        }
    }
}

impl Appearance {
    fn apply_board_preset(&mut self) {
        let (light, dark, roughness, metallic) = match self.board_preset {
            BoardPreset::Walnut => (0xd7bd96, 0x6d4327, 0.58, 0.01),
            BoardPreset::Marble => (0xe4e2dd, 0x5d6571, 0.32, 0.03),
            BoardPreset::Tournament => (0xe8e2cf, 0x4f765c, 0.72, 0.0),
            BoardPreset::Slate => (0xb7bec5, 0x3a4249, 0.88, 0.02),
            BoardPreset::Obsidian => (0xc8cbd0, 0x17191d, 0.20, 0.16),
            BoardPreset::Neon => (0x7ce9e3, 0x46316e, 0.28, 0.18),
        };
        self.light_square = hex_rgb(light);
        self.dark_square = hex_rgb(dark);
        self.board_roughness = roughness;
        self.board_metallic = metallic;
    }

    fn apply_piece_preset(&mut self) {
        let (white, black, roughness, metallic) = match self.piece_preset {
            PiecePreset::Ivory => (0xefe8d7, 0x252525, 0.62, 0.02),
            PiecePreset::Walnut => (0xc7935f, 0x4a2b19, 0.74, 0.0),
            PiecePreset::Brass => (0xe1bd62, 0x414750, 0.28, 0.82),
            PiecePreset::Chrome => (0xe4ebf2, 0x5b6570, 0.18, 0.95),
            PiecePreset::Glass => (0xd6f4ff, 0x466173, 0.10, 0.12),
            PiecePreset::Neon => (0x72fff0, 0xff4fd8, 0.22, 0.30),
        };
        self.white_piece = hex_rgb(white);
        self.black_piece = hex_rgb(black);
        self.piece_roughness = roughness;
        self.piece_metallic = metallic;
    }
}

#[derive(Resource)]
struct BattleSettings {
    animations: bool,
}

impl Default for BattleSettings {
    fn default() -> Self {
        Self { animations: true }
    }
}

#[derive(Resource)]
struct CameraRig {
    orbit: f32,
    distance: f32,
    height: f32,
    flipped: bool,
}

impl Default for CameraRig {
    fn default() -> Self {
        Self {
            orbit: 0.0,
            distance: 11.8,
            height: 8.7,
            flipped: false,
        }
    }
}

#[derive(Resource, Default)]
struct SceneSync {
    dirty: bool,
    pending_fx: Option<CaptureFxRequest>,
}

#[derive(Resource, Default)]
struct UiCapture {
    pointer: bool,
    keyboard: bool,
}

#[derive(Resource, Default)]
struct FxPause {
    remaining: f32,
}

#[derive(Resource)]
struct SceneHandles {
    cube: Handle<Mesh>,
    light_square: Handle<StandardMaterial>,
    dark_square: Handle<StandardMaterial>,
    board_base: Handle<StandardMaterial>,
    white_piece: Handle<StandardMaterial>,
    black_piece: Handle<StandardMaterial>,
    selected: Handle<StandardMaterial>,
    legal: Handle<StandardMaterial>,
    capture: Handle<StandardMaterial>,
    cursor: Handle<StandardMaterial>,
    fx: Handle<StandardMaterial>,
}

#[derive(Clone, Copy)]
struct CaptureFxRequest {
    from: Square,
    target: Square,
    role: Role,
}

// ============================================================
// Scene components
// ============================================================

#[derive(Component)]
struct MainCamera;

#[derive(Component)]
struct KeyLight;

#[derive(Component)]
struct PieceVisual;

#[derive(Component)]
struct HighlightVisual;

#[derive(Component)]
struct Projectile {
    start: Vec3,
    end: Vec3,
    elapsed: f32,
    duration: f32,
    arc: f32,
}

#[derive(Component)]
struct Debris {
    velocity: Vec3,
    remaining: f32,
}

// ============================================================
// Startup
// ============================================================

fn setup_scene(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    appearance: Res<Appearance>,
    mut scene_sync: ResMut<SceneSync>,
) {
    let cube = meshes.add(Cuboid::default());

    let light_square = materials.add(board_material(
        rgb(appearance.light_square),
        appearance.board_roughness,
        appearance.board_metallic,
    ));
    let dark_square = materials.add(board_material(
        rgb(appearance.dark_square),
        appearance.board_roughness,
        appearance.board_metallic,
    ));
    let board_base = materials.add(StandardMaterial {
        base_color: Color::srgb(0.08, 0.06, 0.05),
        perceptual_roughness: 0.48,
        metallic: 0.08,
        ..default()
    });
    let white_piece = materials.add(piece_material(
        rgb(appearance.white_piece),
        appearance.piece_roughness,
        appearance.piece_metallic,
        appearance.glossy,
    ));
    let black_piece = materials.add(piece_material(
        rgb(appearance.black_piece),
        appearance.piece_roughness,
        appearance.piece_metallic,
        appearance.glossy,
    ));

    let selected = materials.add(StandardMaterial {
        base_color: Color::srgb(1.0, 0.63, 0.12),
        perceptual_roughness: 0.35,
        ..default()
    });
    let legal = materials.add(StandardMaterial {
        base_color: Color::srgb(0.18, 0.78, 0.36),
        perceptual_roughness: 0.45,
        ..default()
    });
    let capture = materials.add(StandardMaterial {
        base_color: Color::srgb(0.94, 0.18, 0.12),
        perceptual_roughness: 0.38,
        ..default()
    });
    let cursor = materials.add(StandardMaterial {
        base_color: Color::srgb(0.12, 0.80, 0.92),
        perceptual_roughness: 0.35,
        ..default()
    });
    let fx = materials.add(StandardMaterial {
        base_color: Color::srgb(1.0, 0.34, 0.06),
        perceptual_roughness: 0.18,
        metallic: 0.45,
        ..default()
    });

    let handles = SceneHandles {
        cube: cube.clone(),
        light_square: light_square.clone(),
        dark_square: dark_square.clone(),
        board_base,
        white_piece,
        black_piece,
        selected,
        legal,
        capture,
        cursor,
        fx,
    };

    commands.spawn((
        Mesh3d(cube.clone()),
        MeshMaterial3d(handles.board_base.clone()),
        Transform::from_xyz(0.0, -0.12, 0.0).with_scale(Vec3::new(9.2, 0.20, 9.2)),
    ));

    for rank in 0..8 {
        for file in 0..8 {
            let is_light = (file + rank) % 2 == 0;
            commands.spawn((
                Mesh3d(cube.clone()),
                MeshMaterial3d(if is_light {
                    light_square.clone()
                } else {
                    dark_square.clone()
                }),
                Transform::from_xyz(file as f32 - 3.5, BOARD_Y, 3.5 - rank as f32)
                    .with_scale(Vec3::new(0.98, 0.12, 0.98)),
            ));
        }
    }

    commands.spawn((
        DirectionalLight {
            color: rgb(appearance.light_color),
            illuminance: 16_000.0,
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_xyz(5.0, 10.0, 6.0).looking_at(Vec3::ZERO, Vec3::Y),
        KeyLight,
    ));

    commands.spawn((
        PointLight {
            intensity: 1_100_000.0,
            range: 28.0,
            ..default()
        },
        Transform::from_xyz(-6.0, 7.0, -5.0),
    ));

    commands.spawn((
        Camera3d::default(),
        Camera {
            clear_color: rgb(appearance.background).into(),
            ..default()
        },
        Transform::from_xyz(0.0, 8.7, 11.8).looking_at(Vec3::new(0.0, 0.4, 0.0), Vec3::Y),
        MainCamera,
    ));

    commands.insert_resource(handles);
    scene_sync.dirty = true;
}

// ============================================================
// User interface
// ============================================================

#[allow(clippy::too_many_arguments)]
fn hud_system(
    mut contexts: EguiContexts,
    mut game: ResMut<BattleGame>,
    mut interaction: ResMut<InteractionState>,
    mut cpu: ResMut<CpuSettings>,
    mut clock: ResMut<ChessClock>,
    mut appearance: ResMut<Appearance>,
    mut battle: ResMut<BattleSettings>,
    mut camera: ResMut<CameraRig>,
    mut scene_sync: ResMut<SceneSync>,
    mut ui_capture: ResMut<UiCapture>,
    mut fx_pause: ResMut<FxPause>,
) -> Result {
    let ctx = contexts.ctx_mut()?;

    egui::SidePanel::right("battle-chess-controls")
        .default_width(330.0)
        .min_width(290.0)
        .show(ctx, |ui| {
            ui.heading("Battle Chess 3D");
            ui.label(status_text(&game));

            if let Some(loser) = clock.timed_out {
                ui.colored_label(
                    egui::Color32::LIGHT_RED,
                    format!(
                        "{} wins on time",
                        color_name(match loser {
                            ChessColor::White => ChessColor::Black,
                            ChessColor::Black => ChessColor::White,
                        })
                    ),
                );
            }

            ui.separator();
            ui.horizontal(|ui| {
                if ui.button("New game").clicked() {
                    game.reset();
                    interaction.reset();
                    clock.reset();
                    cpu.delay_remaining = CPU_DELAY_SECONDS;
                    fx_pause.remaining = 0.0;
                    scene_sync.pending_fx = None;
                    scene_sync.dirty = true;
                }

                if ui.button("Undo").clicked() && game.can_undo() {
                    perform_undo(
                        &mut game,
                        &mut interaction,
                        &mut clock,
                        &mut cpu,
                        &mut scene_sync,
                    );
                }

                if ui.button("Flip").clicked() {
                    camera.flipped = !camera.flipped;
                    scene_sync.dirty = true;
                }
            });

            ui.horizontal(|ui| {
                if ui
                    .selectable_label(cpu.enabled, if cpu.enabled { "CPU: On" } else { "CPU: Off" })
                    .clicked()
                {
                    cpu.enabled = !cpu.enabled;
                    cpu.delay_remaining = CPU_DELAY_SECONDS;
                    interaction.clear_selection();
                    scene_sync.dirty = true;
                }
                if ui
                    .button(format!("CPU Side: {}", color_name(cpu.color)))
                    .clicked()
                {
                    cpu.color = match cpu.color {
                        ChessColor::White => ChessColor::Black,
                        ChessColor::Black => ChessColor::White,
                    };
                    cpu.delay_remaining = CPU_DELAY_SECONDS;
                    interaction.clear_selection();
                    scene_sync.dirty = true;
                }
            });

            ui.horizontal(|ui| {
                ui.checkbox(&mut battle.animations, "Battle animations");
                if ui
                    .checkbox(&mut interaction.show_legal_moves, "Legal moves")
                    .changed()
                {
                    scene_sync.dirty = true;
                }
            });

            ui.collapsing("Chess clock", |ui| {
                if ui.checkbox(&mut clock.enabled, "Timed chess").changed() {
                    if clock.enabled {
                        clock.reset();
                    } else {
                        clock.timed_out = None;
                    }
                }

                ui.horizontal(|ui| {
                    if ui.button("1 min").clicked() {
                        clock.set_minutes(1.0);
                    }
                    if ui.button("5 min").clicked() {
                        clock.set_minutes(5.0);
                    }
                    if ui.button("10 min").clicked() {
                        clock.set_minutes(10.0);
                    }
                });

                let mut custom_minutes = clock.initial_seconds / 60.0;
                ui.horizontal(|ui| {
                    ui.label("Custom");
                    if ui
                        .add(
                            egui::DragValue::new(&mut custom_minutes)
                                .range(0.25..=180.0)
                                .speed(0.25)
                                .suffix(" min"),
                        )
                        .changed()
                    {
                        clock.set_minutes(custom_minutes);
                    }
                });

                ui.monospace(format!(
                    "White {}   Black {}",
                    format_clock(clock.white_seconds),
                    format_clock(clock.black_seconds)
                ));
            });

            ui.collapsing("Appearance", |ui| {
                let previous_board = appearance.board_preset;
                egui::ComboBox::from_label("Board")
                    .selected_text(format!("{:?}", appearance.board_preset))
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut appearance.board_preset, BoardPreset::Walnut, "Walnut");
                        ui.selectable_value(&mut appearance.board_preset, BoardPreset::Marble, "Marble");
                        ui.selectable_value(
                            &mut appearance.board_preset,
                            BoardPreset::Tournament,
                            "Tournament",
                        );
                        ui.selectable_value(&mut appearance.board_preset, BoardPreset::Slate, "Slate");
                        ui.selectable_value(
                            &mut appearance.board_preset,
                            BoardPreset::Obsidian,
                            "Obsidian",
                        );
                        ui.selectable_value(&mut appearance.board_preset, BoardPreset::Neon, "Neon");
                    });
                if previous_board != appearance.board_preset {
                    appearance.apply_board_preset();
                }

                let previous_piece = appearance.piece_preset;
                egui::ComboBox::from_label("Pieces")
                    .selected_text(format!("{:?}", appearance.piece_preset))
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut appearance.piece_preset, PiecePreset::Ivory, "Ivory & ebony");
                        ui.selectable_value(&mut appearance.piece_preset, PiecePreset::Walnut, "Carved wood");
                        ui.selectable_value(&mut appearance.piece_preset, PiecePreset::Brass, "Brass & gunmetal");
                        ui.selectable_value(&mut appearance.piece_preset, PiecePreset::Chrome, "Chrome");
                        ui.selectable_value(&mut appearance.piece_preset, PiecePreset::Glass, "Glass");
                        ui.selectable_value(&mut appearance.piece_preset, PiecePreset::Neon, "Neon");
                    });
                if previous_piece != appearance.piece_preset {
                    appearance.apply_piece_preset();
                }

                ui.checkbox(&mut appearance.glossy, "Gloss finish");

                ui.label("Light square");
                ui.color_edit_button_rgb(&mut appearance.light_square);
                ui.label("Dark square");
                ui.color_edit_button_rgb(&mut appearance.dark_square);
                ui.label("White pieces");
                ui.color_edit_button_rgb(&mut appearance.white_piece);
                ui.label("Black pieces");
                ui.color_edit_button_rgb(&mut appearance.black_piece);
                ui.label("Background");
                ui.color_edit_button_rgb(&mut appearance.background);
                ui.label("Scene light");
                ui.color_edit_button_rgb(&mut appearance.light_color);

                let previous_orientation = appearance.knight_orientation;
                egui::ComboBox::from_label("Knight orientation")
                    .selected_text(format!("{}°", appearance.knight_orientation))
                    .show_ui(ui, |ui| {
                        for degrees in [0, 90, 180, 270] {
                            ui.selectable_value(
                                &mut appearance.knight_orientation,
                                degrees,
                                format!("{degrees}°"),
                            );
                        }
                    });
                if previous_orientation != appearance.knight_orientation {
                    scene_sync.dirty = true;
                }

                if ui
                    .checkbox(&mut appearance.show_captured, "Show captured pieces")
                    .changed()
                {
                    scene_sync.dirty = true;
                }
                if ui
                    .checkbox(&mut appearance.captured_upright, "Captured upright")
                    .changed()
                {
                    scene_sync.dirty = true;
                }
            });

            ui.separator();
            ui.heading(format!("Move history ({})", game.history_len()));
            egui::ScrollArea::vertical()
                .max_height(230.0)
                .stick_to_bottom(true)
                .show(ui, |ui| {
                    for line in game.formatted_history() {
                        ui.monospace(line);
                    }
                });

            ui.separator();
            ui.small("Mouse: click piece then destination");
            ui.small("Arrows: move cursor · Enter: select · Esc: cancel");
            ui.small("Q/E: orbit camera · F: flip · Z/X: zoom");
        });

    if let Some(candidates) = interaction.pending_promotion.clone() {
        let mut chosen = None;
        egui::Window::new("Choose promotion")
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .collapsible(false)
            .resizable(false)
            .show(ctx, |ui| {
                for (label, role) in [
                    ("Queen", Role::Queen),
                    ("Rook", Role::Rook),
                    ("Bishop", Role::Bishop),
                    ("Knight", Role::Knight),
                ] {
                    if ui.button(label).clicked() {
                        chosen = candidates
                            .iter()
                            .find(|mv| mv.clone().promotion() == Some(role))
                            .cloned();
                    }
                }
            });

        if let Some(mv) = chosen {
            interaction.pending_promotion = None;
            commit_move(
                &mut game,
                mv,
                &mut interaction,
                &mut cpu,
                &clock,
                &battle,
                &mut scene_sync,
                &mut fx_pause,
            );
        }
    }

    ui_capture.pointer = ctx.wants_pointer_input();
    ui_capture.keyboard = ctx.wants_keyboard_input();
    Ok(())
}

// ============================================================
// Input and game flow
// ============================================================

#[allow(clippy::too_many_arguments)]
fn board_input_system(
    mouse: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    windows: Query<&Window, With<PrimaryWindow>>,
    cameras: Query<(&Camera, &GlobalTransform), With<MainCamera>>,
    ui_capture: Res<UiCapture>,
    mut game: ResMut<BattleGame>,
    mut interaction: ResMut<InteractionState>,
    mut cpu: ResMut<CpuSettings>,
    clock: Res<ChessClock>,
    battle: Res<BattleSettings>,
    camera_rig: Res<CameraRig>,
    mut scene_sync: ResMut<SceneSync>,
    mut fx_pause: ResMut<FxPause>,
) {
    if interaction.pending_promotion.is_some()
        || game.outcome().is_some()
        || clock.timed_out.is_some()
        || (cpu.enabled && game.side_to_move() == cpu.color)
    {
        return;
    }

    if !ui_capture.keyboard {
        let mut file_delta = 0;
        let mut rank_delta = 0;
        if keys.just_pressed(KeyCode::ArrowLeft) {
            file_delta = if camera_rig.flipped { 1 } else { -1 };
        }
        if keys.just_pressed(KeyCode::ArrowRight) {
            file_delta = if camera_rig.flipped { -1 } else { 1 };
        }
        if keys.just_pressed(KeyCode::ArrowUp) {
            rank_delta = if camera_rig.flipped { -1 } else { 1 };
        }
        if keys.just_pressed(KeyCode::ArrowDown) {
            rank_delta = if camera_rig.flipped { 1 } else { -1 };
        }

        if file_delta != 0 || rank_delta != 0 {
            let (file, rank) = square_indices(interaction.keyboard_cursor);
            let next_file = (file as i32 + file_delta).clamp(0, 7) as usize;
            let next_rank = (rank as i32 + rank_delta).clamp(0, 7) as usize;
            interaction.keyboard_cursor = square_from_indices(next_file, next_rank);
            scene_sync.dirty = true;
        }

        if keys.just_pressed(KeyCode::Escape) {
            interaction.clear_selection();
            scene_sync.dirty = true;
        }

        if keys.just_pressed(KeyCode::Enter) || keys.just_pressed(KeyCode::Space) {
            let square = interaction.keyboard_cursor;
            handle_square_action(
                square,
                &mut game,
                &mut interaction,
                &mut cpu,
                &clock,
                &battle,
                &mut scene_sync,
                &mut fx_pause,
            );
        }
    }

    if ui_capture.pointer || !mouse.just_pressed(MouseButton::Left) {
        return;
    }

    let Some(window) = windows.iter().next() else {
        return;
    };
    let Some(cursor) = window.cursor_position() else {
        return;
    };
    let Some((camera, camera_transform)) = cameras.iter().next() else {
        return;
    };
    let Ok(ray) = camera.viewport_to_world(camera_transform, cursor) else {
        return;
    };
    let Some(point) =
        ray.plane_intersection_point(Vec3::ZERO, InfinitePlane3d::new(Vec3::Y))
    else {
        return;
    };
    let Some(square) = square_from_world(point) else {
        return;
    };

    interaction.keyboard_cursor = square;
    handle_square_action(
        square,
        &mut game,
        &mut interaction,
        &mut cpu,
        &clock,
        &battle,
        &mut scene_sync,
        &mut fx_pause,
    );
}

#[allow(clippy::too_many_arguments)]
fn handle_square_action(
    square: Square,
    game: &mut BattleGame,
    interaction: &mut InteractionState,
    cpu: &mut CpuSettings,
    clock: &ChessClock,
    battle: &BattleSettings,
    scene_sync: &mut SceneSync,
    fx_pause: &mut FxPause,
) {
    if clock.timed_out.is_some() || game.outcome().is_some() {
        return;
    }

    if Some(square) == interaction.selected {
        interaction.clear_selection();
        scene_sync.dirty = true;
        return;
    }

    if let Some(piece) = game.piece_at(square) {
        if piece.color == game.side_to_move() {
            select_square(square, game, interaction);
            scene_sync.dirty = true;
            return;
        }
    }

    let Some(from) = interaction.selected else {
        return;
    };
    let candidates = game.legal_moves_between(from, square);
    if candidates.is_empty() {
        return;
    }

    if candidates.len() > 1 {
        interaction.pending_promotion = Some(candidates);
        return;
    }

    if let Some(mv) = candidates.into_iter().next() {
        commit_move(
            game,
            mv,
            interaction,
            cpu,
            clock,
            battle,
            scene_sync,
            fx_pause,
        );
    }
}

fn select_square(square: Square, game: &BattleGame, interaction: &mut InteractionState) {
    interaction.selected = Some(square);
    interaction.legal_destinations.clear();
    for mv in game.legal_moves_from(square) {
        if let Some(target) = display_move_to(&mv) {
            if !interaction.legal_destinations.contains(&target) {
                interaction.legal_destinations.push(target);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn commit_move(
    game: &mut BattleGame,
    mv: Move,
    interaction: &mut InteractionState,
    cpu: &mut CpuSettings,
    clock: &ChessClock,
    battle: &BattleSettings,
    scene_sync: &mut SceneSync,
    fx_pause: &mut FxPause,
) {
    if clock.timed_out.is_some() {
        return;
    }

    let fx_request = if battle.animations {
        match (move_from(&mv), capture_square(&mv)) {
            (Some(from), Some(target)) => Some(CaptureFxRequest {
                from,
                target,
                role: mv.clone().role(),
            }),
            _ => None,
        }
    } else {
        None
    };

    if game.play(mv).is_ok() {
        interaction.clear_selection();
        interaction.pending_promotion = None;
        cpu.delay_remaining = CPU_DELAY_SECONDS;
        scene_sync.pending_fx = fx_request;
        scene_sync.dirty = true;
        if fx_request.is_some() {
            fx_pause.remaining = 0.78;
        }
    }
}

fn perform_undo(
    game: &mut BattleGame,
    interaction: &mut InteractionState,
    clock: &mut ChessClock,
    cpu: &mut CpuSettings,
    scene_sync: &mut SceneSync,
) {
    if game.undo().is_none() {
        return;
    }

    // Match the browser behavior: in CPU mode, undo the CPU move and the
    // preceding human move when that returns control to the CPU side.
    if cpu.enabled && game.can_undo() && game.side_to_move() == cpu.color {
        game.undo();
    }

    interaction.clear_selection();
    interaction.pending_promotion = None;
    clock.timed_out = None;
    cpu.delay_remaining = CPU_DELAY_SECONDS;
    scene_sync.pending_fx = None;
    scene_sync.dirty = true;
}

// ============================================================
// CPU and clocks
// ============================================================

#[allow(clippy::too_many_arguments)]
fn cpu_turn_system(
    time: Res<Time>,
    mut game: ResMut<BattleGame>,
    mut cpu: ResMut<CpuSettings>,
    clock: Res<ChessClock>,
    battle: Res<BattleSettings>,
    mut interaction: ResMut<InteractionState>,
    mut scene_sync: ResMut<SceneSync>,
    mut fx_pause: ResMut<FxPause>,
) {
    let cpu_turn = cpu.enabled
        && game.side_to_move() == cpu.color
        && game.outcome().is_none()
        && clock.timed_out.is_none()
        && interaction.pending_promotion.is_none();

    if !cpu_turn || fx_pause.remaining > 0.0 {
        cpu.delay_remaining = CPU_DELAY_SECONDS;
        return;
    }

    cpu.delay_remaining -= time.delta_secs();
    if cpu.delay_remaining > 0.0 {
        return;
    }

    let Some(mv) = choose_cpu_move(game.position(), cpu.color) else {
        return;
    };
    commit_move(
        &mut game,
        mv,
        &mut interaction,
        &mut cpu,
        &clock,
        &battle,
        &mut scene_sync,
        &mut fx_pause,
    );
}

fn clock_system(
    time: Res<Time>,
    game: Res<BattleGame>,
    mut clock: ResMut<ChessClock>,
    mut interaction: ResMut<InteractionState>,
    fx_pause: Res<FxPause>,
) {
    if !clock.enabled
        || !game.has_started()
        || game.outcome().is_some()
        || clock.timed_out.is_some()
        || fx_pause.remaining > 0.0
    {
        return;
    }

    let side = game.side_to_move();
    let remaining = clock.remaining_mut(side);
    *remaining = (*remaining - time.delta_secs()).max(0.0);
    if *remaining <= 0.0 {
        clock.timed_out = Some(side);
        interaction.clear_selection();
    }
}

// ============================================================
// Scene synchronization and appearance
// ============================================================

fn appearance_system(
    appearance: Res<Appearance>,
    handles: Option<Res<SceneHandles>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut camera_query: Query<&mut Camera, With<MainCamera>>,
    mut light_query: Query<&mut DirectionalLight, With<KeyLight>>,
) {
    if !appearance.is_changed() {
        return;
    }
    let Some(handles) = handles else {
        return;
    };

    if let Some(material) = materials.get_mut(&handles.light_square) {
        material.base_color = rgb(appearance.light_square);
        material.perceptual_roughness = appearance.board_roughness;
        material.metallic = appearance.board_metallic;
    }
    if let Some(material) = materials.get_mut(&handles.dark_square) {
        material.base_color = rgb(appearance.dark_square);
        material.perceptual_roughness = appearance.board_roughness;
        material.metallic = appearance.board_metallic;
    }
    if let Some(material) = materials.get_mut(&handles.white_piece) {
        *material = piece_material(
            rgb(appearance.white_piece),
            appearance.piece_roughness,
            appearance.piece_metallic,
            appearance.glossy,
        );
    }
    if let Some(material) = materials.get_mut(&handles.black_piece) {
        *material = piece_material(
            rgb(appearance.black_piece),
            appearance.piece_roughness,
            appearance.piece_metallic,
            appearance.glossy,
        );
    }
    for mut camera in &mut camera_query {
        camera.clear_color = rgb(appearance.background).into();
    }
    for mut light in &mut light_query {
        light.color = rgb(appearance.light_color);
    }
}

#[allow(clippy::too_many_arguments)]
fn sync_scene_system(
    mut commands: Commands,
    game: Res<BattleGame>,
    interaction: Res<InteractionState>,
    appearance: Res<Appearance>,
    handles: Option<Res<SceneHandles>>,
    mut scene_sync: ResMut<SceneSync>,
    piece_query: Query<Entity, With<PieceVisual>>,
    highlight_query: Query<Entity, With<HighlightVisual>>,
) {
    if !scene_sync.dirty {
        return;
    }
    let Some(handles) = handles else {
        return;
    };

    for entity in &piece_query {
        commands.entity(entity).despawn();
    }
    for entity in &highlight_query {
        commands.entity(entity).despawn();
    }

    for rank in 0..8 {
        for file in 0..8 {
            let square = square_from_indices(file, rank);
            if let Some(piece) = game.piece_at(square) {
                spawn_piece_visual(
                    &mut commands,
                    &handles,
                    piece,
                    square_world(square),
                    0.68,
                    false,
                    appearance.knight_orientation,
                );
            }
        }
    }

    if appearance.show_captured {
        let mut white_count = 0usize;
        let mut black_count = 0usize;
        for captured in game.captured_pieces() {
            let index = match captured.captured_by {
                ChessColor::White => {
                    let current = white_count;
                    white_count += 1;
                    current
                }
                ChessColor::Black => {
                    let current = black_count;
                    black_count += 1;
                    current
                }
            };
            let col = index % 8;
            let row = index / 8;
            let x = -2.75 + col as f32 * 0.78;
            let z = match captured.captured_by {
                ChessColor::White => 5.10 + row as f32 * 0.72,
                ChessColor::Black => -5.10 - row as f32 * 0.72,
            };
            spawn_piece_visual(
                &mut commands,
                &handles,
                captured.piece,
                Vec3::new(x, 0.03, z),
                0.42,
                !appearance.captured_upright,
                appearance.knight_orientation,
            );
        }
    }

    if let Some(selected) = interaction.selected {
        spawn_highlight(
            &mut commands,
            &handles,
            selected,
            handles.selected.clone(),
            0.15,
        );

        if interaction.show_legal_moves {
            for target in &interaction.legal_destinations {
                let capture = game
                    .legal_moves_between(selected, *target)
                    .iter()
                    .any(|mv| mv.clone().is_capture());
                spawn_highlight(
                    &mut commands,
                    &handles,
                    *target,
                    if capture {
                        handles.capture.clone()
                    } else {
                        handles.legal.clone()
                    },
                    0.14,
                );
            }
        }
    }

    spawn_highlight(
        &mut commands,
        &handles,
        interaction.keyboard_cursor,
        handles.cursor.clone(),
        0.13,
    );

    if let Some((from, to)) = game.last_move_squares() {
        if interaction.selected.is_none() {
            spawn_highlight(
                &mut commands,
                &handles,
                from,
                handles.cursor.clone(),
                0.125,
            );
            spawn_highlight(
                &mut commands,
                &handles,
                to,
                handles.cursor.clone(),
                0.125,
            );
        }
    }

    if let Some(request) = scene_sync.pending_fx.take() {
        spawn_projectile(&mut commands, &handles, request);
    }

    scene_sync.dirty = false;
}

fn spawn_piece_visual(
    commands: &mut Commands,
    handles: &SceneHandles,
    piece: ChessPiece,
    world_position: Vec3,
    scale: f32,
    upside_down: bool,
    knight_orientation: i32,
) {
    let material = match piece.color {
        ChessColor::White => handles.white_piece.clone(),
        ChessColor::Black => handles.black_piece.clone(),
    };

    let mut transform = Transform::from_translation(world_position).with_scale(Vec3::splat(scale));
    let knight_rotation = if piece.role == Role::Knight {
        (knight_orientation as f32).to_radians()
    } else {
        0.0
    };
    transform.rotation = Quat::from_rotation_x(if upside_down { PI } else { 0.0 })
        * Quat::from_rotation_y(knight_rotation);

    commands
        .spawn((transform, PieceVisual))
        .with_children(|parent| {
            let mut part = |position: Vec3, part_scale: Vec3| {
                parent.spawn((
                    Mesh3d(handles.cube.clone()),
                    MeshMaterial3d(material.clone()),
                    Transform::from_translation(position).with_scale(part_scale),
                ));
            };

            part(Vec3::new(0.0, 0.08, 0.0), Vec3::new(0.72, 0.16, 0.72));
            part(Vec3::new(-0.16, 0.34, 0.0), Vec3::new(0.17, 0.42, 0.20));
            part(Vec3::new(0.16, 0.34, 0.0), Vec3::new(0.17, 0.42, 0.20));
            part(Vec3::new(0.0, 0.70, 0.0), Vec3::new(0.46, 0.44, 0.32));

            match piece.role {
                Role::Pawn => {
                    part(Vec3::new(0.0, 1.02, 0.0), Vec3::new(0.32, 0.30, 0.32));
                }
                Role::Knight => {
                    part(Vec3::new(0.0, 1.02, -0.02), Vec3::new(0.33, 0.34, 0.30));
                    part(Vec3::new(0.0, 1.05, -0.25), Vec3::new(0.24, 0.18, 0.32));
                    part(Vec3::new(-0.14, 1.28, 0.02), Vec3::new(0.08, 0.22, 0.08));
                    part(Vec3::new(0.14, 1.28, 0.02), Vec3::new(0.08, 0.22, 0.08));
                }
                Role::Bishop => {
                    part(Vec3::new(0.0, 1.05, 0.0), Vec3::new(0.31, 0.38, 0.31));
                    part(Vec3::new(0.0, 1.36, 0.0), Vec3::new(0.10, 0.28, 0.10));
                    part(Vec3::new(0.0, 1.45, 0.0), Vec3::new(0.28, 0.07, 0.10));
                }
                Role::Rook => {
                    part(Vec3::new(0.0, 1.05, 0.0), Vec3::new(0.38, 0.30, 0.34));
                    part(Vec3::new(-0.27, 1.29, 0.0), Vec3::new(0.14, 0.18, 0.40));
                    part(Vec3::new(0.27, 1.29, 0.0), Vec3::new(0.14, 0.18, 0.40));
                    part(Vec3::new(0.0, 1.29, 0.27), Vec3::new(0.40, 0.18, 0.14));
                    part(Vec3::new(0.0, 1.29, -0.27), Vec3::new(0.40, 0.18, 0.14));
                }
                Role::Queen => {
                    part(Vec3::new(0.0, 1.06, 0.0), Vec3::new(0.34, 0.34, 0.34));
                    for x in [-0.24, 0.0, 0.24] {
                        part(Vec3::new(x, 1.38, 0.0), Vec3::new(0.10, 0.24, 0.10));
                    }
                    part(Vec3::new(0.0, 1.55, 0.0), Vec3::new(0.38, 0.08, 0.26));
                }
                Role::King => {
                    part(Vec3::new(0.0, 1.06, 0.0), Vec3::new(0.36, 0.34, 0.34));
                    part(Vec3::new(0.0, 1.42, 0.0), Vec3::new(0.10, 0.34, 0.10));
                    part(Vec3::new(0.0, 1.48, 0.0), Vec3::new(0.36, 0.10, 0.10));
                }
            }
        });
}

fn spawn_highlight(
    commands: &mut Commands,
    handles: &SceneHandles,
    square: Square,
    material: Handle<StandardMaterial>,
    y: f32,
) {
    let mut position = square_world(square);
    position.y = y;
    commands.spawn((
        Mesh3d(handles.cube.clone()),
        MeshMaterial3d(material),
        Transform::from_translation(position).with_scale(Vec3::new(0.88, 0.035, 0.88)),
        HighlightVisual,
    ));
}

fn spawn_projectile(commands: &mut Commands, handles: &SceneHandles, request: CaptureFxRequest) {
    let start = square_world(request.from) + Vec3::Y * 0.78;
    let end = square_world(request.target) + Vec3::Y * 0.56;
    let (size, arc, duration) = projectile_profile(request.role);

    commands.spawn((
        Mesh3d(handles.cube.clone()),
        MeshMaterial3d(handles.fx.clone()),
        Transform::from_translation(start).with_scale(Vec3::splat(size)),
        Projectile {
            start,
            end,
            elapsed: 0.0,
            duration,
            arc,
        },
    ));
}

fn projectile_profile(role: Role) -> (f32, f32, f32) {
    match role {
        Role::Pawn => (0.10, 0.55, 0.34),
        Role::Knight => (0.12, 0.95, 0.42),
        Role::Bishop => (0.09, 1.25, 0.40),
        Role::Rook => (0.16, 0.42, 0.30),
        Role::Queen => (0.18, 1.45, 0.45),
        Role::King => (0.20, 0.75, 0.38),
    }
}

// ============================================================
// Animation and camera
// ============================================================

fn capture_fx_system(
    mut commands: Commands,
    time: Res<Time>,
    handles: Option<Res<SceneHandles>>,
    mut projectiles: Query<(Entity, &mut Projectile, &mut Transform)>,
    mut debris_query: Query<(Entity, &mut Debris, &mut Transform), Without<Projectile>>,
    mut fx_pause: ResMut<FxPause>,
) {
    fx_pause.remaining = (fx_pause.remaining - time.delta_secs()).max(0.0);
    let Some(handles) = handles else {
        return;
    };

    for (entity, mut projectile, mut transform) in &mut projectiles {
        projectile.elapsed += time.delta_secs();
        let t = (projectile.elapsed / projectile.duration).clamp(0.0, 1.0);
        let eased = t * t * (3.0 - 2.0 * t);
        transform.translation = projectile.start.lerp(projectile.end, eased)
            + Vec3::Y * (PI * t).sin() * projectile.arc;
        transform.rotate_y(time.delta_secs() * 10.0);
        transform.rotate_x(time.delta_secs() * 7.0);

        if t >= 1.0 {
            commands.entity(entity).despawn();
            let directions = [
                Vec3::new(1.0, 1.8, 0.0),
                Vec3::new(-1.0, 1.7, 0.2),
                Vec3::new(0.2, 2.0, 1.0),
                Vec3::new(-0.2, 1.9, -1.0),
                Vec3::new(0.8, 1.5, 0.8),
                Vec3::new(-0.8, 1.6, 0.8),
                Vec3::new(0.8, 1.6, -0.8),
                Vec3::new(-0.8, 1.5, -0.8),
                Vec3::new(0.4, 2.2, 0.1),
                Vec3::new(-0.4, 2.1, -0.1),
                Vec3::new(0.1, 1.8, 0.5),
                Vec3::new(-0.1, 1.8, -0.5),
            ];
            for (index, direction) in directions.into_iter().enumerate() {
                let speed = 1.3 + (index % 4) as f32 * 0.18;
                commands.spawn((
                    Mesh3d(handles.cube.clone()),
                    MeshMaterial3d(handles.fx.clone()),
                    Transform::from_translation(projectile.end)
                        .with_scale(Vec3::splat(0.07 + (index % 3) as f32 * 0.018)),
                    Debris {
                        velocity: direction.normalize() * speed,
                        remaining: 0.48 + (index % 3) as f32 * 0.08,
                    },
                ));
            }
        }
    }

    for (entity, mut debris, mut transform) in &mut debris_query {
        debris.remaining -= time.delta_secs();
        debris.velocity.y -= 5.8 * time.delta_secs();
        transform.translation += debris.velocity * time.delta_secs();
        transform.rotate_x(time.delta_secs() * 12.0);
        transform.rotate_z(time.delta_secs() * 9.0);
        if debris.remaining <= 0.0 {
            commands.entity(entity).despawn();
        }
    }
}

fn camera_system(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    ui_capture: Res<UiCapture>,
    mut rig: ResMut<CameraRig>,
    mut cameras: Query<&mut Transform, With<MainCamera>>,
) {
    if !ui_capture.keyboard {
        let orbit_speed = 1.15 * time.delta_secs();
        if keys.pressed(KeyCode::KeyQ) {
            rig.orbit -= orbit_speed;
        }
        if keys.pressed(KeyCode::KeyE) {
            rig.orbit += orbit_speed;
        }
        if keys.just_pressed(KeyCode::KeyF) {
            rig.flipped = !rig.flipped;
        }
        if keys.pressed(KeyCode::KeyZ) {
            rig.distance = (rig.distance - 5.0 * time.delta_secs()).clamp(7.0, 18.0);
        }
        if keys.pressed(KeyCode::KeyX) {
            rig.distance = (rig.distance + 5.0 * time.delta_secs()).clamp(7.0, 18.0);
        }
    }

    let yaw = rig.orbit + if rig.flipped { PI } else { 0.0 };
    let position = Vec3::new(
        yaw.sin() * rig.distance,
        rig.height,
        yaw.cos() * rig.distance,
    );
    for mut transform in &mut cameras {
        *transform = Transform::from_translation(position)
            .looking_at(Vec3::new(0.0, 0.45, 0.0), Vec3::Y);
    }
}

// ============================================================
// Helpers
// ============================================================

fn board_material(color: Color, roughness: f32, metallic: f32) -> StandardMaterial {
    StandardMaterial {
        base_color: color,
        perceptual_roughness: roughness,
        metallic,
        ..default()
    }
}

fn piece_material(
    color: Color,
    roughness: f32,
    metallic: f32,
    glossy: bool,
) -> StandardMaterial {
    StandardMaterial {
        base_color: color,
        perceptual_roughness: if glossy {
            (roughness * 0.42).max(0.08)
        } else {
            (roughness + 0.16).min(0.95)
        },
        metallic,
        reflectance: if glossy { 0.75 } else { 0.25 },
        ..default()
    }
}

const fn hex_rgb(value: u32) -> [f32; 3] {
    [
        ((value >> 16) & 0xff) as f32 / 255.0,
        ((value >> 8) & 0xff) as f32 / 255.0,
        (value & 0xff) as f32 / 255.0,
    ]
}

fn rgb(value: [f32; 3]) -> Color {
    Color::srgb(value[0], value[1], value[2])
}

fn square_world(square: Square) -> Vec3 {
    let (file, rank) = square_indices(square);
    Vec3::new(file as f32 - 3.5, 0.10, 3.5 - rank as f32)
}

fn square_from_world(point: Vec3) -> Option<Square> {
    if point.x < -4.0 || point.x >= 4.0 || point.z <= -4.0 || point.z > 4.0 {
        return None;
    }

    let file = (point.x + 4.0).floor() as i32;
    let rank = (4.0 - point.z).floor() as i32;
    if !(0..=7).contains(&file) || !(0..=7).contains(&rank) {
        return None;
    }

    Some(square_from_indices(file as usize, rank as usize))
}

fn format_clock(seconds: f32) -> String {
    let total = seconds.max(0.0).ceil() as u32;
    format!("{:02}:{:02}", total / 60, total % 60)
}
