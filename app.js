import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

const $ = id => document.getElementById(id);
const sceneHost = $('scene');
const statusEl = $('status');
const turnBadge = $('turnBadge');
const moveList = $('moveList');
const moveCount = $('moveCount');
const modelStatus = $('modelStatus');
const controllerStatus = $('controllerStatus');
const optionsPanel = $('optionsPanel');
const optionsBtn = $('optionsBtn');
const closeOptionsBtn = $('closeOptionsBtn');
const resetBtn = $('resetBtn');
const undoBtn = $('undoBtn');
const flipBtn = $('flipBtn');
const resetAppearanceBtn = $('resetAppearanceBtn');
const boardMaterialSelect = $('boardMaterial');
const pieceMaterialSelect = $('pieceMaterial');
const knightOrientationSelect = $('knightOrientation');
const backgroundColorInput = $('backgroundColor');
const sceneLightColorInput = $('sceneLightColor');
const lightColorInput = $('lightColor');
const darkColorInput = $('darkColor');
const whitePieceColorInput = $('whitePieceColor');
const blackPieceColorInput = $('blackPieceColor');
const useStlInput = $('useStl');
const showLegalMovesInput = $('showLegalMoves');
const capturedVisibilityBtn = $('capturedVisibilityBtn');
const capturedFlipBtn = $('capturedFlipBtn');
const promotionDialog = $('promotionDialog');
const promotionButtons = [...document.querySelectorAll('#promotionChoices button')];
const checkmateOverlay = $('checkmateOverlay');
const checkmateKicker = $('checkmateKicker');
const checkmateTitle = $('checkmateTitle');
const checkmateSummary = $('checkmateSummary');
const checkmateNewGameBtn = $('checkmateNewGameBtn');
const checkmateViewBoardBtn = $('checkmateViewBoardBtn');
const timedModeBtn = $('timedModeBtn');
const battleAnimationsBtn = $('battleAnimationsBtn');
const axisVisibilityBtn = $('axisVisibilityBtn');
const axisGizmo = $('axisGizmo');
const timePanel = $('timePanel');
const timerVisibilityBtn = $('timerVisibilityBtn');
const whiteClockEl = $('whiteClock');
const blackClockEl = $('blackClock');
const whiteClockCard = $('whiteClockCard');
const blackClockCard = $('blackClockCard');
const timeModeBadge = $('timeModeBadge');
const timePresetButtons = [...document.querySelectorAll('[data-time-minutes]')];
const customTimeForm = $('customTimeForm');
const customTimeInput = $('customTimeInput');
const timeValidation = $('timeValidation');
const axisButtons = [...document.querySelectorAll('[data-camera-axis]')];

const game = new Chess();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
sceneHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = null;

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(8.2, 8.1, 8.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 7.6;
controls.maxDistance = 30;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = 1.32;
controls.target.set(0, 0.38, 0);

let cameraUserAdjusted = false;

function clearAxisSelection() {
  axisButtons.forEach(button => {
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
  });
}

controls.addEventListener('start', () => {
  cameraUserAdjusted = true;
  clearAxisSelection();
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x2b2b2b, 0.9));
const keyLight = new THREE.DirectionalLight(0xfff8ee, 2.35);
keyLight.position.set(5, 10, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 6;
keyLight.shadow.camera.bottom = -6;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.22);
rimLight.position.set(-7, 5, -5);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(8.7, 72),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.32 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.58;
floor.receiveShadow = true;
scene.add(floor);

const boardGroup = new THREE.Group();
const pieceGroup = new THREE.Group();
const overlayGroup = new THREE.Group();
const capturedGroup = new THREE.Group();
const captureFxGroup = new THREE.Group();
scene.add(boardGroup, pieceGroup, capturedGroup, captureFxGroup, overlayGroup);

const boardSquares = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const stlLoader = new STLLoader();
const stlCache = new Map();
const fallbackCache = new Map();
const loadedTypes = new Set();

const fileByType = {
  p: 'pawn.stl', n: 'knight.stl', b: 'bishop.stl', r: 'rook.stl', q: 'queen.stl', k: 'king.stl',
};
const heightByType = { p: 1.35, r: 1.55, n: 1.72, b: 1.82, q: 1.96, k: 2.08 };

const boardPresets = {
  walnut: { light: '#d7bd96', dark: '#6d4327', roughness: 0.58, metalness: 0.01, clearcoat: 0.12, base: '#23170f' },
  marble: { light: '#e4e2dd', dark: '#5d6571', roughness: 0.32, metalness: 0.03, clearcoat: 0.55, base: '#1d2228' },
  tournament: { light: '#e8e2cf', dark: '#4f765c', roughness: 0.72, metalness: 0.0, clearcoat: 0.02, base: '#252b28' },
  slate: { light: '#b7bec5', dark: '#3a4249', roughness: 0.88, metalness: 0.02, clearcoat: 0.0, base: '#20252a' },
  obsidian: { light: '#c8cbd0', dark: '#17191d', roughness: 0.2, metalness: 0.16, clearcoat: 0.72, base: '#08090b' },
  neon: { light: '#7ce9e3', dark: '#46316e', roughness: 0.28, metalness: 0.18, clearcoat: 0.45, base: '#151025', emissive: true },
};

const piecePresets = {
  ivory: { white: '#e8e3d8', black: '#242424', roughness: 0.82, metalness: 0.0, clearcoat: 0.0, specularIntensity: 0.12 },
  walnut: { white: '#d3a775', black: '#5a3220', roughness: 0.58, metalness: 0.0, clearcoat: 0.18 },
  brass: { white: '#d3a756', black: '#42484b', roughness: 0.28, metalness: 0.82, clearcoat: 0.3 },
  chrome: { white: '#d9e2ea', black: '#59636c', roughness: 0.16, metalness: 0.96, clearcoat: 0.72 },
  glass: { white: '#d8ecf2', black: '#53606a', roughness: 0.08, metalness: 0.04, clearcoat: 1.0, transmission: 0.5, opacity: 0.82 },
  neon: { white: '#7cf4ff', black: '#ff72db', roughness: 0.2, metalness: 0.18, clearcoat: 0.5, emissive: true },
};

const defaultSettings = {
  boardMaterial: 'walnut',
  pieceMaterial: 'ivory',
  lightColor: boardPresets.walnut.light,
  darkColor: boardPresets.walnut.dark,
  whitePieceColor: piecePresets.ivory.white,
  blackPieceColor: piecePresets.ivory.black,
  knightOrientation: 0,
  backgroundColor: '#8faabd',
  sceneLightColor: '#fff8ee',
  useStl: false,
  showLegalMoves: true,
  showCaptured: true,
  capturedUpright: false,
  battleAnimations: true,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('controllerChessAppearance') || '{}');
    // Migrate the previous built-in background to the new neutral-blue default,
    // while preserving any color the player explicitly chose.
    if (String(saved.backgroundColor || '').toLowerCase() === '#667482') {
      saved.backgroundColor = defaultSettings.backgroundColor;
    }
    return { ...defaultSettings, ...saved };
  } catch {
    return { ...defaultSettings };
  }
}
const settings = loadSettings();

let selectedSquare = null;
let legalTargets = [];
let cursorSquare = 'e2';
let boardFlipped = false;
let lastMove = null;
let pieceRenderToken = 0;
let pendingPromotion = null;
let promotionIndex = 0;
let checkmateOverlayDismissed = false;
let checkmateActionIndex = 0;
let pointerStart = null;
let captureAnimating = false;

const MIN_CUSTOM_MINUTES = 0.25;
const MAX_CUSTOM_MINUTES = 180;
let timedMode = false;
let baseTimeMs = 5 * 60 * 1000;
let clockMs = { w: baseTimeMs, b: baseTimeMs };
let timedOutColor = null;
let lastClockTick = null;

