import type { Container } from "pixi.js";
import { BODY_HALF_H, DASH_FX_OFFSET_X, DASH_FX_OFFSET_Y } from "@mmx/engine/core/constants.js";
import type { Enemy } from "@mmx/engine/engine/Enemy.js";
import type { LifeCapsule, WeaponCapsule } from "@mmx/engine/engine/Pickup.js";
import type { Player } from "@mmx/engine/engine/Player.js";
import type { Scene } from "@mmx/engine/engine/Scene.js";
import type { Stage } from "@mmx/engine/engine/Stage.js";
import type { AnimData } from "@mmx/engine/engine/Animation.js";
import {
  DashSmoke,
  EnemyDebris,
  EnemyExplosion,
  Trail,
  type TrailStyle,
  DASH_TRAIL,
  WALLSLIDE_TRAIL,
  animData,
  enemyAnims,
  pickupAnims,
  Renderer,
  spriteSnapshot,
} from "@mmx/renderer-pixi";
import { DebugOverlay } from "../debug/DebugOverlay.js";
import type { SoundEffects } from "../SoundEffects.js";

/**
 * MMX - Charge.wav.import declares a forward loop over PCM frames 51645..56497
 * of a 32 kHz file — the tail of the hum, which is what should sustain while the
 * shot holds. Kept in seconds because that is what the Web Audio source wants
 * and the decoded buffer no longer carries the file's rate.
 */
const CHARGE_LOOP: [number, number] = [51645 / 32000, 56497 / 32000];

/**
 * Everything about drawing a scene: the {@link Renderer} itself, the
 * cosmetic-only afterimage trail, dash smoke, and enemy death burst/debris
 * that ride alongside the simulation, the debug shape overlay, and attaching
 * sound/animation data to a scene's player and enemies.
 *
 * Split out of main.ts because all of it has to be re-run on every scene
 * rebuild (restart, replay load) — {@link attach} is called once at startup
 * and again after every rebuild, the same way {@link DebugSession} calls
 * {@link attachEnemy} for every enemy a fresh scene spawns.
 */
export interface ScenePresenterOptions {
  sounds: SoundEffects;
  /**
   * Death's restart_delay is timed to the death sample, so by the time it
   * fires the death sound has already finished playing out.
   */
  onPlayerDeath: () => void;
  /** WeaponChanger.gd's selection changed — see {@link attachPlayer}. */
  onWeaponChanged: (weapon: string) => void;
}

export class ScenePresenter {
  private readonly trail = new Trail();
  private readonly smoke = new DashSmoke();
  private readonly explosion = new EnemyExplosion();
  private readonly debris = new EnemyDebris();
  private readonly overlay = new DebugOverlay();
  private renderer: Renderer | null = null;
  private readonly sounds: SoundEffects;

  constructor(private readonly options: ScenePresenterOptions) {
    this.sounds = options.sounds;
  }

  get pixelScale(): number {
    return this.renderer?.pixelScale ?? 0;
  }

  async create(canvas: HTMLCanvasElement, stage: Stage): Promise<void> {
    const renderer = await Renderer.create(canvas, stage);
    renderer.worldOverlay.addChild(this.overlay.view);
    this.renderer = renderer;
  }

  /** See {@link Renderer.fit}. A no-op before {@link create} resolves. */
  fit(preferredScale?: number): void {
    this.renderer?.fit(preferredScale);
  }

  /** Screen-space layer for menus — main.ts adds the home/settings views to it. */
  get uiLayer(): Container {
    if (!this.renderer) throw new Error("ScenePresenter.create must resolve first");
    return this.renderer.uiLayer;
  }

