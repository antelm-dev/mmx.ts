import { Application, Container, Sprite } from "pixi.js";
import { CHARGE_FX_OFFSET_Y, ChargeTier, VIEW_WIDTH, VIEW_HEIGHT } from "../../core/constants.js";
import type { Charge } from "../../engine/abilities/Charge.js";
import type { Camera } from "../../engine/Camera.js";
import type { Player } from "../../engine/Player.js";
import type { Stage } from "../../engine/Stage.js";
import type { World } from "../../engine/World.js";
import { DashSmoke } from "../DashSmoke.js";
import { Trail } from "../Trail.js";
import { enemyAnims, PLAYER_SHEETS, SHEET_URLS } from "./assets.js";
import { Hud } from "./Hud.js";
import { place, spriteSnapshot } from "./sprite.js";
import { SpritePool } from "./SpritePool.js";
import { buildTerrain, COLOR_BG } from "./terrain.js";
import { loadSheets, regionTexture, shotTexture } from "./textures.js";

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
 *    |       +- terrain, ghosts, player, charge aura, projectiles, dash smoke
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
  [ChargeTier.Charging]: { clip: "charge_1", tint: 0x78d8f0 }, // x_charging_particle.tres
  [ChargeTier.Charged]: { clip: "charge_2", tint: 0xfff287 }, // x_charged_particle.tres
  [ChargeTier.Super]: { clip: "charge_2", tint: 0xffffff }, // x_supercharged_particle.tres
};

export class Renderer {
  private readonly viewport = new Container();
  private readonly scene = new Container();
  private readonly hudLayer = new Container();
  private readonly ghosts = new SpritePool();
  private readonly enemies = new SpritePool();
  private readonly shots = new SpritePool();
  private readonly smoke = new SpritePool();
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
    // z_index 4 and so rides in front. Enemies sit behind the player and in front
    // of the terrain (Metool.tscn animatedSprite z_index = 1), and shots stay on
    // top of everything so an impact is never hidden by what it hit. Dash smoke is
    // above even those: dash_particle carries z_index 45, so the dust reads over X
    // on the frames he has not yet cleared it.
    this.scene.addChild(
      this.enemies.view,
      this.ghosts.view,
      this.player,
      this.aura,
      this.shots.view,
      this.smoke.view,
    );
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

    // Before the Renderer is built, not after: the HUD cuts its textures out of the
    // sheets in its constructor.
    await loadSheets(SHEET_URLS);

    const renderer = new Renderer(app);
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
  }

  /** Bring the scene graph in line with the simulation, then draw it. */
  render(stage: Stage, camera: Camera, trail: Trail, smoke: DashSmoke): void {
    const { player } = stage;
    // The scroll offset is rounded to whole world pixels: at a fractional offset
    // every sprite and tile edge would resample against the pixel grid and the whole
    // picture would shimmer as the camera eases.
    //
    // Rounded *against the player*, not on its own. Sprites are quantised in world
    // space (see `place`), so an independently rounded scroll would put the player on
    // screen at `round(p) - round(c)` — two integer sequences with unrelated subpixel
    // phases. Walking is 1.5px a tick, so frac(p) alternates .0/.5 while the camera
    // eases along a continuous trail behind him, and that difference flips by a pixel
    // every frame: the body vibrates on the spot even though it and the camera are
    // moving at exactly the same speed. Subtracting a rounded *relative* offset makes
    // his screen position `round(p - c)`, a function of the gap alone, so it holds
    // still whenever the camera is matching him. The residual lands on the scroll
    // instead, where the world advances 1px on one frame and 2px on the next — which
    // is what 1.5px/tick on a pixel grid has to look like somewhere, and is far less
    // legible on distant terrain than on the sprite the eye is tracking.
    //
    // Only whole-pixel offsets separate the body from its sprite anchor, so the body
    // position stands in for it here and both quantise in step.
    this.scene.position.set(
      Math.round(player.pos.x - camera.x) - Math.round(player.pos.x),
      Math.round(player.pos.y - camera.y) - Math.round(player.pos.y),
    );

    this.syncEnemies(stage);
    this.syncGhosts(trail);
    this.syncPlayer(player);
    this.syncAura(player);
    this.syncShots(player);
    this.syncSmoke(smoke);
    this.hud.update(player, camera);

    this.app.render();
  }

  /**
   * Enemies, each drawn from its own kind's sheet.
   *
   * The sprite is centred on the body, which is how both scenes have it — their
   * animatedSprite nodes carry no offset, unlike the player's (0, -4). Two bits
   * of engine state show through: `flash` fades the frame for a moment after a
   * hit (standing in for EnemyDamage's Flash shader parameter, which this
   * renderer has no shader for), and an enemy whose death sequence has already
   * hidden its sprite is skipped entirely.
   */
  private syncEnemies(stage: Stage): void {
    this.enemies.begin();
    for (const enemy of stage.enemies) {
      if (!enemy.sprite_visible) continue;
      const region = enemy.currentRegion();
      if (!region) continue;
      const texture = regionTexture(enemyAnims.actors[enemy.stats.sheet].sheet, region);
      if (!texture) continue;

      const sprite = this.enemies.next();
      // Both sheets are authored facing right but the scenes set `flip_h = true`,
      // so the mirror is inverted relative to the player's.
      place(sprite, texture, enemy.pos.x, enemy.pos.y, -enemy.get_facing_direction());
      sprite.alpha = enemy.flash > 0 ? 0.5 : 1;
    }
    this.enemies.end();
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
    // Character.apply_invulnerability_shader sets Alpha to 0.5 after the hurt
    // animation ends; Damage._Setup keeps full alpha during the actual tumble.
    this.player.alpha = player.is_invulnerable() && !player.is_executing("Damage") ? 0.5 : 1;
  }

  /** The charge-up aura, drawn over X exactly as the emitter sits over his sprite. */
  private syncAura(player: Player): void {
    const charge = player.get_ability("Charge") as Charge | undefined;
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

  /**
   * The dust left behind by a dash. Each puff draws at the world position it was
   * emitted at — it was cut loose from the player when it spawned (see
   * {@link DashSmoke}), so there is nothing to follow here.
   */
  private syncSmoke(smoke: DashSmoke): void {
    this.smoke.begin();
    for (const puff of smoke.puffs) {
      const texture = shotTexture(puff.clip, DashSmoke.frame(puff));
      if (texture) place(this.smoke.next(), texture, puff.x, puff.y, puff.facing);
    }
    this.smoke.end();
  }
}