function saveSettings() {
  try { localStorage.setItem('controllerChessAppearance', JSON.stringify(settings)); } catch {}
}

function syncSettingsUI() {
  boardMaterialSelect.value = settings.boardMaterial;
  pieceMaterialSelect.value = settings.pieceMaterial;
  lightColorInput.value = settings.lightColor;
  darkColorInput.value = settings.darkColor;
  whitePieceColorInput.value = settings.whitePieceColor;
  blackPieceColorInput.value = settings.blackPieceColor;
  knightOrientationSelect.value = String(settings.knightOrientation);
  backgroundColorInput.value = settings.backgroundColor;
  sceneLightColorInput.value = settings.sceneLightColor;
  useStlInput.checked = settings.useStl;
  showLegalMovesInput.checked = settings.showLegalMoves;
  battleAnimationsBtn.textContent = settings.battleAnimations ? 'Battle Animations: On' : 'Battle Animations: Off';
  battleAnimationsBtn.setAttribute('aria-pressed', String(settings.battleAnimations));
}


function applySceneLightColor() {
  const color = /^#[0-9a-f]{6}$/i.test(settings.sceneLightColor)
    ? settings.sceneLightColor
    : defaultSettings.sceneLightColor;
  settings.sceneLightColor = color;
  keyLight.color.set(color);
}

function applyBackgroundColor() {
  const color = /^#[0-9a-f]{6}$/i.test(settings.backgroundColor) ? settings.backgroundColor : defaultSettings.backgroundColor;
  settings.backgroundColor = color;
  document.documentElement.style.setProperty('--bg', color);
  document.documentElement.style.setProperty('--scene-bg', color);
  if (scene.fog) scene.fog.color.set(color);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', color);
}

function squareToWorld(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const xIndex = boardFlipped ? 7 - file : file;
  const zIndex = boardFlipped ? rank : 7 - rank;
  return { x: xIndex - 3.5, z: zIndex - 3.5 };
}

function worldIndexToSquare(fileIndex, zIndex) {
  const file = boardFlipped ? 7 - fileIndex : fileIndex;
  const rank = boardFlipped ? zIndex + 1 : 8 - zIndex;
  return `${String.fromCharCode(97 + file)}${rank}`;
}

function disposeMaterial(mat) {
  if (Array.isArray(mat)) mat.forEach(disposeMaterial);
  else if (mat?.dispose) mat.dispose();
}

function clearBoardGroup() {
  boardGroup.traverse(obj => {
    if (obj.isMesh) {
      obj.geometry?.dispose?.();
      disposeMaterial(obj.material);
    }
  });
  boardGroup.clear();
}

function clearPieceGroup() {
  pieceGroup.traverse(obj => { if (obj.isMesh) disposeMaterial(obj.material); });
  pieceGroup.clear();
}

function clearCapturedGroup() {
  capturedGroup.traverse(obj => { if (obj.isMesh) disposeMaterial(obj.material); });
  capturedGroup.clear();
}

function boardMaterial(color, preset, isDark = false) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: preset.roughness + (isDark ? 0.025 : 0),
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: Math.min(1, preset.roughness * 0.7),
  });
  if (preset.emissive) {
    material.emissive = new THREE.Color(color).multiplyScalar(isDark ? 0.12 : 0.07);
    material.emissiveIntensity = 1;
  }
  return material;
}

function createBoard() {
  clearBoardGroup();
  boardSquares.length = 0;
  const preset = boardPresets[settings.boardMaterial] || boardPresets.walnut;

  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(9.45, 0.44, 9.45),
    new THREE.MeshPhysicalMaterial({ color: preset.base, roughness: 0.5, metalness: 0.08, clearcoat: 0.2 })
  );
  pedestal.position.y = -0.38;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  boardGroup.add(pedestal);

  const innerFrame = new THREE.Mesh(
    new THREE.BoxGeometry(8.55, 0.25, 8.55),
    new THREE.MeshPhysicalMaterial({ color: preset.base, roughness: 0.43, metalness: 0.1, clearcoat: 0.28 })
  );
  innerFrame.position.y = -0.12;
  innerFrame.receiveShadow = true;
  boardGroup.add(innerFrame);

  const light = boardMaterial(settings.lightColor, preset, false);
  const dark = boardMaterial(settings.darkColor, preset, true);
  const geometry = new THREE.BoxGeometry(0.995, 0.16, 0.995);

  for (let z = 0; z < 8; z++) {
    for (let x = 0; x < 8; x++) {
      const square = worldIndexToSquare(x, z);
      const mesh = new THREE.Mesh(geometry.clone(), (x + z) % 2 === 0 ? light.clone() : dark.clone());
      mesh.position.set(x - 3.5, 0, z - 3.5);
      mesh.receiveShadow = true;
      mesh.userData.square = square;
      boardGroup.add(mesh);
      boardSquares.push(mesh);
    }
  }
  light.dispose();
  dark.dispose();
  geometry.dispose();
}

function makePieceMaterial(color) {
  const preset = piecePresets[settings.pieceMaterial] || piecePresets.ivory;
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: preset.roughness,
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: Math.min(0.85, Math.max(0.4, preset.roughness)),
    specularIntensity: preset.specularIntensity ?? 0.45,
    transmission: preset.transmission || 0,
    transparent: Boolean(preset.opacity && preset.opacity < 1),
    opacity: preset.opacity || 1,
    thickness: preset.transmission ? 0.6 : 0,
    ior: preset.transmission ? 1.45 : 1.5,
  });
  if (preset.emissive) {
    mat.emissive = new THREE.Color(color).multiplyScalar(0.18);
    mat.emissiveIntensity = 1.2;
  }
  return mat;
}

function createFallbackPrototype(type) {
  const group = new THREE.Group();
  const add = (geometry, y, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry);
    mesh.position.y = y;
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    group.add(mesh);
  };
  add(new THREE.CylinderGeometry(0.36, 0.44, 0.18, 28), 0.09);
  add(new THREE.CylinderGeometry(0.27, 0.34, 0.26, 28), 0.29);
  if (type === 'p') {
    add(new THREE.CylinderGeometry(0.18, 0.26, 0.48, 24), 0.62);
    add(new THREE.SphereGeometry(0.24, 24, 16), 0.96);
  } else if (type === 'r') {
    add(new THREE.CylinderGeometry(0.27, 0.3, 0.72, 12), 0.72);
    add(new THREE.CylinderGeometry(0.38, 0.3, 0.22, 12), 1.18);
  } else if (type === 'n') {
    add(new THREE.CylinderGeometry(0.22, 0.29, 0.58, 20), 0.64, [1,1,1], [0,0,-0.16]);
    add(new THREE.SphereGeometry(0.28, 20, 14), 1.04, [0.82,1.16,0.7]);
    add(new THREE.ConeGeometry(0.15, 0.42, 16), 1.3, [0.7,1,0.7], [0,0,0.18]);
  } else if (type === 'b') {
    add(new THREE.CylinderGeometry(0.16, 0.27, 0.72, 26), 0.76);
    add(new THREE.SphereGeometry(0.25, 22, 16), 1.24, [0.9,1.2,0.9]);
    add(new THREE.ConeGeometry(0.08, 0.28, 18), 1.52);
  } else if (type === 'q') {
    add(new THREE.CylinderGeometry(0.17, 0.28, 0.82, 28), 0.8);
    add(new THREE.SphereGeometry(0.28, 24, 18), 1.28, [1,0.72,1]);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.28, 12));
      c.position.set(Math.cos(a)*0.22, 1.52, Math.sin(a)*0.22);
      group.add(c);
    }
  } else if (type === 'k') {
    add(new THREE.CylinderGeometry(0.18, 0.28, 0.9, 28), 0.82);
    add(new THREE.SphereGeometry(0.2, 22, 16), 1.39);
    add(new THREE.BoxGeometry(0.1, 0.42, 0.1), 1.72);
    add(new THREE.BoxGeometry(0.34, 0.1, 0.1), 1.74);
  }
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