  /**
   * Attach to a scene — at startup, and again after every restart or replay load.
   *
   * The cosmetic buffers are cleared rather than left to age out: they hold frozen
   * copies of the previous run's sprite, so a rewind would otherwise leave a
   * handful of afterimages hanging in the air where the player used to be.
   */
  attach(scene: Scene): void {
    this.attachPlayer(scene.player);
    this.trail.clear();
    this.smoke.clear();
    this.explosion.clear();
    this.debris.clear();
    this.overlay.reset();
    // Sustained sounds outlive the frame that started them, so a restart or replay
    // load must not leave a loop from the previous scene playing.
    this.sounds.stop("wallslide");
    this.sounds.stop("charge");
    this.renderer?.setStage(scene.stage);
  }

  /**
   * Ability.gd randomizes ordinary ability sounds upward by up to ten percent.
   * Re-subscribed per scene: the events live on the player, and a rebuilt scene has
   * a new one.
   */
  private attachPlayer(player: Player): void {
    // Clip data (loop flags, per-clip fps, frame sequences and both atlases' regions)
    // goes into the engine: the abilities pick and read the current clip exactly as the
    // Godot originals do, and the renderer only draws whatever frame that leaves showing.
    player.loadAnimations(animData as unknown as AnimData);

    player.events.on("ability_started", (name: string) => {
      if (["Jump", "DashJump", "WallJump", "DashWallJump"].includes(name)) {
        this.sounds.play("jump", { rate: [1, 1.1] });
      } else if (name === "Dash" || name === "AirDash") {
        this.sounds.play("dash", { db: -0.676, rate: [1, 1.1] });
      } else if (name === "WallSlide") {
        // Keep the scrape alive for as long as the sustained ability is active.
        // It remains routed through SoundEffects' master gain, so changing the
        // volume while wall-sliding takes effect immediately.
        this.sounds.play("wallslide", { loop: true, rate: [1, 1.1] });
      } else if (name === "Damage") {
        this.sounds.play("damage", { rate: [1, 1.1] });
      } else if (name === "Death") {
        this.sounds.play("playerDeath");
      } else if (name === "Intro") {
        this.sounds.play("introAppear", { db: -14 });
      }
    });
    player.events.on("ability_end", (name: string) => {
      if (name === "WallSlide") this.sounds.stop("wallslide");
    });
    player.events.on("death", () => this.options.onPlayerDeath());
    // Intro.gd's thunder cue: the armor-equip clang partway through beam_equip.
    player.events.on("x_appear", () => this.sounds.play("introThunder", { db: -9, rate: 1.19 }));
    player.events.on("land", () => this.sounds.play("land", { db: -5.333, rate: [1, 1.1] }));
    // PickUp.do_heal(): one "Life Gain" blip per HP tick a capsule applies.
    player.events.on("healed", () => this.sounds.play("heal", { db: -10 }));
    player.events.on("shot_fired", (charge: number) => {
      if (player.activeWeapon === "dark_arrow") this.sounds.play("darkArrow", { rate: [0.95, 1] });
      else if (charge <= 0) this.sounds.play("lemon", { rate: [0.95, 1] });
      else if (charge === 1) this.sounds.play("mediumShot", { rate: [0.95, 1] });
      else this.sounds.play("chargedShot", { rate: [0.95, 1] });
    });
    // WeaponChanger.gd — no in-game HUD icon bar yet, so the switch is surfaced
    // through the same debug-notify channel as other transient player feedback
    // (see main.ts's gamepad-connected message).
    player.events.on("weapon_changed", (weapon: string) => {
      this.options.onWeaponChanged(weapon);
    });
    player.events.on("charge_started", () => {
      this.sounds.play("charge", { db: -13.5, loop: true, loopSeconds: CHARGE_LOOP });
    });
    // Topping out is a visual-only cue: the hum just keeps looping. Layering a
    // second sample over it only read as louder, not as a threshold being crossed.
    player.events.on("charge_stopped", () => this.sounds.stop("charge"));

    // --- dash kick-up smoke ---
    // Unlike the trail this is not sampled: Dash.gd emits a single puff at the moment it
    // pushes off, so the ability announces it and the effect is spawned from the signal.
    // The puff is pinned to where the body was on that frame and left there.
    player.events.on("dash_smoke", (clip: string, dir: number) => {
      // The emitter hangs off the player *root*, whose origin is the unshrunk body
      // centre — which is not pos.y here, because reduce_hitbox trims the dash hitbox
      // from the top and slides the centre down while the feet stay planted. Anchor off
      // the feet instead, exactly as spriteSnapshot does, or the puff drops 4px the
      // instant the dash hitbox comes in.
      this.smoke.spawn(
        player.pos.x + DASH_FX_OFFSET_X * dir,
        player.pos.y + player.hh - BODY_HALF_H + DASH_FX_OFFSET_Y,
        clip,
        dir,
      );
    });
  }

