import { Input, Action } from '../core/Input.js';
import { DT, TILE_SIZE } from '../core/constants.js';
import { Player } from '../engine/Player.js';
import { makeWorld, LEVEL, SPAWN } from '../engine/level.js';
import { AnimData } from '../engine/Animation.js';
import animData from './assets/x_anims.json';
import atlasUrl from './assets/x.png';
import armAtlasUrl from './assets/x_leftarm.png';

/**
 * Browser front-end: renders the ported gameplay with the Canvas 2D API. The
 * context is scaled by SCALE and left in the engine's coordinate system — world
 * pixels with y pointing down and the origin at the top-left — so the engine's 2D
 * coordinates map straight to canvas space with no camera transform. The player is
 * drawn with the X spritesheet (x.png / x.json) animated per movement state. The
 * engine itself is pure and shared with the headless sim — this file is only I/O +
 * drawing.
 */

const SCALE = 3;
const input = new Input();
const world = makeWorld();
const player = new Player(world, SPAWN.x, SPAWN.y, input);

const canvas = document.getElementById('game') as HTMLCanvasElement;

// --- canvas 2d context ---
// The backing store is a fixed world-pixels * SCALE * devicePixelRatio grid so the
// picture is always crisp; all drawing is done in world-pixel units via a single
// base transform. The CSS *display* size is computed separately to fill the window
// while preserving the level's aspect ratio (see fitCanvas), so the picture is never
// stretched — capping width and height independently (max-width/height) would.
const ctx = canvas.getContext('2d')!;
const dpr = window.devicePixelRatio || 1;
canvas.width = world.widthPx * SCALE * dpr;
canvas.height = world.heightPx * SCALE * dpr;
ctx.imageSmoothingEnabled = false; // pixel-art: nearest-neighbour sampling

/** Fit the canvas into the viewport, preserving the world's aspect ratio. */
function fitCanvas(): void {
  const aspect = world.widthPx / world.heightPx;
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
// The sprite is placed at ONE fixed offset from the body center and never re-anchored
// per frame — exactly like the original: in Player.tscn the (centered) animatedSprite
// node sits at position (0, -4) relative to the CharacterBody2D. Each pose is drawn
// relative to that origin, so jump/fall tuck the legs naturally instead of sliding.
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

// --- fixed-timestep loop ---
let acc = 0;
let last = performance.now();
function frame(now: number) {
  const dtMs = now - last;
  acc += Math.min(0.25, dtMs / 1000);
  last = now;
  while (acc >= DT) {
    player.tick(DT); // advances the sprite too, on the same fixed step
    acc -= DT;
  }
  render();
  requestAnimationFrame(frame);
}

function render() {
  // Reset to the base transform (device pixels), clear, then work in world pixels.
  ctx.setTransform(SCALE * dpr, 0, 0, SCALE * dpr, 0, 0);
  ctx.fillStyle = '#0b1021';
  ctx.fillRect(0, 0, world.widthPx, world.heightPx);

  // --- static tiles ---
  ctx.fillStyle = '#2b3a67';
  for (let ty = 0; ty < world.rows; ty++) {
    for (let tx = 0; tx < world.cols; tx++) {
      if (world.isSolidTile(tx, ty)) {
        ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // --- player sprite ---
  // Blit the region the engine's animation left showing, centered on the body +
  // offset, from the normal or arm-pointing sheet depending on the active layer.
  // Facing flips the sprite horizontally about its center.
  const sheetIsArm = player.get_animation_layer() === 'pointing_cannon' && armAtlasReady;
  const region = player.currentRegion();
  if (region && atlasReady) {
    const [sx, sy, sw, sh] = region;
    if (sw > 0 && sh > 0) {
      const sheet = sheetIsArm ? armAtlas : atlas;
      const cx = player.pos.x + SPRITE_OFFSET_X;
      const cy = player.pos.y + SPRITE_OFFSET_Y;
      const facing = player.get_facing_direction();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(facing, 1); // facing === -1 mirrors left
      ctx.drawImage(sheet, sx, sy, sw, sh, -FRAME_W / 2, -FRAME_H / 2, FRAME_W, FRAME_H);
      ctx.restore();
    }
  }

  // --- projectiles ---
  ctx.fillStyle = '#fdfd96';
  for (const p of player.projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

requestAnimationFrame(frame);

// expose for quick console poking
(window as any).player = player;
void LEVEL;
