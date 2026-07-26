import type { Enemy } from "@mmx/engine/game/Enemy.js";
import type { Player } from "@mmx/engine/game/Player.js";
import type { Scene } from "@mmx/engine/game/Scene.js";
import { SoundEffects } from "./SoundEffects.js";

/** Forward loop from MMX's 32 kHz Charge.wav import metadata, in seconds. */
const CHARGE_LOOP: [number, number] = [51645 / 32000, 56497 / 32000];

/**
 * Connects deterministic engine events to browser-owned sound playback.
 * Call attachScene again whenever a restart replaces the Scene instance.
 */
export class GameplaySounds {
  private readonly effects: SoundEffects;

  constructor(effects: SoundEffects = new SoundEffects()) {
    this.effects = effects;
  }

  unlock(): void {
    this.effects.unlock();
  }

  load(): Promise<void> {
    return this.effects.load();
  }

  stop(): void {
    this.effects.stopAll();
  }

  attachScene(scene: Scene): void {
    this.stopSustained();
    this.attachPlayer(scene.player);
  }

  attachPlayer(player: Player): void {
    player.events.on("ability_started", (name: string) => {
      if (["Jump", "DashJump", "WallJump", "DashWallJump"].includes(name)) {
        this.effects.play("jump", { rate: [1, 1.1] });
      } else if (name === "Dash" || name === "AirDash") {
        this.effects.play("dash", { db: -0.676, rate: [1, 1.1] });
      } else if (name === "WallSlide") {
        this.effects.play("wallslide", { loop: true, rate: [1, 1.1] });
      } else if (name === "Damage") {
        this.effects.play("damage", { rate: [1, 1.1] });
      } else if (name === "Death") {
        this.effects.play("playerDeath");
      } else if (name === "Intro") {
        this.effects.play("introAppear", { db: -14 });
      }
    });
    player.events.on("ability_end", (name: string) => {
      if (name === "WallSlide") this.effects.stop("wallslide");
    });
    player.events.on("x_appear", () => this.effects.play("introThunder", { db: -9, rate: 1.19 }));
    player.events.on("land", () => this.effects.play("land", { db: -5.333, rate: [1, 1.1] }));
    player.events.on("healed", () => this.effects.play("heal", { db: -10 }));
    player.events.on("shot_fired", (charge: number) => {
      if (player.activeWeapon === "dark_arrow") {
        this.effects.play("darkArrow", { rate: [0.95, 1] });
      } else if (charge <= 0) {
        this.effects.play("lemon", { rate: [0.95, 1] });
      } else if (charge === 1) {
        this.effects.play("mediumShot", { rate: [0.95, 1] });
      } else {
        this.effects.play("chargedShot", { rate: [0.95, 1] });
      }
    });
    player.events.on("charge_started", () => {
      this.effects.play("charge", { db: -13.5, loop: true, loopSeconds: CHARGE_LOOP });
    });
    player.events.on("charge_stopped", () => this.effects.stop("charge"));
  }

  attachEnemy(enemy: Enemy): void {
    enemy.events.on("damage", () => this.effects.play("enemyHit", { db: -6.832 }));
    enemy.events.on("shield_hit", () => this.effects.play("shieldHit", { db: -6.832 }));
    enemy.events.on("guard_break", () => {
      this.effects.play("shieldHit", { db: -6.832 });
      this.effects.play("guardBreak", { db: -8, rate: 0.78 });
    });
    enemy.events.on("zero_health", () => this.effects.play("enemyDeath", { db: -4.267 }));
  }

  stopSustained(): void {
    this.effects.stop("wallslide");
    this.effects.stop("charge");
  }
}
