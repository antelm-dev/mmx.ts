import { Application, Container, Sprite } from 'pixi.js';
import { CHARGE_FX_OFFSET_Y, ChargeTier, VIEW_WIDTH, VIEW_HEIGHT } from '../../core/constants.js';
import type { Charge } from '../../engine/abilities/Charge.js';
import type { Camera } from '../../engine/Camera.js';
import type { Player } from '../../engine/Player.js';
import type { World } from '../../engine/World.js';
import { Trail } from '../Trail.js';
import { PLAYER_SHEETS, SHEET_URLS } from './assets.js';
import { Hud } from './Hud.js';
import { place, spriteSnapshot } from './sprite.js';
import { SpritePool } from './SpritePool.js';
import { buildTerrain, COLOR_BG } from './terrain.js';
import { loadSheets, regionTexture, shotTexture } from './textures.js';

/**
 * Browser front-end: renders the ported gameplay with PixiJS. The scene graph is
 * left in the engine's coordinate system — world pixels with y pointing down and
 * the origin at the top-left — so the engine's 2D coordinates map straight to
 * display space, and the camera is applied as a translation on one container
 * rather than being folded into every draw.
 *
 * The engine itself is pure and shared with the headless sim: this file reads
 * state and never writes it. Nothing here advances a clock — {@link sync} is
 * called after the fixed-step update has already decided what the frame looks
 * like, so a paused or single-stepped frame shows exactly what the simulation says
 * it should.
 *
 * Layering mirrors the draw order the immediate-mode renderer had, as containers
 * rather than call sequence:
 *
 *   stage
 *    +- viewport   (integer zoom)
 *    |   +- world  (camera scroll)
 *    |       +- terrain, ghosts, player, charge aura, projectiles
 *    +- hud        (integer zoom, no scroll — screen furniture)
 */

/**
 * Charge aura tints, from the three ParticleProcessMaterials in Player.tscn.
 * The sheets themselves are near-white sparkles — all of the colour lives in the
 * material, so drawing them untinted would put faint white specks on screen. Under
 * Canvas 2D this needed a scratch buffer and a `source-in` composite per frame;
 * a GPU tint is a vertex attribute, so it is free.
 */
const CHARGE_TIER_FX: Record<number, { clip: string; tint: number }> = {
  [ChargeTier.Charging]: { clip: 'charge_1', tint: 0x78d8f0 }, // x_charging_particle.tres
  [ChargeTier.Charged]: { clip: 'charge_2', tint: 0xfff287 }, // x_charged_particle.tres
  [ChargeTier.Super]: { clip: 'charge_2', tint: 0xffffff }, // x_supercharged_particle.tres
};

export class Renderer {
  private readonly viewport = new Container();
  private readonly scene = new Container();
  private readonly hudLayer = new Container();
  private readonly ghosts = new SpritePool();
  private readonly shots = new SpritePool();
  private readonly player = new Sprite();
  private readonly aura = new Sprite();
  private readonly hud = new Hud();

  /** Whole device pixels per world pixel. Recomputed by {@link fit}. */
  private scale = 0;

  private constructor(private readonly app: Application) {
    this.player.anchor.set(0.5);
    this.aura.anchor.set(0.5);

    // Ghosts before the player so the live sprite always reads on top of its own
    // trail; the aura after it, as the emitter is a child of animatedSprite with
    // z_index 4 and so rides in front.
    this.scene.addChild(this.ghosts.view, this.player, this.aura, this.shots.view);
    this.viewport.addChild(this.scene);
    this.hudLayer.addChild(this.hud.view);
    this.app.stage.addChild(this.viewport, this.hudLayer);
  }

  static async create(canvas: HTMLCanvasElement, world: World): Promise<Renderer> {
    const app = new Application();
    await app.init({
      canvas,
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      background: COLOR_BG,
      antialias: false,
      // The backdrop is opaque and covers the whole view, so the compositor never
      // needs to blend the canvas against the page.
      backgroundAlpha: 1,
      // The fixed-step loop drives rendering; Pixi's own ticker would render on its
      // own schedule and decouple the picture from the simulation.
      autoStart: false,
      // Device-pixel mapping is handled by fit(), which needs an integer scale.
      // Pixi's own dpr handling would reintroduce the fractional one.
      resolution: 1,
      autoDensity: false,
    });

    const renderer = new Renderer(app);
    await loadSheets(SHEET_URLS);
    renderer.scene.addChildAt(buildTerrain(world), 0);
    renderer.fit();
    return renderer;
  }

