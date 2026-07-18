import { Input, Action } from '../core/Input.js';
import { BODY_HALF_H, DT, TILE_SIZE, VIEW_WIDTH, VIEW_HEIGHT } from '../core/constants.js';
import { Player } from '../engine/Player.js';
import { Camera } from '../engine/Camera.js';
import { makeWorld, SPAWN } from '../engine/level.js';
import { Tile } from '../engine/World.js';
import { AnimData, Region, AnimationLayer } from '../engine/Animation.js';
import { Trail, GhostSource, TrailStyle, DASH_TRAIL, WALLSLIDE_TRAIL } from './Trail.js';
import animData from './assets/x_anims.json';
import atlasUrl from './assets/x.png';
import armAtlasUrl from './assets/x_leftarm.png';

/**
 * Browser front-end: renders the ported gameplay with the Canvas 2D API. The
 * context is scaled by SCALE and left in the engine's coordinate system — world
 * pixels with y pointing down and the origin at the top-left — so the engine's 2D
 * coordinates map straight to canvas space, offset by the camera's scroll. The
 * player is drawn with the X spritesheet (x.png / x.json) animated per movement
 * state. The engine itself is pure and shared with the headless sim — this file is
 * only I/O + drawing.
 */

const SCALE = 3;
const input = new Input();
const world = makeWorld();
const player = new Player(world, SPAWN.x, SPAWN.y, input);
const camera = new Camera(world.widthPx, world.heightPx);
camera.snapTo(player.pos.x, player.pos.y);

const canvas = document.getElementById('game') as HTMLCanvasElement;

// --- canvas 2d context ---
// The backing store is a fixed VIEW_WIDTH x VIEW_HEIGHT * SCALE * devicePixelRatio
// grid so the picture is always crisp; all drawing is done in world-pixel units via
// a single base transform plus the camera translation. Sizing to the *view* rather
// than the level is what makes a level larger than the screen possible at all. The
// CSS *display* size is computed separately to fill the window while preserving the
// view's aspect ratio (see fitCanvas), so the picture is never stretched — capping
// width and height independently (max-width/height) would.
const ctx = canvas.getContext('2d')!;
const dpr = window.devicePixelRatio || 1;
canvas.width = VIEW_WIDTH * SCALE * dpr;
canvas.height = VIEW_HEIGHT * SCALE * dpr;
ctx.imageSmoothingEnabled = false; // pixel-art: nearest-neighbour sampling

