import { Input, Action } from '../core/Input.js';
import { DT } from '../core/constants.js';
import { Player } from '../engine/Player.js';
import { Camera } from '../engine/Camera.js';
import { makeWorld, SPAWN, CAMERA_ZONES } from '../engine/level.js';
import type { AnimData } from '../engine/Animation.js';
import { Trail, TrailStyle, DASH_TRAIL, WALLSLIDE_TRAIL } from './Trail.js';
import { animData } from './render/assets.js';
import { Renderer } from './render/Renderer.js';
import { spriteSnapshot } from './render/sprite.js';

/**
 * Entry point: input, the fixed-timestep loop, and nothing else. The simulation
 * lives in src/engine (shared unchanged with the headless sim) and the drawing in
 * {@link Renderer} — this file only wires the two together.
 */

const input = new Input();
const world = makeWorld();
const player = new Player(world, SPAWN.x, SPAWN.y, input);
const camera = new Camera(world.widthPx, world.heightPx);
camera.setZones(CAMERA_ZONES);
camera.snapTo(player.pos.x, player.pos.y);

// Clip data (loop flags, per-clip fps, frame sequences and both atlases' regions)
// goes into the engine: the abilities pick and read the current clip exactly as the
// Godot originals do, and the renderer only draws whatever frame that leaves showing.
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
// off the fixed tick so ghost spacing follows the body's motion, not the display's
// refresh rate.
const trail = new Trail();

/** Which move, if any, is currently laying down a trail — and how it should look. */
function trailStyle(): TrailStyle | null {
  if (player.is_executing_either(['Dash', 'AirDash'])) return DASH_TRAIL;
  if (player.is_executing('WallSlide')) return WALLSLIDE_TRAIL;
  return null;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = await Renderer.create(canvas, world);

  window.addEventListener('resize', () => renderer.fit());
  // Dragging the window to a monitor with a different scaling factor changes dpr
  // without necessarily resizing the viewport, and the media query only matches the
  // dpr it was created with — so re-arm it against the new value on every change.
  function watchDpr(): void {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener(
      'change',
      () => {
        renderer.fit();
        watchDpr();
      },
      { once: true },
    );
  }
  watchDpr();

  // --- fixed-timestep loop ---
  let acc = 0;
  let last = performance.now();
  function frame(now: number): void {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= DT) {
      player.tick(DT); // advances the sprite too, on the same fixed step
      camera.follow(player.pos.x, player.pos.y, DT); // same fixed step, so scrolling is deterministic
      const style = trailStyle();
      trail.sample(DT, style ? spriteSnapshot(player) : null, style ?? DASH_TRAIL);
      acc -= DT;
    }
    renderer.render(player, camera, trail);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Not top-level await: the build targets es2020, which predates it.
void main();

// expose for quick console poking
(window as any).player = player;
