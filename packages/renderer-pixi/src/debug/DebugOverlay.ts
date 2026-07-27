import { Container, Graphics } from "pixi.js";
import { TILE_SIZE, Tile } from "@mmx/engine";
import type { Camera, Projectile, Scene } from "@mmx/engine";
import { spriteSnapshot } from "../render/sprite.js";
import {
  anyDebugRenderOption,
  DEBUG_RENDER_OPTIONS_OFF,
  mergeDebugRenderOptions,
  type DebugRenderOptions,
} from "./options.js";

const COLORS = {
  body: 0x51ff8a,
  bodyDash: 0xffe066,
  hurtbox: 0xff6b6b,
  vision: 0x7aa2ff,
  pursuit: 0xc17aff,
  shot: 0xffb347,
  trajectory: 0xffb347,
  solid: 0x3f5a6b,
  slope: 0x6b8fa8,
  normal: 0x9ef0ff,
  sprite: 0xff4fd8,
  zone: 0xffd166,
  zoneActive: 0x66ffcc,
  grid: 0x1d2b36,
  sensor: 0x88ffee,
  sensorActive: 0xff88aa,
  viewport: 0xffffff,
} as const;

const TRAIL_LENGTH = 40;

export class DebugOverlay {
  readonly view = new Container();
  private readonly g = new Graphics();
  private readonly trails = new Map<Projectile, { x: number; y: number }[]>();
  private current: DebugRenderOptions = { ...DEBUG_RENDER_OPTIONS_OFF };
  private destroyed = false;

  constructor() {
    this.view.addChild(this.g);
    this.view.visible = false;
  }

  options(): DebugRenderOptions {
    return { ...this.current };
  }

  setOptions(patch: Partial<DebugRenderOptions>): void {
    if (this.destroyed) return;
    this.current = mergeDebugRenderOptions(this.current, patch);
  }

  update(scene: Scene, options: DebugRenderOptions = this.current): void {
    if (this.destroyed) return;
    this.current = options;
    if (options.projectiles) this.sampleTrails(scene);
    else this.trails.clear();

    this.view.visible = anyDebugRenderOption(options);
    if (!this.view.visible) {
      this.g.clear();
      return;
    }

    const g = this.g;
    g.clear();

    if (options.collisionGeometry) this.drawTiles(g, scene, scene.camera);
    if (options.cameraZones) this.drawCamera(g, scene.camera);
    if (options.actorBounds) {
      this.drawEnemies(g, scene);
      this.drawPlayer(g, scene);
    }
    if (options.sensors) this.drawSensors(g, scene);
    if (options.projectiles) this.drawProjectiles(g, scene);
    if (options.spriteBounds) this.drawPlayerSprite(g, scene);
  }

  reset(): void {
    this.trails.clear();
    this.g.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.reset();
    this.view.removeFromParent();
    this.view.destroy({ children: true });
  }