function fallbackPrototype(type) {
  if (!fallbackCache.has(type)) fallbackCache.set(type, createFallbackPrototype(type));
  return fallbackCache.get(type);
}

function cloneWithMaterial(proto, material) {
  const group = proto.clone(true);
  group.traverse(obj => { if (obj.isMesh) obj.material = material.clone(); });
  material.dispose();
  return group;
}

function normalizeStlGeometry(raw, type) {
  const base = raw.clone();
  base.deleteAttribute('normal');
  const geometry = mergeVertices(base, 0.0001);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const heightScale = heightByType[type] / Math.max(size.y, 0.0001);
  const widthScale = 0.78 / Math.max(size.x, size.z, 0.0001);
  const scale = Math.min(heightScale, widthScale);
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

async function getStlGeometry(type) {
  if (stlCache.has(type)) return stlCache.get(type);
  const promise = stlLoader.loadAsync(new URL(`./stl/${fileByType[type]}?v=rounded-20260924-2`, import.meta.url).href)
    .then(raw => {
      const geometry = normalizeStlGeometry(raw, type);
      loadedTypes.add(type);
      modelStatus.textContent = `STL set: ${loadedTypes.size}/6 models loaded`;
      return geometry;
    })
    .catch(error => {
      stlCache.delete(type);
      throw error;
    });
  stlCache.set(type, promise);
  return promise;
}

function pieceContainer(piece, square) {
  const container = new THREE.Group();
  const { x, z } = squareToWorld(square);
  container.position.set(x, 0.13, z);
  const baseYaw = piece.color === 'b' ? Math.PI : 0;
  const knightYaw = piece.type === 'n' ? THREE.MathUtils.degToRad(Number(settings.knightOrientation) || 0) : 0;
  container.rotation.y = baseYaw + knightYaw;
  container.userData.square = square;
  container.userData.piece = piece;
  return container;
}

function addFallbackToContainer(container, piece) {
  const color = piece.color === 'w' ? settings.whitePieceColor : settings.blackPieceColor;
  const model = cloneWithMaterial(fallbackPrototype(piece.type), makePieceMaterial(color));
  model.userData.isFallback = true;
  container.add(model);
}

async function replaceWithStl(container, piece, token) {
  try {
    const geometry = await getStlGeometry(piece.type);
    if (token !== pieceRenderToken || !settings.useStl || !container.parent) return;
    [...container.children].forEach(child => {
      child.traverse(obj => { if (obj.isMesh) disposeMaterial(obj.material); });
      container.remove(child);
    });
    const color = piece.color === 'w' ? settings.whitePieceColor : settings.blackPieceColor;
    const mesh = new THREE.Mesh(geometry, makePieceMaterial(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.square = container.userData.square;
    container.add(mesh);
  } catch {
    modelStatus.textContent = 'STL set: fallback used for a missing model';
  }
}

function capturedPiecesFromHistory() {
  return game.history({ verbose: true })
    .filter(move => Boolean(move.captured))
    .map((move, index) => ({
      type: move.captured,
      color: move.color === 'w' ? 'b' : 'w',
      capturedBy: move.color,
      moveIndex: index,
    }));
}

function capturedSideZ(capturerColor) {
  const whiteSide = boardFlipped ? -1 : 1;
  return (capturerColor === 'w' ? whiteSide : -whiteSide);
}

function createCapturedDisplay(piece, index, totalForSide) {
  const row = Math.floor(index / 8);
  const indexInRow = index % 8;
  const rowStart = row * 8;
  const rowCount = Math.min(8, totalForSide - rowStart);
  const x = (indexInRow - (rowCount - 1) / 2) * 0.78;
  const z = capturedSideZ(piece.capturedBy) * (5.15 + row * 0.82);

  const floater = new THREE.Group();
  floater.position.set(x, 1.62, z);
  floater.userData.baseY = 1.62;
  floater.userData.phase = piece.moveIndex * 0.83 + (piece.capturedBy === 'w' ? 0 : Math.PI);
  const baseYaw = piece.color === 'b' ? Math.PI : 0;
  const knightYaw = piece.type === 'n' ? THREE.MathUtils.degToRad(Number(settings.knightOrientation) || 0) : 0;
  floater.userData.baseYaw = baseYaw + knightYaw;

  const modelHost = new THREE.Group();
  modelHost.scale.setScalar(0.58);
  modelHost.rotation.x = settings.capturedUpright ? 0.13 : Math.PI + 0.13;
  modelHost.rotation.z = settings.capturedUpright ? -0.08 : 0.08;
  floater.add(modelHost);

  addFallbackToContainer(modelHost, piece);
  return { floater, modelHost };
}

function renderCapturedPieces(token) {
  clearCapturedGroup();
  const captures = capturedPiecesFromHistory();
  if (!settings.showCaptured || !captures.length) return;

  for (const capturerColor of ['w', 'b']) {
    const sideCaptures = captures.filter(piece => piece.capturedBy === capturerColor);
    sideCaptures.forEach((piece, index) => {
      const { floater, modelHost } = createCapturedDisplay(piece, index, sideCaptures.length);
      capturedGroup.add(floater);
      if (settings.useStl) replaceWithStl(modelHost, piece, token);
    });
  }
}

function updateCapturedControls() {
  const count = capturedPiecesFromHistory().length;
  const enabled = count > 0;
  capturedVisibilityBtn.disabled = !enabled;
  capturedFlipBtn.disabled = !enabled;
  capturedVisibilityBtn.textContent = settings.showCaptured ? 'Hide captured' : 'Show captured';
  capturedFlipBtn.textContent = settings.capturedUpright ? 'Turn upside down' : 'Turn upright';
  capturedVisibilityBtn.setAttribute('aria-pressed', String(!settings.showCaptured));
  capturedFlipBtn.setAttribute('aria-pressed', String(settings.capturedUpright));
}

function renderPieces() {
  pieceRenderToken += 1;
  const token = pieceRenderToken;
  clearPieceGroup();
  if (!settings.useStl) modelStatus.textContent = 'Piece set: built-in geometry';
  else modelStatus.textContent = loadedTypes.size === 6 ? 'STL set: 6/6 models loaded' : `STL set: ${loadedTypes.size}/6 models loaded`;

  game.board().forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (!piece) return;
      const square = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;
      const container = pieceContainer(piece, square);
      addFallbackToContainer(container, piece);
      pieceGroup.add(container);
      if (settings.useStl) replaceWithStl(container, piece, token);
    });
  });

  renderCapturedPieces(token);
  updateCapturedControls();
}

function clearOverlays() {
  overlayGroup.traverse(obj => {
    if (obj.geometry?.dispose) obj.geometry.dispose();
    if (obj.material) disposeMaterial(obj.material);
  });
  overlayGroup.clear();
}

function addOverlay(square, color, opacity = 0.42, y = 0.095, scale = 0.86) {
  const { x, z } = squareToWorld(square);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(scale, scale),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  overlayGroup.add(mesh);
}