/** Fit the canvas into the viewport, preserving the view's aspect ratio. */
function fitCanvas(): void {
  const aspect = VIEW_WIDTH / VIEW_HEIGHT;
  let w = window.innerWidth;
  let h = w / aspect;
  if (h > window.innerHeight) {
    h = window.innerHeight;
    w = h * aspect;
  }
  canvas.style.width = `${Math.floor(w)}px`;
  canvas.style.height = `${Math.floor(h)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// --- player sprite atlas ---
// Frame geometry: every frame is 64x56 and the character's feet sit at local y=48.
const FRAME_W = 64;
const FRAME_H = 56;
// The sprite is placed at ONE fixed offset from the body and never re-anchored
// per frame — exactly like the original: in Player.tscn the (centered) animatedSprite
// node sits at position (0, -4) relative to the CharacterBody2D. Each pose is drawn
// relative to that origin, so jump/fall tuck the legs naturally instead of sliding.
// Anchored off the FEET, not pos.y: Actor.reduce_hitbox shrinks the dash hitbox from
// the top, which slides the body center down 4px while the feet stay planted. In
// Godot the sprite is a sibling of the CollisionShape2D so resizing it moved nothing;
// here pos.y is the center, so anchoring to it would drop the whole sprite on dash.
const SPRITE_OFFSET_X = 0;
const SPRITE_OFFSET_Y = -4;

// Two spritesheets with identical clips and frame indices: the normal set and the
// arm-pointing set the game swaps in while the buster is out (Shot.gd). Which one
// is drawn is decided by the engine's animation layer, not by this file.
const atlas = new Image();
const armAtlas = new Image();
let atlasReady = false;
let armAtlasReady = false;
atlas.onload = () => {
  atlasReady = true;
};
armAtlas.onload = () => {
  armAtlasReady = true;
};
atlas.src = atlasUrl;
armAtlas.src = armAtlasUrl;

// Clip data (loop flags, per-clip fps, frame sequences and both atlases' regions)
// goes into the engine: the abilities pick and read the current clip exactly as the
// Godot originals do, and this file only blits whatever frame that leaves showing.
player.loadAnimations(animData as unknown as AnimData);

// --- keyboard -> actions ---
const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'move_left',
  KeyA: 'move_left',
  ArrowRight: 'move_right',
  KeyD: 'move_right',
  ArrowUp: 'move_up',
  KeyW: 'move_up',
  ArrowDown: 'move_down',
  KeyS: 'move_down',
  Space: 'jump',
  KeyK: 'jump',
  ShiftLeft: 'dash',
  KeyL: 'dash',
  KeyJ: 'fire',
  KeyF: 'fire',
};

window.addEventListener('keydown', (e) => {
  const a = KEYMAP[e.code];
  if (a) {
    input.setDown(a, true);
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  const a = KEYMAP[e.code];
  if (a) {
    input.setDown(a, false);
    e.preventDefault();
  }
});

// --- afterimage trail ---
// Dash.gd keeps its ghost sprite synchronized with the live one every frame
// (synchronize_sprite_effect) and Wallslide.gd emits from the wall; both are sampled
// here off the fixed tick so ghost spacing follows the body's motion, not the
// display's refresh rate.
const trail = new Trail();

/** Which move, if any, is currently laying down a trail — and how it should look. */
function trailStyle(): TrailStyle | null {
  if (player.is_executing_either(['Dash', 'AirDash'])) return DASH_TRAIL;
  if (player.is_executing('WallSlide')) return WALLSLIDE_TRAIL;
  return null;
}

/**
 * The sprite as it stands right now, in the same draw-space coordinates the player is
 * blitted at. Resolving the anchor at emit time (rather than storing pos.y) matters:
 * Dash shrinks the hitbox, so a ghost that re-derived its anchor from a stale body
 * centre would sit 4px off once the dash ends.
 */
function spriteSnapshot(): GhostSource | null {
  const region = player.currentRegion();
  if (!region) return null;
  return {
    x: player.pos.x + SPRITE_OFFSET_X,
    y: player.pos.y + player.hh - BODY_HALF_H + SPRITE_OFFSET_Y,
    region,
    facing: player.get_facing_direction(),
    layer: player.get_animation_layer(),
  };
}

// --- fixed-timestep loop ---
let acc = 0;
let last = performance.now();
function frame(now: number) {
  const dtMs = now - last;
  acc += Math.min(0.25, dtMs / 1000);
  last = now;
  while (acc >= DT) {
    player.tick(DT); // advances the sprite too, on the same fixed step
    camera.follow(player.pos.x, player.pos.y, DT); // same fixed step, so scrolling is deterministic
    const style = trailStyle();
    trail.sample(DT, style ? spriteSnapshot() : null, style ?? DASH_TRAIL);
    acc -= DT;
  }
  render();
  requestAnimationFrame(frame);
}

// --- environment palette ---
// Near-black backdrop ruled with a faint green grid, and collision geometry
// drawn as dark blocks whose *exposed* faces are outlined in a bright edge
// colour — so what the physics treats as solid is exactly what reads as solid.
const COLOR_BG = '#050a16';
const COLOR_GRID = '#123f2b';
const COLOR_TILE_FILL = '#080d1c';
const COLOR_TILE_EDGE = '#e8eefc';

/**
 * The tile range the camera can currently see, as inclusive grid bounds clamped
 * to the world. Everything outside it is skipped: the level holds thousands of
 * tiles and only a few hundred are ever on screen, so drawing the whole grid
 * every frame would be almost entirely wasted work.
 */
interface ViewTiles {
  tx0: number;
  ty0: number;
  tx1: number;
  ty1: number;
}

function visibleTiles(): ViewTiles {
  return {
    tx0: Math.max(0, Math.floor(camera.x / TILE_SIZE)),
    ty0: Math.max(0, Math.floor(camera.y / TILE_SIZE)),
    tx1: Math.min(world.cols - 1, Math.floor((camera.x + camera.viewW) / TILE_SIZE)),
    ty1: Math.min(world.rows - 1, Math.floor((camera.y + camera.viewH) / TILE_SIZE)),
  };
}

/** Backdrop plus the one-pixel grid ruled on every visible tile boundary. */
function drawBackground(view: ViewTiles): void {
  // Padded by a pixel on each side: the translation is rounded but this rect is
  // not, so an exact-size fill can leave a sliver of stale frame along an edge.
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(camera.x - 1, camera.y - 1, camera.viewW + 2, camera.viewH + 2);

  // Drawn as 1px rects rather than strokes: a stroked line straddles the
  // boundary and lands on half a device pixel once the context is scaled, which
  // blurs it. Filled rects stay crisp at any SCALE.
  ctx.fillStyle = COLOR_GRID;
  const top = view.ty0 * TILE_SIZE;
  const left = view.tx0 * TILE_SIZE;
  const height = (view.ty1 + 1) * TILE_SIZE - top;
  const width = (view.tx1 + 1) * TILE_SIZE - left;
  for (let tx = view.tx0; tx <= view.tx1; tx++) {
    if (tx > 0) ctx.fillRect(tx * TILE_SIZE, top, 1, height);
  }
  for (let ty = view.ty0; ty <= view.ty1; ty++) {
    if (ty > 0) ctx.fillRect(left, ty * TILE_SIZE, width, 1);
  }
}

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Does a tile of this kind fill the whole of one of its sides? Used to hide the
 * seam between touching geometry: a ramp's tall vertical edge and its base are
 * full faces, its diagonal side is not.
 */
function coversSide(kind: Tile, side: Side): boolean {
  switch (kind) {
    case Tile.Solid:
      return true;
    case Tile.SlopeUpRight:
      return side === 'right' || side === 'bottom';
    case Tile.SlopeUpLeft:
      return side === 'left' || side === 'bottom';
    default:
      return false;
  }
}

const OPPOSITE: Record<Side, Side> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};
const NEIGHBOUR: Record<Side, [number, number]> = {
  top: [0, -1],
  bottom: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** A stroked face, as world-space endpoints. */
type Edge = [number, number, number, number];

const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

/** Fill one tile's solid area — a full square, or the triangle under a ramp. */
function fillTile(kind: Tile, x: number, y: number): void {
  const x1 = x + TILE_SIZE;
  const y1 = y + TILE_SIZE;
  if (kind === Tile.Solid) {
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    return;
  }
  const apexX = kind === Tile.SlopeUpRight ? x1 : x;
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x1, y1);
  ctx.lineTo(apexX, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * The face of a tile on the given side, as an edge.
 *
 * Inset by half a pixel so the 1px stroke covers the tile's outermost pixel row
 * instead of straddling the boundary — on the boundary itself it would land on
 * half a device pixel and blur.
 */
function sideEdge(side: Side, x: number, y: number): Edge {
  const x1 = x + TILE_SIZE;
  const y1 = y + TILE_SIZE;
  switch (side) {
    case 'top':
      return [x, y + 0.5, x1, y + 0.5];
    case 'bottom':
      return [x, y1 - 0.5, x1, y1 - 0.5];
    case 'left':
      return [x + 0.5, y, x + 0.5, y1];
    default:
      return [x1 - 0.5, y, x1 - 0.5, y1];
  }
}

/** The faces of this tile that are open to air, so worth outlining. */
function exposedEdges(kind: Tile, tx: number, ty: number): Edge[] {
  const x = tx * TILE_SIZE;
  const y = ty * TILE_SIZE;
  const edges: Edge[] = [];

  // A ramp's diagonal is always exposed — nothing sits flush against it.
  if (kind === Tile.SlopeUpRight) edges.push([x, y + TILE_SIZE, x + TILE_SIZE, y]);
  else if (kind === Tile.SlopeUpLeft) edges.push([x, y, x + TILE_SIZE, y + TILE_SIZE]);

  for (const side of SIDES) {
    if (!coversSide(kind, side)) continue;
    const [dx, dy] = NEIGHBOUR[side];
    if (coversSide(world.tileAt(tx + dx, ty + dy), OPPOSITE[side])) continue;
    edges.push(sideEdge(side, x, y));
  }
  return edges;
}

/** Fills the collision geometry, then strokes only the faces open to air. */
function drawTiles(view: ViewTiles): void {
  const edges: Edge[] = [];

  ctx.fillStyle = COLOR_TILE_FILL;
  for (let ty = view.ty0; ty <= view.ty1; ty++) {
    for (let tx = view.tx0; tx <= view.tx1; tx++) {
      const kind = world.tileAt(tx, ty);
      if (kind === Tile.Empty) continue;
      fillTile(kind, tx * TILE_SIZE, ty * TILE_SIZE);
      edges.push(...exposedEdges(kind, tx, ty));
    }
  }

  ctx.strokeStyle = COLOR_TILE_EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [ax, ay, bx, by] of edges) {
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}

/**
 * Health gauge, drawn in the same style as the in-game HUD: an outlined column
 * that fills from the bottom, with the pilot's initial in a cell underneath.
 */
function drawHud(): void {
  const x = 8;
  const y = 8;
  const w = 10;
  const h = 56;

  ctx.fillStyle = 'rgba(6, 12, 28, 0.85)';
  ctx.fillRect(x, y, w, h);

  const ratio = Math.max(0, player.current_health / player.max_health);
  const filled = Math.round((h - 2) * ratio);
  ctx.fillStyle = '#bfe9ff';
  ctx.fillRect(x + 1, y + h - 1 - filled, w - 2, filled);
  // Segment ticks, two pixels apart, reading as the original's stacked bars.
  ctx.fillStyle = COLOR_BG;
  for (let ty = y + 2; ty < y + h - 1; ty += 3) ctx.fillRect(x + 1, ty, w - 2, 1);

  ctx.strokeStyle = COLOR_TILE_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Pilot cell
  ctx.fillStyle = 'rgba(6, 12, 28, 0.85)';
  ctx.fillRect(x, y + h + 2, w, 12);
  ctx.strokeRect(x + 0.5, y + h + 2.5, w - 1, 11);
  ctx.fillStyle = '#4ea8ff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('X', x + w / 2, y + h + 9);
}

/**
 * Blit one sprite frame centered on (cx, cy) in world pixels — the single path both
 * the live player and every afterimage go through, so a ghost can never drift out of
 * register with the sprite that spawned it.
 *
 * `layer` picks the sheet the way Shot.gd's SpriteFrames swap does, and `opacity`
 * carries the trail fade; at 1 the alpha is left untouched.
 */
function drawSprite(
  region: Region,
  cx: number,
  cy: number,
  facing: number,
  layer: AnimationLayer,
  opacity: number,
): void {
  if (!atlasReady || opacity <= 0) return;
  const [sx, sy, sw, sh] = region;
  if (sw <= 0 || sh <= 0) return;

  const sheet = layer === 'pointing_cannon' && armAtlasReady ? armAtlas : atlas;
  ctx.save();
  if (opacity < 1) ctx.globalAlpha = opacity;
  ctx.translate(cx, cy);
  ctx.scale(facing, 1); // facing === -1 mirrors left
  ctx.drawImage(sheet, sx, sy, sw, sh, -FRAME_W / 2, -FRAME_H / 2, FRAME_W, FRAME_H);
  ctx.restore();
}

function render() {
  // Reset to the base transform (device pixels), then work in world pixels shifted
  // by the camera. The scroll offset is rounded to whole world pixels: at a
  // fractional offset every sprite and tile edge would resample against the pixel
  // grid and the whole picture would shimmer as the camera eases.
  ctx.setTransform(SCALE * dpr, 0, 0, SCALE * dpr, 0, 0);
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  const view = visibleTiles();
  drawBackground(view);
  drawTiles(view);

  // --- afterimages, then the player sprite ---
  // Ghosts first so the live sprite always reads on top of its own trail.
  for (const g of trail.ghosts) {
    drawSprite(g.region, g.x, g.y, g.facing, g.layer, Trail.opacity(g));
  }
  const region = player.currentRegion();
  if (region) {
    const snap = spriteSnapshot()!;
    drawSprite(region, snap.x, snap.y, snap.facing, snap.layer, 1);
  }

  // --- projectiles ---
  ctx.fillStyle = '#fdfd96';
  for (const p of player.projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // The HUD is screen furniture, not part of the scene: drop the camera offset so
  // it stays pinned to the corner of the view instead of scrolling away with it.
  ctx.setTransform(SCALE * dpr, 0, 0, SCALE * dpr, 0, 0);
  drawHud();
}

requestAnimationFrame(frame);

// expose for quick console poking
(window as any).player = player;
