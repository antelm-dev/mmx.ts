import { Input, Action } from '../core/Input.js';
import { DT, TILE_SIZE } from '../core/constants.js';
import { Player } from '../engine/Player.js';
import { makeWorld, LEVEL, SPAWN } from '../engine/level.js';
import { SpriteAnimator, AnimData } from './sprites.js';
import animData from './assets/x_anims.json';
import atlasUrl from './assets/x.png';

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

const atlas = new Image();
let atlasReady = false;
atlas.onload = () => {
  atlasReady = true;
};
atlas.src = atlasUrl;

// Loop flags, per-clip fps, and frame sequences all come from the exported data
// (faithful to the game's SpriteFrames): idle/walk/talk/crouch_talk/weak loop, the
// rest play once and hold their last frame.
const animator = new SpriteAnimator(animData as unknown as AnimData);

/** Maps an engine locomotion state to an animation tag in x.json. */
const STATE_TO_TAG: Record<string, string> = {
  Idle: 'idle',
  Walk: 'walk',
  Fall: 'fall',
  Jump: 'jump',
  DashJump: 'jump',
  Dash: 'dash',
  AirDash: 'dash',
  WallSlide: 'slide',
  WallJump: 'walljump',
  DashWallJump: 'walljump',
};
animator.play('idle');

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
    player.tick(DT);
    acc -= DT;
  }
  animator.update(dtMs);
  render();
  requestAnimationFrame(frame);
}

/** Picks the animation tag for the player's current locomotion (+ firing overlay). */
function currentTag(): string {
  const loco = player.currentLocomotion();
  const base = (loco && STATE_TO_TAG[loco.name]) || 'idle';
  // Grounded + firing: use the buster-shot pose instead of the plain stance.
  if (player.is_executing('Shot') && (base === 'idle' || base === 'walk')) {
    return base === 'walk' ? 'walk' : 'shot';
  }
  return base;
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
  // Pick clip, then blit the current atlas region centered on the body + offset.
  // Facing flips the sprite horizontally about its center.
  animator.play(currentTag());
  if (atlasReady) {
    const [sx, sy, sw, sh] = animator.currentRegion();
    if (sw > 0 && sh > 0) {
      const cx = player.pos.x + SPRITE_OFFSET_X;
      const cy = player.pos.y + SPRITE_OFFSET_Y;
      const facing = player.get_facing_direction();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(facing, 1); // facing === -1 mirrors left
      ctx.drawImage(atlas, sx, sy, sw, sh, -FRAME_W / 2, -FRAME_H / 2, FRAME_W, FRAME_H);
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