  /**
   * Size the canvas to the largest whole-number multiple of the view that fits the
   * window. Integer-only is the point: a 2.7x fit would be bigger, but every third
   * world pixel would be drawn one device pixel wider than its neighbours.
   *
   * Pixel-perfect rule: one world pixel must land on an exact, whole, equal number
   * of *device* pixels. So the scale is chosen as an integer in device space and the
   * backing store is VIEW * scale device pixels, with the CSS size derived back down
   * by dividing out devicePixelRatio. Picking the scale in CSS space instead (the
   * usual `VIEW * SCALE * dpr`) breaks on any fractional dpr — 1.25 and 1.5 are
   * ordinary on Windows — because the browser then resamples the backing store onto
   * a grid it does not divide evenly, and the sprite grid crawls as the camera eases.
   */
  fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth * dpr;
    const availH = window.innerHeight * dpr;

    // Clamped to 1: on a window too small for even a single 1:1 view we keep the
    // integer backing store and let CSS letterbox it down (see max-width in the
    // page style) rather than emit a fractional scale.
    const scale = Math.max(1, Math.floor(Math.min(availW / VIEW_WIDTH, availH / VIEW_HEIGHT)));
    const w = VIEW_WIDTH * scale;
    const h = VIEW_HEIGHT * scale;

    if (this.app.renderer.width !== w || this.app.renderer.height !== h) {
      this.app.renderer.resize(w, h);
    }
    // Back down to CSS pixels, so the backing store maps 1:1 onto device pixels.
    const canvas = this.app.canvas;
    canvas.style.width = `${w / dpr}px`;
    canvas.style.height = `${h / dpr}px`;

    if (scale === this.scale) return;
    this.scale = scale;
    this.viewport.scale.set(scale);
    this.hudLayer.scale.set(scale);
    this.hud.setScale(scale);
  }

  /** Bring the scene graph in line with the simulation, then draw it. */
  render(player: Player, camera: Camera, trail: Trail): void {
    // The scroll offset is rounded to whole world pixels: at a fractional offset
    // every sprite and tile edge would resample against the pixel grid and the whole
    // picture would shimmer as the camera eases.
    this.scene.position.set(-Math.round(camera.x), -Math.round(camera.y));

    this.syncGhosts(trail);
    this.syncPlayer(player);
    this.syncAura(player);
    this.syncShots(player);
    this.hud.update(player.current_health, player.max_health);

    this.app.render();
  }

  /** Afterimages: frozen poses that fade with age (see {@link Trail}). */
  private syncGhosts(trail: Trail): void {
    this.ghosts.begin();
    for (const ghost of trail.ghosts) {
      const opacity = Trail.opacity(ghost);
      if (opacity <= 0) continue;
      const texture = regionTexture(PLAYER_SHEETS[ghost.layer], ghost.region);
      if (!texture) continue;

      const sprite = this.ghosts.next();
      place(sprite, texture, ghost.x, ghost.y, ghost.facing);
      sprite.alpha = opacity;
    }
    this.ghosts.end();
  }

  /** The live sprite. `layer` picks the sheet the way Shot.gd's SpriteFrames swap does. */
  private syncPlayer(player: Player): void {
    const snap = spriteSnapshot(player);
    const texture = snap && regionTexture(PLAYER_SHEETS[snap.layer], snap.region);
    this.player.visible = !!texture;
    if (!snap || !texture) return;
    place(this.player, texture, snap.x, snap.y, snap.facing);
  }

  /** The charge-up aura, drawn over X exactly as the emitter sits over his sprite. */
  private syncAura(player: Player): void {
    const charge = player.get_ability('Charge') as Charge | undefined;
    const fx = charge && CHARGE_TIER_FX[charge.vfx_tier];
    const snap = fx && spriteSnapshot(player);
    const texture = fx && snap ? shotTexture(fx.clip, charge!.vfx_frame) : null;

    this.aura.visible = !!texture;
    if (!fx || !snap || !texture) return;

    // The emitter is a child of animatedSprite at (0, 3.99), so it rides the sprite.
    place(this.aura, texture, snap.x, snap.y + CHARGE_FX_OFFSET_Y, 1);
    this.aura.tint = fx.tint;
  }

  /**
   * A live shot draws its spin loop; a spent one has already been replaced by its
   * hit particle, pinned to where the impact happened rather than where the shot
   * would have drifted to. Both come out of the engine's own frame counters.
   */
  private syncShots(player: Player): void {
    this.shots.begin();
    for (const p of player.projectiles) {
      if (p.isLive) {
        const texture = shotTexture(p.kind, p.frame);
        if (texture) place(this.shots.next(), texture, p.x, p.y, p.dir);
        continue;
      }
      // A spent shot outlives its burst: once the effect has played out the node
      // is still around but there is nothing left to draw for it.
      if (p.hitParticleFrame < 0) continue;
      const texture = shotTexture(p.stats.hitFx, p.hitParticleFrame);
      if (texture) place(this.shots.next(), texture, p.hitX, p.hitY, p.dir, p.hitFlipV);
    }
    this.shots.end();
  }
}