function addTargetMarker(square) {
  const { x, z } = squareToWorld(square);
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.18, 32),
    new THREE.MeshBasicMaterial({ color: 0x76d68a, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(x, 0.106, z);
  overlayGroup.add(marker);
}

function addCursorMarker(square) {
  const { x, z } = squareToWorld(square);
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.96, 0.96),
    new THREE.MeshBasicMaterial({
      color: 0xbfe8ff,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(x, 0.118, z);
  overlayGroup.add(fill);

  const borderMaterial = new THREE.MeshBasicMaterial({
    color: 0xeaf8ff,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    toneMapped: false,
  });
  const longEdge = new THREE.BoxGeometry(1.01, 0.018, 0.055);
  const shortEdge = new THREE.BoxGeometry(0.055, 0.018, 1.01);
  const edgeY = 0.137;
  const offset = 0.477;
  for (const zOffset of [-offset, offset]) {
    const edge = new THREE.Mesh(longEdge.clone(), borderMaterial.clone());
    edge.position.set(x, edgeY, z + zOffset);
    overlayGroup.add(edge);
  }
  for (const xOffset of [-offset, offset]) {
    const edge = new THREE.Mesh(shortEdge.clone(), borderMaterial.clone());
    edge.position.set(x + xOffset, edgeY, z);
    overlayGroup.add(edge);
  }
  longEdge.dispose();
  shortEdge.dispose();
  borderMaterial.dispose();
}

function updateOverlays() {
  clearOverlays();
  if (lastMove) {
    addOverlay(lastMove.from, 0xf2cf5b, 0.22, 0.092);
    addOverlay(lastMove.to, 0xf2cf5b, 0.27, 0.093);
  }
  if (selectedSquare) addOverlay(selectedSquare, 0x67a9ff, 0.48, 0.10, 0.9);
  if (settings.showLegalMoves) legalTargets.forEach(addTargetMarker);
  addCursorMarker(cursorSquare);
}

function setTimerPanelCollapsed(collapsed) {
  const isCollapsed = Boolean(collapsed);
  timePanel.classList.toggle('collapsed', isCollapsed);
  timerVisibilityBtn.textContent = isCollapsed ? 'Show timer' : 'Hide timer';
  timerVisibilityBtn.setAttribute('aria-expanded', String(!isCollapsed));
}

timerVisibilityBtn.addEventListener('click', () => {
  setTimerPanelCollapsed(!timePanel.classList.contains('collapsed'));
});

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function renderClock() {
  timePanel.hidden = !timedMode;
  whiteClockEl.textContent = formatClock(clockMs.w);
  blackClockEl.textContent = formatClock(clockMs.b);

  const activeColor = timedMode && !timedOutColor && !game.isGameOver() ? game.turn() : null;
  whiteClockCard.classList.toggle('active', activeColor === 'w');
  blackClockCard.classList.toggle('active', activeColor === 'b');
  whiteClockCard.classList.toggle('expired', timedOutColor === 'w');
  blackClockCard.classList.toggle('expired', timedOutColor === 'b');

  timeModeBadge.textContent = timedMode ? 'Timed' : 'Untimed';
  timedModeBtn.textContent = timedMode ? 'Timed: On' : 'Timed: Off';
  timedModeBtn.setAttribute('aria-pressed', String(timedMode));

  timePresetButtons.forEach(button => {
    const buttonMs = Number(button.dataset.timeMinutes) * 60 * 1000;
    const selected = Math.abs(buttonMs - baseTimeMs) < 1;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function resetClocks() {
  clockMs = { w: baseTimeMs, b: baseTimeMs };
  timedOutColor = null;
  lastClockTick = performance.now();
  renderClock();
}

function tickChessClock(now = performance.now()) {
  if (lastClockTick == null) lastClockTick = now;

  if (captureAnimating) {
    lastClockTick = now;
    renderClock();
    return;
  }

  if (!timedMode || timedOutColor || game.isGameOver()) {
    lastClockTick = now;
    renderClock();
    return;
  }

  const activeColor = game.turn();
  const elapsed = Math.max(0, now - lastClockTick);
  lastClockTick = now;
  clockMs[activeColor] = Math.max(0, clockMs[activeColor] - elapsed);

  if (clockMs[activeColor] <= 0 && !timedOutColor) {
    clockMs[activeColor] = 0;
    timedOutColor = activeColor;
    selectedSquare = null;
    legalTargets = [];
    if (pendingPromotion) {
      pendingPromotion = null;
      promotionDialog.hidden = true;
    }
    updateOverlays();
    updateStatus();
  }

  renderClock();
}

function setTimedMode(enabled) {
  const next = Boolean(enabled);
  if (timedMode === next) {
    renderClock();
    return;
  }

  if (!next) {
    tickChessClock(performance.now());
    timedMode = false;
    lastClockTick = null;
  } else {
    if (timedOutColor || clockMs.w <= 0 || clockMs.b <= 0) resetClocks();
    timedMode = true;
    lastClockTick = performance.now();
  }

  renderClock();
  updateStatus();
}

function setTimeControl(minutes) {
  const numericMinutes = Number(minutes);
  if (!Number.isFinite(numericMinutes) || numericMinutes < MIN_CUSTOM_MINUTES || numericMinutes > MAX_CUSTOM_MINUTES) return false;

  baseTimeMs = Math.round(numericMinutes * 60 * 1000);
  clockMs = { w: baseTimeMs, b: baseTimeMs };
  timedOutColor = null;
  checkmateOverlayDismissed = false;
  timedMode = true;
  lastClockTick = performance.now();
  hideCheckmateOverlay();
  renderClock();
  updateStatus();

  const label = Number.isInteger(numericMinutes)
    ? `${numericMinutes} minute${numericMinutes === 1 ? '' : 's'}`
    : `${numericMinutes} minutes`;
  timeValidation.textContent = `${label} per player. Timed game is on.`;
  return true;
}

function sanitizeCustomMinutes(value) {
  let cleaned = String(value ?? '').trim().replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot >= 0) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  let [whole = '', fraction = ''] = cleaned.split('.');
  whole = whole.slice(0, 3);
  fraction = fraction.slice(0, 2);
  if (firstDot >= 0) return `${whole || '0'}.${fraction}`;
  return whole;
}

timedModeBtn.addEventListener('click', () => setTimedMode(!timedMode));

battleAnimationsBtn.addEventListener('click', () => {
  settings.battleAnimations = !settings.battleAnimations;
  battleAnimationsBtn.textContent = settings.battleAnimations ? 'Battle Animations: On' : 'Battle Animations: Off';
  battleAnimationsBtn.setAttribute('aria-pressed', String(settings.battleAnimations));
  saveSettings();
});

timePresetButtons.forEach(button => {
  button.addEventListener('click', () => {
    const minutes = Number(button.dataset.timeMinutes);
    setTimeControl(minutes);
  });
});

customTimeInput.addEventListener('input', () => {
  const sanitized = sanitizeCustomMinutes(customTimeInput.value);
  if (customTimeInput.value !== sanitized) customTimeInput.value = sanitized;
  customTimeInput.removeAttribute('aria-invalid');
  timeValidation.textContent = 'Custom time: 0.25–180 minutes per player.';
});

customTimeForm.addEventListener('submit', event => {
  event.preventDefault();
  const sanitized = sanitizeCustomMinutes(customTimeInput.value);
  customTimeInput.value = sanitized;
  const minutes = Number(sanitized);

  if (!Number.isFinite(minutes) || minutes < MIN_CUSTOM_MINUTES || minutes > MAX_CUSTOM_MINUTES) {
    customTimeInput.setAttribute('aria-invalid', 'true');
    timeValidation.textContent = 'Enter a time from 0.25 to 180 minutes.';
    return;
  }

  customTimeInput.removeAttribute('aria-invalid');
  setTimeControl(minutes);
});

function gameStatus() {
  if (timedOutColor) {
    const loser = timedOutColor === 'w' ? 'White' : 'Black';
    const winner = timedOutColor === 'w' ? 'Black' : 'White';
    return `${winner} wins on time — ${loser}'s clock expired.`;
  }
  if (game.isCheckmate()) return `Checkmate — ${game.turn() === 'w' ? 'Black' : 'White'} wins.`;
  if (game.isStalemate()) return 'Draw by stalemate.';
  if (game.isThreefoldRepetition()) return 'Draw by threefold repetition.';
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material.';
  if (game.isDraw()) return 'Draw.';
  const side = game.turn() === 'w' ? 'White' : 'Black';
  return `${side} to move${game.inCheck() ? ' — check' : ''}.`;
}

function renderHistory() {
  const history = game.history();
  moveCount.textContent = String(history.length);
  if (!history.length) {
    moveList.innerHTML = '<p class="empty-state">No moves yet.</p>';
    return;
  }
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push(`<span class="move-no">${Math.floor(i / 2) + 1}.</span><span class="move">${history[i] || ''}</span><span class="move">${history[i + 1] || ''}</span>`);
  }
  moveList.innerHTML = rows.join('');
  moveList.scrollTop = moveList.scrollHeight;
}

function hideCheckmateOverlay() {
  checkmateOverlay.hidden = true;
}

function viewFinalBoard() {
  if (!game.isCheckmate() && !timedOutColor) return;
  checkmateOverlayDismissed = true;
  hideCheckmateOverlay();
  sceneHost.focus({ preventScroll: true });
}

function syncCheckmateOverlay() {
  const isTimeout = Boolean(timedOutColor);
  if (!game.isCheckmate() && !isTimeout) {
    checkmateOverlayDismissed = false;
    hideCheckmateOverlay();
    return;
  }

  if (checkmateOverlayDismissed) {
    hideCheckmateOverlay();
    return;
  }

  if (isTimeout) {
    const loser = timedOutColor === 'w' ? 'White' : 'Black';
    const winner = timedOutColor === 'w' ? 'Black' : 'White';
    checkmateKicker.textContent = 'Time';
    checkmateTitle.textContent = `${winner} wins on time`;
    checkmateSummary.textContent = `${loser}'s clock reached 0:00.`;
  } else {
    const winner = game.turn() === 'w' ? 'Black' : 'White';
    checkmateKicker.textContent = 'Checkmate';
    checkmateTitle.textContent = `${winner} wins`;
    checkmateSummary.textContent = `${winner} delivered checkmate on move ${Math.ceil(game.history().length / 2)}.`;
  }
  checkmateOverlay.hidden = false;
  checkmateActionIndex = 0;

  // Defer focus so the key/button press that delivered mate cannot also
  // activate New Game in the same input dispatch.
  requestAnimationFrame(() => {
    if (!checkmateOverlay.hidden) checkmateNewGameBtn.focus({ preventScroll: true });
  });
}

function updateStatus() {
  const text = gameStatus();
  statusEl.textContent = text;
  const side = game.turn() === 'w' ? 'White' : 'Black';
  turnBadge.textContent = (game.isGameOver() || timedOutColor) ? 'Game over' : `${side} to move`;
  undoBtn.disabled = game.history().length === 0 || Boolean(timedOutColor);
  updateCapturedControls();
  renderHistory();
  renderClock();
  syncCheckmateOverlay();
}

function refreshLastMoveFromHistory() {
  const hist = game.history({ verbose: true });
  const move = hist.at(-1);
  lastMove = move ? { from: move.from, to: move.to } : null;
}

function cancelSelection() {
  selectedSquare = null;
  legalTargets = [];
  updateOverlays();
}

function showPromotion(from, to) {
  pendingPromotion = { from, to };
  promotionIndex = 0;
  promotionDialog.hidden = false;
  updatePromotionFocus();
  promotionButtons[0].focus({ preventScroll: true });
}

function hidePromotion() {
  pendingPromotion = null;
  promotionDialog.hidden = true;
  promotionButtons.forEach(btn => btn.classList.remove('controller-focus'));
  sceneHost.focus({ preventScroll: true });
}

function updatePromotionFocus() {
  promotionButtons.forEach((btn, i) => btn.classList.toggle('controller-focus', i === promotionIndex));
}


const battleWeaponProfiles = {
  p: { color: 0xffa24a, duration: 390, arc: 0.65, size: 0.10, blast: 0.90, recoil: 0.10 },
  n: { color: 0x62d7ff, duration: 610, arc: 2.40, size: 0.12, blast: 1.05, recoil: 0.14 },
  b: { color: 0xc68cff, duration: 300, arc: 0.28, size: 0.11, blast: 0.95, recoil: 0.08 },
  r: { color: 0xff6161, duration: 500, arc: 0.95, size: 0.16, blast: 1.25, recoil: 0.18 },
  q: { color: 0xff72d6, duration: 540, arc: 1.55, size: 0.13, blast: 1.40, recoil: 0.14 },
  k: { color: 0xffd166, duration: 630, arc: 1.95, size: 0.17, blast: 1.50, recoil: 0.17 },
};

function battleFindPiece(square) {
  return pieceGroup.children.find(child => child.userData.square === square) || null;
}

function battleVictimSquare(move) {
  if (String(move.flags || '').includes('e')) return `${move.to[0]}${move.from[1]}`;
  return move.to;
}

function battleDispose(root) {
  root.traverse(obj => {
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach(mat => mat?.dispose?.());
    else obj.material?.dispose?.();
  });
}

function battleRemove(root) {
  if (!root) return;
  battleDispose(root);
  root.parent?.remove(root);
}

function battleProjectile(profile) {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: profile.color,
    emissive: profile.color,
    emissiveIntensity: 2.1,
    roughness: 0.22,
    metalness: 0.42,
  });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(profile.size * 0.55, profile.size * 0.72, profile.size * 3.3, 10),
    bodyMat
  );
  body.rotation.x = Math.PI / 2;
  root.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(profile.size * 0.72, profile.size * 1.5, 10),
    bodyMat.clone()
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = profile.size * 2.35;
  root.add(nose);

  const glow = new THREE.PointLight(profile.color, 3.3, 3.5, 2);
  glow.position.z = -profile.size * 1.8;
  root.add(glow);

  return root;
}