  /** {@link DebugSession}'s `onEnemySpawned` callback. */
  attachEnemy(enemy: Enemy): void {
    // Same split as the player's: clip data is engine state, because the abilities
    // read it (Hide waits for "open" to finish before it advances).
    enemy.loadAnimations(enemyAnims.actors[enemy.stats.sheet] as unknown as AnimData);
    enemy.events.on("damage", () => this.sounds.play("enemyHit", { db: -6.832 }));
    enemy.events.on("shield_hit", () => this.sounds.play("shieldHit", { db: -6.832 }));
    enemy.events.on("guard_break", () => {
      // EnemyShield plays its deflection sound before EnemyStun's break effect.
      this.sounds.play("shieldHit", { db: -6.832 });
      this.sounds.play("guardBreak", { db: -8, rate: 0.78 });
    });
    enemy.events.on("zero_health", () => {
      this.sounds.play("enemyDeath", { db: -4.267 });
      // EnemyDeath._Setup: the burst and the debris both start on the same tick
      // the death sequence takes over, pinned to where the enemy died rather
      // than following it — see EnemyExplosion/EnemyDebris.
      this.explosion.spawn(enemy.pos.x, enemy.pos.y);
      this.debris.spawn(enemy.pos.x, enemy.pos.y);
    });
  }

  /** {@link DebugSession}'s `onPickupSpawned` callback. */
  attachPickup(pickup: LifeCapsule): void {
    pickup.loadAnimations(pickupAnims.actors[pickup.kind] as unknown as AnimData);
  }

  /** {@link DebugSession}'s `onWeaponCapsuleSpawned` callback. */
  attachWeaponCapsule(capsule: WeaponCapsule): void {
    capsule.loadAnimations(pickupAnims.actors[capsule.sheet] as unknown as AnimData);
  }

  /** Which move, if any, is currently laying down a trail — and how it should look. */
  private trailStyle(player: Player): TrailStyle | null {
    if (player.is_executing_either(["Dash", "AirDash"])) return DASH_TRAIL;
    if (player.is_executing("WallSlide")) return WALLSLIDE_TRAIL;
    return null;
  }

  /**
   * The cosmetic half of a fixed step: sample the afterimage trail and age the
   * dash smoke. Called from inside the same step as the recorded simulation so
   * a slowed or single-stepped frame advances the afterimages by exactly one
   * tick too.
   */
  sampleCosmetics(dt: number, player: Player): void {
    const style = this.trailStyle(player);
    this.trail.sample(dt, style ? spriteSnapshot(player) : null, style ?? DASH_TRAIL);
    this.smoke.tick(dt); // SpriteEffect ages in _physics_process, so on the fixed step
    this.explosion.tick(dt);
    this.debris.tick(dt);
  }

  updateOverlay(scene: Scene, shapesVisible: boolean, spriteVisible: boolean): void {
    this.overlay.update(scene, scene.camera, shapesVisible, spriteVisible);
  }

  render(scene: Scene): void {
    this.renderer?.render(
      scene.stage,
      scene.camera,
      this.trail,
      this.smoke,
      this.explosion,
      this.debris,
    );
  }

  stats(): Record<string, string | number> {
    return this.renderer?.stats() ?? {};
  }
}