  private drawTiles(g: Graphics, scene: Scene, camera: Camera): void {
    const { world } = scene;
    const x0 = Math.max(0, Math.floor(camera.x / TILE_SIZE));
    const x1 = Math.min(world.cols - 1, Math.ceil((camera.x + camera.viewW) / TILE_SIZE));
    const y0 = Math.max(0, Math.floor(camera.y / TILE_SIZE));
    const y1 = Math.min(world.rows - 1, Math.ceil((camera.y + camera.viewH) / TILE_SIZE));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const kind = world.tileAt(tx, ty);
        const px = tx * TILE_SIZE;
        const py = ty * TILE_SIZE;

        if (kind === Tile.Empty) {
          g.rect(px, py, TILE_SIZE, TILE_SIZE).stroke({ width: 1, color: COLORS.grid, alpha: 0.5 });
          continue;
        }
        if (kind === Tile.Solid) {
          g.rect(px, py, TILE_SIZE, TILE_SIZE).stroke({ width: 1, color: COLORS.solid });
          continue;
        }

        const leftY = world.slopeSurfaceY(tx, ty, kind, px);
        const rightY = world.slopeSurfaceY(tx, ty, kind, px + TILE_SIZE);
        g.moveTo(px, leftY)
          .lineTo(px + TILE_SIZE, rightY)
          .stroke({ width: 1, color: COLORS.slope });

        const midX = px + TILE_SIZE / 2;
        const midY = (leftY + rightY) / 2;
        const dy = rightY - leftY;
        const len = Math.hypot(TILE_SIZE, dy);
        const nx = dy / len;
        const ny = -TILE_SIZE / len;
        g.moveTo(midX, midY)
          .lineTo(midX + nx * 6, midY + ny * 6)
          .stroke({ width: 1, color: COLORS.normal });
      }
    }
  }

  private drawCamera(g: Graphics, camera: Camera): void {
    g.rect(camera.x, camera.y, camera.viewW, camera.viewH).stroke({
      width: 1,
      color: COLORS.viewport,
      alpha: 0.55,
    });
    for (const zone of camera.allZones) {
      const active = zone === camera.activeZone;
      g.rect(zone.x, zone.y, zone.w, zone.h).stroke({
        width: 1,
        color: active ? COLORS.zoneActive : COLORS.zone,
        alpha: active ? 0.9 : 0.35,
      });
    }
  }

  private drawEnemies(g: Graphics, scene: Scene): void {
    for (const enemy of scene.stage.enemies) {
      const s = enemy.stats;
      const seeing = enemy.target !== null;
      const vision = {
        x: enemy.pos.x - s.vision_hw,
        y: enemy.pos.y + s.vision_oy - s.vision_hh,
        w: s.vision_hw * 2,
        h: s.vision_hh * 2,
      };
      g.rect(vision.x, vision.y, vision.w, vision.h);
      if (seeing) g.fill({ color: COLORS.vision, alpha: 0.08 });
      g.stroke({ width: 1, color: COLORS.vision, alpha: seeing ? 0.8 : 0.3 });

      const giveUp = pursuitRadius(enemy);
      if (giveUp > 0) {
        g.circle(enemy.pos.x, enemy.pos.y, giveUp).stroke({
          width: 1,
          color: COLORS.pursuit,
          alpha: 0.4,
        });
      }

      box(g, enemy.pos.x, enemy.pos.y, enemy.hw, enemy.hh, COLORS.body, 0.7);
      box(g, enemy.pos.x, enemy.pos.y, s.hurt_hw, s.hurt_hh, COLORS.hurtbox, 0.9);

      if (enemy.has_shield()) {
        g.circle(enemy.pos.x, enemy.pos.y, 3).stroke({ width: 1, color: COLORS.hurtbox });
      }
    }
  }

  private drawProjectiles(g: Graphics, scene: Scene): void {
    for (const shot of scene.player.projectiles) {
      const trail = this.trails.get(shot);
      if (trail && trail.length > 1) {
        g.moveTo(trail[0].x, trail[0].y);
        for (const point of trail.slice(1)) g.lineTo(point.x, point.y);
        g.stroke({ width: 1, color: COLORS.trajectory, alpha: 0.5 });
      }

      if (!shot.isLive) continue;
      const b = shot.bounds;
      g.rect(b.left, b.top, b.right - b.left, b.bottom - b.top).stroke({
        width: 1,
        color: COLORS.shot,
      });
    }
  }

  private drawPlayer(g: Graphics, scene: Scene): void {
    const { player } = scene;
    const dashing = player.is_executing_either(["Dash", "AirDash"]);
    box(
      g,
      player.pos.x,
      player.pos.y,
      player.hw,
      player.hh,
      dashing ? COLORS.bodyDash : COLORS.body,
      1,
    );

    const muzzle = player.get_shot_position();
    g.circle(muzzle.x, muzzle.y, 1.5).stroke({ width: 1, color: COLORS.shot });

    g.moveTo(player.pos.x, player.pos.y)
      .lineTo(player.pos.x + player.velocity.x * 0.06, player.pos.y + player.velocity.y * 0.06)
      .stroke({ width: 1, color: COLORS.normal, alpha: 0.8 });
  }

  private drawSensors(g: Graphics, scene: Scene): void {
    const { player } = scene;
    const { hw, hh, pos } = player;

    strokeProbe(
      g,
      pos.x,
      pos.y + hh + 1,
      hw - 1,
      1,
      player.is_on_floor(),
    );
    strokeProbe(
      g,
      pos.x,
      pos.y - hh - 1,
      hw - 1,
      1,
      player.is_on_ceiling(),
    );

    const wallTop = -hh + 2;
    const wallBottom = hh - 2;
    const wallCy = pos.y + (wallTop + wallBottom) / 2;
    const wallHalf = (wallBottom - wallTop) / 2;
    const wallDir = player.is_colliding_with_wall();
    strokeProbe(g, pos.x + (hw + 1), wallCy, 1, wallHalf, wallDir === 1);
    strokeProbe(g, pos.x - (hw + 1), wallCy, 1, wallHalf, wallDir === -1);

    const reachTop = -hh + 2;
    const reachBottom = hh - 4;
    const reachCy = pos.y + (reachTop + reachBottom) / 2;
    const reachHalf = (reachBottom - reachTop) / 2;
    const reachDir = player.is_in_reach_for_walljump();
    strokeProbe(g, pos.x + (hw + 2), reachCy, 1, reachHalf, reachDir === 1);
    strokeProbe(g, pos.x - (hw + 2), reachCy, 1, reachHalf, reachDir === -1);
  }

  private drawPlayerSprite(g: Graphics, scene: Scene): void {
    const snap = spriteSnapshot(scene.player);
    if (!snap) return;
    const [, , w, h] = snap.region;
    g.rect(snap.x - w / 2, snap.y - h / 2, w, h).stroke({
      width: 1,
      color: COLORS.sprite,
    });
    g.moveTo(snap.x - 4, snap.y)
      .lineTo(snap.x + 4, snap.y)
      .moveTo(snap.x, snap.y - 4)
      .lineTo(snap.x, snap.y + 4)
      .stroke({ width: 1, color: COLORS.sprite });
  }

  private sampleTrails(scene: Scene): void {
    const live = new Set(scene.player.projectiles);
    for (const shot of this.trails.keys()) {
      if (!live.has(shot)) this.trails.delete(shot);
    }
    for (const shot of scene.player.projectiles) {
      if (!shot.isLive) continue;
      let trail = this.trails.get(shot);
      if (!trail) {
        trail = [];
        this.trails.set(shot, trail);
      }
      trail.push({ x: shot.x, y: shot.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    }
  }
}

function box(
  g: Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  color: number,
  alpha: number,
): void {
  g.rect(cx - hw, cy - hh, hw * 2, hh * 2).stroke({ width: 1, color, alpha });
}

function strokeProbe(
  g: Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  active: boolean,
): void {
  g.rect(cx - hw, cy - hh, hw * 2, hh * 2).stroke({
    width: 1,
    color: active ? COLORS.sensorActive : COLORS.sensor,
    alpha: active ? 0.95 : 0.45,
  });
}

function pursuitRadius(enemy: { get_ability: (name: string) => unknown }): number {
  const pursuit = enemy.get_ability("Pursuit") as { give_up_distance?: number } | undefined;
  return pursuit?.give_up_distance ?? 0;
}