function battleCurvePoint(start, end, arc, t, lateral = 0) {
  const mid = start.clone().lerp(end, 0.5);
  mid.y += arc;
  if (lateral) {
    const side = new THREE.Vector3().subVectors(end, start);
    side.cross(new THREE.Vector3(0, 1, 0)).normalize();
    mid.addScaledVector(side, lateral);
  }
  return new THREE.QuadraticBezierCurve3(start, mid, end).getPoint(t);
}

function battleExplosion(position, profile, victimPiece) {
  const root = new THREE.Group();
  root.position.copy(position);
  captureFxGroup.add(root);

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 18, 12),
    new THREE.MeshBasicMaterial({
      color: profile.color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      toneMapped: false,
    })
  );
  root.add(flash);

  const light = new THREE.PointLight(profile.color, 15, 7, 2);
  root.add(light);

  const debris = [];
  const debrisColor = victimPiece?.color === 'w' ? settings.whitePieceColor : settings.blackPieceColor;
  for (let i = 0; i < 26; i++) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.055 + Math.random() * 0.08,
        0.05 + Math.random() * 0.11,
        0.055 + Math.random() * 0.08
      ),
      new THREE.MeshStandardMaterial({
        color: debrisColor,
        roughness: 0.5,
        metalness: 0.16,
      })
    );
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      0.35 + Math.random() * 1.25,
      Math.random() * 2 - 1
    ).normalize();
    shard.userData.velocity = direction.multiplyScalar(1.7 + Math.random() * 2.8 * profile.blast);
    shard.userData.spin = new THREE.Vector3(
      Math.random() * 7 - 3.5,
      Math.random() * 7 - 3.5,
      Math.random() * 7 - 3.5
    );
    root.add(shard);
    debris.push(shard);
  }

  return { root, flash, light, debris };
}

