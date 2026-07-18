import { Container, Graphics } from "pixi.js";
import { TILE_SIZE } from "@mmx/engine/core/constants.js";
import type { Camera } from "@mmx/engine/engine/Camera.js";
import type { Projectile } from "@mmx/engine/engine/Projectile.js";
import type { Scene } from "@mmx/engine/engine/Scene.js";
import { Tile } from "@mmx/engine/engine/World.js";

/**
 * The geometry overlay: collision boxes, tile classification, ramp normals,
 * camera zones, enemy vision, projectile boxes and shot trajectories.
 *
 * This draws in *world* space, parented under the same scrolling container as the
 * sprites, so a box is registered against the thing it describes at the pixel
 * level. That is the whole point — an overlay drawn in screen space with the
 * camera applied by hand would accumulate its own rounding and be off by a pixel
 * exactly where a one-pixel collision bug lives.
 *
 * Everything is redrawn into one {@link Graphics} per frame rather than retained.
 * The shape set changes completely from frame to frame (shots spawn and die,
 * tiles scroll in and out), so diffing a retained graph would cost more than
 * rebuilding, and Pixi's Graphics batches the whole thing into a handful of draw
 * calls either way.
 */

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
  zone: 0xffd166,
  zoneActive: 0x66ffcc,
  grid: 0x1d2b36,
} as const;

/** How many past positions of a shot are kept for its trajectory. */
const TRAIL_LENGTH = 40;

export class DebugOverlay {
  readonly view = new Container();
  private readonly g = new Graphics();

  /**
   * Recent positions per live projectile.
   *
   * Keyed by the projectile object itself, so a shot's trail cannot be inherited
   * by whatever reuses its index in the array next frame — the projectile list is
   * compacted on death, so index identity is not stable and using it produces
   * trails that visibly jump between shots.
   */
  private readonly trails = new Map<Projectile, { x: number; y: number }[]>();

  constructor() {
    this.view.addChild(this.g);
    this.view.visible = false;
  }

  setVisible(visible: boolean): void {
    this.view.visible = visible;
    if (!visible) this.g.clear();
  }

  /**
   * Rebuild the overlay for this frame.
   *
   * Trajectories are sampled here rather than in the fixed step because they are
   * purely something to look at; sampling them per rendered frame means a paused
   * game shows the trail exactly as it stood, which is what you want when you
   * paused specifically to look at it.
   */
  update(scene: Scene, camera: Camera): void {
    this.sampleTrails(scene);
    if (!this.view.visible) return;

    const g = this.g;
    g.clear();

    this.drawTiles(g, scene, camera);
    this.drawCameraZones(g, camera);
    this.drawEnemies(g, scene);
    this.drawProjectiles(g, scene);
    this.drawPlayer(g, scene);
  }

  // ---------------------------------------------------------------------------

  /**
   * Tile grid and classification, limited to what the view can see.
   *
   * Culling matters here and nowhere else in this file: the level is 100x32
   * tiles, so drawing the whole grid is 3200 rectangles a frame to show the ~200
   * that are on screen. The other collections are bounded by gameplay and never
   * approach that.
   */
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

        // A ramp's collidable surface is the diagonal, not the tile box, so the
        // tile outline would be actively misleading here — draw the actual
        // surface the resolver places bodies on.
        const leftY = world.slopeSurfaceY(tx, ty, kind, px);
        const rightY = world.slopeSurfaceY(tx, ty, kind, px + TILE_SIZE);
        g.moveTo(px, leftY)
          .lineTo(px + TILE_SIZE, rightY)
          .stroke({ width: 1, color: COLORS.slope });

        // The outward normal, drawn from the ramp's midpoint: the surface tangent
        // rotated to point up and away from the filled half. Derived from the two
        // sampled ends rather than assumed to be 45 degrees, so a shallow ramp
        // reads as shallow here too.
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

  /** Camera zone rectangles; the one currently governing the view is highlighted. */
  private drawCameraZones(g: Graphics, camera: Camera): void {
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

      // Vision box — the region Stage re-tests every tick to set `target`. Filled
      // faintly when it currently holds the player, so "why did it not notice me"
      // is answerable by looking rather than by reasoning about the numbers.
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

      // Pursuit give-up radius, for the enemies that actually have one: a chase
      // that ends is far easier to read as a circle than as a distance check.
      const giveUp = pursuitRadius(enemy);
      if (giveUp > 0) {
        g.circle(enemy.pos.x, enemy.pos.y, giveUp).stroke({
          width: 1,
          color: COLORS.pursuit,
          alpha: 0.4,
        });
      }

      // Body box (what touch damage uses) and hurtbox (what shots use). They are
      // different rectangles, and confusing them is exactly the bug this shows.
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
    // The dash hitbox is a different size from the standing one, so colour the
    // box by which is in effect rather than making the reader compare heights.
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

    // Muzzle: where a shot would actually leave from, which moves with the pose.
    const muzzle = player.get_shot_position();
    g.circle(muzzle.x, muzzle.y, 1.5).stroke({ width: 1, color: COLORS.shot });

    // Velocity vector, scaled down to stay on screen at full dash speed.
    g.moveTo(player.pos.x, player.pos.y)
      .lineTo(player.pos.x + player.velocity.x * 0.06, player.pos.y + player.velocity.y * 0.06)
      .stroke({ width: 1, color: COLORS.normal, alpha: 0.8 });
  }

  /** Append this frame's position for each live shot, and drop dead shots' trails. */
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

  /** Drop per-run state; called when the scene is rebuilt. */
  reset(): void {
    this.trails.clear();
    this.g.clear();
  }
}

/** Axis-aligned box from a centre and half-extents — the engine's own convention. */
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

/**
 * The distance at which a chase is abandoned, or 0 for an enemy that has no
 * pursuit ability. Read off the ability rather than hard-coded, so a retuned
 * constant shows up here without anyone remembering to update the overlay.
 */
function pursuitRadius(enemy: { get_ability: (name: string) => unknown }): number {
  const pursuit = enemy.get_ability("Pursuit") as { give_up_distance?: number } | undefined;
  return pursuit?.give_up_distance ?? 0;
}