async function battleAnimateExplosion(position, profile, victimPiece) {
  const fx = battleExplosion(position, profile, victimPiece);
  const started = performance.now();
  const duration = 560;

  await new Promise(resolve => {
    const frame = now => {
      const t = Math.min(1, (now - started) / duration);
      const dt = 0.016;

      fx.flash.scale.setScalar(1 + Math.sin(Math.min(1, t * 1.7) * Math.PI / 2) * 7.2 * profile.blast);
      fx.flash.material.opacity = 0.95 * (1 - t);
      fx.light.intensity = 15 * (1 - t) * (1 - t);

      fx.debris.forEach(shard => {
        const velocity = shard.userData.velocity;
        velocity.y -= 5.4 * dt;
        shard.position.addScaledVector(velocity, dt);
        shard.rotation.x += shard.userData.spin.x * dt;
        shard.rotation.y += shard.userData.spin.y * dt;
        shard.rotation.z += shard.userData.spin.z * dt;
        shard.scale.setScalar(Math.max(0.15, 1 - t * 0.7));
      });

      if (t < 1) requestAnimationFrame(frame);
      else {
        battleRemove(fx.root);
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

async function battleLaunchProjectile(start, end, profile, lateral = 0) {
  const projectile = battleProjectile(profile);
  captureFxGroup.add(projectile);
  const started = performance.now();

  await new Promise(resolve => {
    const frame = now => {
      const t = Math.min(1, (now - started) / profile.duration);
      const eased = 1 - Math.pow(1 - t, 2);
      const p = battleCurvePoint(start, end, profile.arc, eased, lateral);
      const next = battleCurvePoint(start, end, profile.arc, Math.min(1, eased + 0.015), lateral);
      projectile.position.copy(p);
      projectile.lookAt(next);

      if (t < 1) requestAnimationFrame(frame);
      else {
        battleRemove(projectile);
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

async function playBattleCapture(move, attackerPiece) {
  const profile = battleWeaponProfiles[attackerPiece?.type] || battleWeaponProfiles.p;
  const attackerMesh = battleFindPiece(move.from);
  const victimSquare = battleVictimSquare(move);
  const victimMesh = battleFindPiece(victimSquare);
  const victimPiece = victimMesh?.userData?.piece || {
    type: move.captured,
    color: move.color === 'w' ? 'b' : 'w',
  };

  const fromWorld = squareToWorld(move.from);
  const victimWorld = squareToWorld(victimSquare);
  const start = new THREE.Vector3(fromWorld.x, 1.15, fromWorld.z);
  const end = new THREE.Vector3(victimWorld.x, 0.92, victimWorld.z);

  if (attackerMesh) {
    const dx = victimWorld.x - fromWorld.x;
    const dz = victimWorld.z - fromWorld.z;
    attackerMesh.rotation.y = Math.atan2(dx, dz);
    attackerMesh.position.x -= Math.sign(dx || 1) * profile.recoil;
    attackerMesh.position.z -= Math.sign(dz || 1) * profile.recoil;
  }

  if (attackerPiece?.type === 'q') {
    await Promise.all([
      battleLaunchProjectile(start.clone().add(new THREE.Vector3(-0.08, 0.08, 0)), end, profile, -0.42),
      battleLaunchProjectile(start.clone().add(new THREE.Vector3(0.08, 0.16, 0)), end, profile, 0),
      battleLaunchProjectile(start.clone().add(new THREE.Vector3(0.0, 0.24, 0.08)), end, profile, 0.42),
    ]);
  } else {
    await battleLaunchProjectile(start, end, profile, 0);
  }

  if (victimMesh) victimMesh.visible = false;
  await battleAnimateExplosion(end, profile, victimPiece);
}


async function completeMove(from, to, promotion) {
  if (captureAnimating) return false;

  if (timedMode) {
    tickChessClock(performance.now());
    if (timedOutColor) return false;
  }

  const attackerPiece = game.get(from);
  let move = null;
  try { move = game.move({ from, to, promotion }); } catch {}
  if (!move) return false;

  lastMove = { from: move.from, to: move.to };
  selectedSquare = null;
  legalTargets = [];
  cursorSquare = move.to;
  updateOverlays();

  if (move.captured && settings.battleAnimations && !reducedMotion) {
    captureAnimating = true;
    undoBtn.disabled = true;
    resetBtn.disabled = true;
    flipBtn.disabled = true;
    sceneHost.setAttribute('aria-busy', 'true');

    try {
      await playBattleCapture(move, attackerPiece);
    } finally {
      captureAnimating = false;
      resetBtn.disabled = false;
      flipBtn.disabled = false;
      sceneHost.removeAttribute('aria-busy');
    }
  }

  lastClockTick = performance.now();
  renderPieces();
  updateStatus();
  updateOverlays();
  return true;
}

function choosePromotion(pieceType) {
  if (!pendingPromotion) return;
  const { from, to } = pendingPromotion;
  hidePromotion();
  completeMove(from, to, pieceType);
}

promotionButtons.forEach((button, index) => {
  button.addEventListener('focus', () => { promotionIndex = index; updatePromotionFocus(); });
  button.addEventListener('click', () => choosePromotion(button.dataset.piece));
});

promotionDialog.addEventListener('keydown', event => {
  if (promotionDialog.hidden) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    promotionIndex = (promotionIndex + (event.key === 'ArrowRight' ? 1 : -1) + promotionButtons.length) % promotionButtons.length;
    updatePromotionFocus();
    promotionButtons[promotionIndex].focus({ preventScroll: true });
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hidePromotion();
  }
});

function selectSquare(square) {
  if (captureAnimating || pendingPromotion || game.isGameOver() || timedOutColor) return;
  cursorSquare = square;
  const piece = game.get(square);

  if (!selectedSquare) {
    if (piece && piece.color === game.turn()) {
      selectedSquare = square;
      legalTargets = game.moves({ square, verbose: true }).map(move => move.to);
    }
    updateOverlays();
    return;
  }

  if (square === selectedSquare) {
    cancelSelection();
    return;
  }

  if (piece && piece.color === game.turn()) {
    selectedSquare = square;
    legalTargets = game.moves({ square, verbose: true }).map(move => move.to);
    updateOverlays();
    return;
  }

  const candidates = game.moves({ square: selectedSquare, verbose: true }).filter(move => move.to === square);
  if (candidates.length) {
    if (candidates.some(move => move.promotion)) showPromotion(selectedSquare, square);
    else completeMove(selectedSquare, square);
    return;
  }

  updateOverlays();
}

function findSquareFromPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(boardSquares, false)[0];
  return hit?.object?.userData?.square || null;
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
renderer.domElement.addEventListener('pointerup', event => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (distance > 6) return;
  const square = findSquareFromPointer(event);
  if (square) {
    sceneHost.focus({ preventScroll: true });
    selectSquare(square);
  }
});
renderer.domElement.addEventListener('pointercancel', () => { pointerStart = null; });

function squareScreenPosition(square) {
  const { x, z } = squareToWorld(square);
  return new THREE.Vector3(x, 0.16, z).project(camera);
}

// Move one board cell in the direction the player sees on screen. We project
// the four neighboring cells through the current camera, then choose the one
// whose screen-space direction best matches the requested arrow/D-pad input.
// This stays intuitive after mouse orbiting, right-stick orbiting, or flipping.
function moveCursor(screenX, screenY) {
  const file = cursorSquare.charCodeAt(0) - 97;
  const rank = Number(cursorSquare[1]) - 1;
  const currentScreen = squareScreenPosition(cursorSquare);
  const desired = new THREE.Vector2(screenX, screenY).normalize();
  const candidates = [
    [file + 1, rank], [file - 1, rank], [file, rank + 1], [file, rank - 1],
  ];

  let bestSquare = cursorSquare;
  let bestScore = -Infinity;
  for (const [nextFile, nextRank] of candidates) {
    if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) continue;
    const square = `${String.fromCharCode(97 + nextFile)}${nextRank + 1}`;
    const projected = squareScreenPosition(square);
    const screenDirection = new THREE.Vector2(
      projected.x - currentScreen.x,
      projected.y - currentScreen.y,
    );
    if (screenDirection.lengthSq() < 1e-8) continue;
    screenDirection.normalize();
    const score = screenDirection.dot(desired);
    if (score > bestScore) {
      bestScore = score;
      bestSquare = square;
    }
  }

  cursorSquare = bestSquare;
  updateOverlays();
}

function setAxisGizmoVisible(visible) {
  const show = Boolean(visible);
  axisGizmo.hidden = !show;
  axisVisibilityBtn.textContent = show ? 'Hide axis' : 'Show axis';
  axisVisibilityBtn.setAttribute('aria-expanded', String(show));
  if (!show) clearAxisSelection();
}

axisVisibilityBtn.addEventListener('click', () => {
  setAxisGizmoVisible(axisGizmo.hidden);
});

function orientCameraToAxis(axis) {
  cameraUserAdjusted = true;

  const target = new THREE.Vector3(0, 0.38, 0);
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);

  let theta = spherical.theta;
  let phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);

  if (axis === '+z') theta = 0;
  else if (axis === '+x') theta = Math.PI / 2;
  else if (axis === '-z') theta = Math.PI;
  else if (axis === '-x') theta = -Math.PI / 2;
  else if (axis === 'y') {
    theta = 0;
    phi = controls.minPolarAngle;
  } else {
    return;
  }

  const snappedOffset = new THREE.Vector3().setFromSpherical(
    new THREE.Spherical(radius, phi, theta)
  );

  controls.target.copy(target);
  camera.position.copy(target).add(snappedOffset);
  camera.lookAt(target);
  controls.update();

  clearAxisSelection();
  const activeButton = axisButtons.find(button => button.dataset.cameraAxis === axis);
  if (activeButton) {
    activeButton.classList.add('active');
    activeButton.setAttribute('aria-pressed', 'true');
  }

  sceneHost.focus({ preventScroll: true });
}

axisButtons.forEach(button => {
  button.addEventListener('click', () => orientCameraToAxis(button.dataset.cameraAxis));
});

function orbitCamera(deltaTheta, deltaPhi = 0, zoomDelta = 0) {
  cameraUserAdjusted = true;
  clearAxisSelection();
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta += deltaTheta;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaPhi, controls.minPolarAngle, controls.maxPolarAngle);
  spherical.radius = THREE.MathUtils.clamp(spherical.radius + zoomDelta, controls.minDistance, controls.maxDistance);
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
  camera.lookAt(controls.target);
}

sceneHost.addEventListener('keydown', event => {
  if (!checkmateOverlay.hidden) return;

  if (pendingPromotion) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      promotionIndex = (promotionIndex + (event.key === 'ArrowRight' ? 1 : -1) + promotionButtons.length) % promotionButtons.length;
      updatePromotionFocus();
      promotionButtons[promotionIndex].focus({ preventScroll: true });
    } else if (event.key === 'Escape') {
      event.preventDefault(); hidePromotion();
    }
    return;
  }

  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','W','a','A','s','S','d','D','Enter',' ','Escape','q','Q','e','E','+','=','-','_'].includes(event.key)) event.preventDefault();
  if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') moveCursor(0, 1);
  else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') moveCursor(0, -1);
  else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') moveCursor(-1, 0);
  else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') moveCursor(1, 0);
  else if (event.key === 'Enter' || event.key === ' ') selectSquare(cursorSquare);
  else if (event.key === 'Escape') cancelSelection();
  else if (event.key.toLowerCase() === 'q') orbitCamera(-0.11);
  else if (event.key.toLowerCase() === 'e') orbitCamera(0.11);
  else if (event.key === '+' || event.key === '=') orbitCamera(0, 0, -0.6);
  else if (event.key === '-' || event.key === '_') orbitCamera(0, 0, 0.6);
});

function setOptionsVisible(show) {
  optionsPanel.hidden = !show;
  optionsBtn.setAttribute('aria-expanded', String(show));
  if (show && window.innerWidth < 901) optionsPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
optionsBtn.addEventListener('click', () => setOptionsVisible(optionsPanel.hidden));
closeOptionsBtn.addEventListener('click', () => setOptionsVisible(false));

function resetGame() {
  checkmateOverlayDismissed = false;
  hideCheckmateOverlay();
  game.reset();
  resetClocks();
  selectedSquare = null;
  legalTargets = [];
  lastMove = null;
  cursorSquare = boardFlipped ? 'd7' : 'e2';
  hidePromotion();
  renderPieces();
  updateStatus();
  updateOverlays();
}
resetBtn.addEventListener('click', resetGame);
checkmateNewGameBtn.addEventListener('click', resetGame);
checkmateViewBoardBtn.addEventListener('click', viewFinalBoard);
checkmateNewGameBtn.addEventListener('focus', () => { checkmateActionIndex = 0; });
checkmateViewBoardBtn.addEventListener('focus', () => { checkmateActionIndex = 1; });
checkmateOverlay.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    viewFinalBoard();
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    checkmateActionIndex = event.key === 'ArrowRight' ? 1 : 0;
    (checkmateActionIndex === 0 ? checkmateNewGameBtn : checkmateViewBoardBtn).focus({ preventScroll: true });
  }
});

function undoMove() {
  if (timedOutColor) return;
  if (pendingPromotion) { hidePromotion(); return; }
  const undone = game.undo();
  if (!undone) return;
  selectedSquare = null;
  legalTargets = [];
  refreshLastMoveFromHistory();
  lastClockTick = performance.now();
  renderPieces();
  updateStatus();
  updateOverlays();
}
undoBtn.addEventListener('click', undoMove);

function flipBoard() {
  boardFlipped = !boardFlipped;
  createBoard();
  renderPieces();
  updateOverlays();
}
flipBtn.addEventListener('click', flipBoard);

function applyBoardPreset(name) {
  const preset = boardPresets[name] || boardPresets.walnut;
  settings.boardMaterial = name;
  settings.lightColor = preset.light;
  settings.darkColor = preset.dark;
  lightColorInput.value = preset.light;
  darkColorInput.value = preset.dark;
  saveSettings();
  createBoard();
  updateOverlays();
}

function applyPiecePreset(name) {
  const preset = piecePresets[name] || piecePresets.ivory;
  settings.pieceMaterial = name;
  settings.whitePieceColor = preset.white;
  settings.blackPieceColor = preset.black;
  whitePieceColorInput.value = preset.white;
  blackPieceColorInput.value = preset.black;
  saveSettings();
  renderPieces();
}

boardMaterialSelect.addEventListener('change', () => applyBoardPreset(boardMaterialSelect.value));
pieceMaterialSelect.addEventListener('change', () => applyPiecePreset(pieceMaterialSelect.value));
knightOrientationSelect.addEventListener('change', () => {
  const angle = Number(knightOrientationSelect.value);
  settings.knightOrientation = [0, 90, 180, 270].includes(angle) ? angle : 0;
  knightOrientationSelect.value = String(settings.knightOrientation);
  saveSettings();
  renderPieces();
});
backgroundColorInput.addEventListener('input', () => {
  settings.backgroundColor = backgroundColorInput.value;
  applyBackgroundColor();
  saveSettings();
});
sceneLightColorInput.addEventListener('input', () => {
  settings.sceneLightColor = sceneLightColorInput.value;
  applySceneLightColor();
  saveSettings();
});
lightColorInput.addEventListener('input', () => { settings.lightColor = lightColorInput.value; saveSettings(); createBoard(); updateOverlays(); });
darkColorInput.addEventListener('input', () => { settings.darkColor = darkColorInput.value; saveSettings(); createBoard(); updateOverlays(); });
whitePieceColorInput.addEventListener('input', () => { settings.whitePieceColor = whitePieceColorInput.value; saveSettings(); renderPieces(); });
blackPieceColorInput.addEventListener('input', () => { settings.blackPieceColor = blackPieceColorInput.value; saveSettings(); renderPieces(); });
useStlInput.addEventListener('change', () => { settings.useStl = useStlInput.checked; saveSettings(); renderPieces(); });
showLegalMovesInput.addEventListener('change', () => { settings.showLegalMoves = showLegalMovesInput.checked; saveSettings(); updateOverlays(); });
capturedVisibilityBtn.addEventListener('click', () => {
  if (!capturedPiecesFromHistory().length) return;
  settings.showCaptured = !settings.showCaptured;
  saveSettings();
  renderPieces();
});
capturedFlipBtn.addEventListener('click', () => {
  if (!capturedPiecesFromHistory().length) return;
  settings.capturedUpright = !settings.capturedUpright;
  saveSettings();
  renderPieces();
});
resetAppearanceBtn.addEventListener('click', () => {
  Object.assign(settings, defaultSettings);
  syncSettingsUI();
  applyBackgroundColor();
  applySceneLightColor();
  saveSettings();
  createBoard();
  renderPieces();
  updateOverlays();
});

let gamepadPrev = {};
let gamepadRepeatAt = 0;
let activeGamepadIndex = null;
window.addEventListener('gamepadconnected', event => {
  activeGamepadIndex = event.gamepad.index;
  controllerStatus.textContent = `USB game controller connected: ${event.gamepad.id.replace(/\s*\(.*?\)\s*/g, ' ').trim()}`;
  sceneHost.focus({ preventScroll: true });
});
window.addEventListener('gamepaddisconnected', event => {
  if (activeGamepadIndex === event.gamepad.index) activeGamepadIndex = null;
  controllerStatus.textContent = 'USB game controller: not connected';
  gamepadPrev = {};
});

function pressed(pad, index) { return Boolean(pad.buttons[index]?.pressed); }
function pollGamepad(now) {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let pad = activeGamepadIndex != null ? pads[activeGamepadIndex] : null;
  if (!pad) pad = Array.from(pads).find(Boolean);
  if (!pad) return;
  if (activeGamepadIndex == null) {
    activeGamepadIndex = pad.index;
    controllerStatus.textContent = 'USB game controller: connected';
  }

  const deadzone = 0.56;
  const current = {
    left: pressed(pad,14) || (pad.axes[0] ?? 0) < -deadzone,
    right: pressed(pad,15) || (pad.axes[0] ?? 0) > deadzone,
    up: pressed(pad,12) || (pad.axes[1] ?? 0) < -deadzone,
    down: pressed(pad,13) || (pad.axes[1] ?? 0) > deadzone,
    a: pressed(pad,0), b: pressed(pad,1), x: pressed(pad,2), y: pressed(pad,3),
    lb: pressed(pad,4), rb: pressed(pad,5),
  };

  if (!checkmateOverlay.hidden) {
    const choosePrevious = current.left && !gamepadPrev.left;
    const chooseNext = current.right && !gamepadPrev.right;
    if (choosePrevious || chooseNext) {
      checkmateActionIndex = chooseNext ? 1 : 0;
      (checkmateActionIndex === 0 ? checkmateNewGameBtn : checkmateViewBoardBtn).focus({ preventScroll: true });
    }
    if (current.a && !gamepadPrev.a) {
      if (checkmateActionIndex === 0) resetGame();
      else viewFinalBoard();
    }
    if (current.b && !gamepadPrev.b) viewFinalBoard();
    gamepadPrev = current;
    return;
  }

  if (pendingPromotion) {
    if ((current.left && !gamepadPrev.left) || (current.right && !gamepadPrev.right)) {
      promotionIndex = (promotionIndex + (current.right ? 1 : -1) + promotionButtons.length) % promotionButtons.length;
      updatePromotionFocus();
      promotionButtons[promotionIndex].focus({ preventScroll: true });
    }
    if (current.a && !gamepadPrev.a) choosePromotion(promotionButtons[promotionIndex].dataset.piece);
    if (current.b && !gamepadPrev.b) hidePromotion();
    gamepadPrev = current;
    return;
  }

  const navPressed = current.left || current.right || current.up || current.down;
  const navNew = ['left','right','up','down'].some(k => current[k] && !gamepadPrev[k]);
  if (navNew || (navPressed && now >= gamepadRepeatAt)) {
    if (current.left) moveCursor(-1, 0);
    else if (current.right) moveCursor(1, 0);
    else if (current.up) moveCursor(0, 1);
    else if (current.down) moveCursor(0, -1);
    gamepadRepeatAt = now + (navNew ? 320 : 120);
  }

  if (current.a && !gamepadPrev.a) { sceneHost.focus({ preventScroll: true }); selectSquare(cursorSquare); }
  if (current.b && !gamepadPrev.b) cancelSelection();
  if (current.x && !gamepadPrev.x) undoMove();
  if (current.y && !gamepadPrev.y) flipBoard();

  const rx = Math.abs(pad.axes[2] ?? 0) > 0.18 ? pad.axes[2] : 0;
  const ry = Math.abs(pad.axes[3] ?? 0) > 0.18 ? pad.axes[3] : 0;
  if (rx || ry) orbitCamera(rx * 0.025, ry * 0.018);
  if (current.lb) orbitCamera(0, 0, 0.055);
  if (current.rb) orbitCamera(0, 0, -0.055);

  gamepadPrev = current;
}

function fitInitialCamera(width, height) {
  if (!width || !height) return;
  const aspect = width / height;

  // A desktop display should feel close immediately. Narrow portrait screens
  // need extra distance so the full 9.45-unit board remains visible.
  const portraitScale = aspect < 0.92
    ? THREE.MathUtils.clamp(0.92 / aspect, 1, 1.72)
    : 1;
  const radius = 13.75 * portraitScale;
  const theta = Math.PI / 4;
  const phi = 0.93;
  const offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, phi, theta));

  controls.target.set(0, 0.38, 0);
  camera.position.copy(controls.target).add(offset);
  camera.lookAt(controls.target);
  controls.update();
}

let lastAutoFitAspect = 0;
function resize() {
  const width = sceneHost.clientWidth;
  const height = sceneHost.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const aspect = width / height;
  if (!cameraUserAdjusted && Math.abs(aspect - lastAutoFitAspect) > 0.015) {
    fitInitialCamera(width, height);
    lastAutoFitAspect = aspect;
  }
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(sceneHost);

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
function animateCapturedPieces(now) {
  if (reducedMotion || !settings.showCaptured) return;
  const t = now * 0.001;
  capturedGroup.children.forEach(item => {
    const phase = item.userData.phase || 0;
    item.position.y = (item.userData.baseY || 1.62) + Math.sin(t * 1.05 + phase) * 0.075;
    item.rotation.y = (item.userData.baseYaw || 0) + Math.sin(t * 0.42 + phase) * 0.2;
  });
}

function animate(now = 0) {
  controls.update();
  tickChessClock(now);
  pollGamepad(now);
  animateCapturedPieces(now);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

setAxisGizmoVisible(false);
syncSettingsUI();
applyBackgroundColor();
applySceneLightColor();
createBoard();
renderPieces();
updateStatus();
updateOverlays();
resize();
animate();