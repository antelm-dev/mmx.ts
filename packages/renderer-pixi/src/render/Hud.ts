import { Container, NineSliceSprite, Sprite } from "pixi.js";
import { DT } from "@mmx/engine/core/constants.js";
import type { Camera } from "@mmx/engine/engine/Camera.js";
import type { Player } from "@mmx/engine/engine/Player.js";
import { regionTexture } from "./textures.js";

/**
 * X's life bar, ported from Hud.tscn's "X Bar" node.
 *
 * Two pieces of the original's own art rather than an approximation of it: the
 * frame (X_bar.png, with the pilot's initial baked into the bottom cap) drawn as a
 * NinePatchRect, and the energy column (hp_fill.png) drawn as a bottom-filling
 * TextureProgressBar. Both map onto Pixi directly — NinePatchRect is a
 * NineSliceSprite with the same margins, and a bottom-to-top progress fill is the
 * bottom N rows of the fill texture — so the bar is pixel-identical to the source
 * instead of being redrawn as vector geometry that merely resembles it.
 */

// X Bar node: offset_left 8, width 14 (Hud.tscn).
const X = 8;
const BAR_W = 14;

// patch_margin_top / patch_margin_bottom. The 1px band between them is what
// stretches, so both caps stay pixel-exact at any bar height.
const CAP_TOP = 4;
const CAP_BOTTOM = 17;

// The textureProgress child: offset_left 4, offset_right 10, and bottom-anchored
// from -80 to -17. Its 63px height is hp_fill.png's height, so the fill is 1:1 with
// its texture and the segment ticks land on the source's own pixel rows.
const FILL_X = 4;
const FILL_W = 6;
const FILL_H = 63;

// TextureProgressBar max_value. Fixed at 32 regardless of the actor's max_health —
// it is the bar's *pixel* scale, and the frame grows to match (see barMetrics).
const HP_SCALE = 32;

/** Color.DEEP_SKY_BLUE, shown by HUD.gd while health is over the maximum. */
const TINT_OVERHEAL = 0x00bfff;
const TINT_NORMAL = 0xffffff;

// BarFader.gd: the bar dims almost instantly when X walks in behind it and eases
// back up once he is clear, so it never hides him in the corner.
const FADE_MIN = 0.1;
const FADE_OUT_SECONDS = 0.1;
const FADE_IN_SECONDS = 0.6;
const NEAR_X = 36;
const NEAR_Y = 10;

/**
 * HUD.gd:process_player_bar_size — the frame grows upward out of its fixed bottom
 * cap as max health goes up, two pixels per unit, anchored so 16 health is the
 * 52px bar authored in the scene.
 */
function barMetrics(maxHealth: number): { y: number; h: number } {
  const growth = (maxHealth - 16) * 2;
  return { y: 56 - growth, h: 52 + growth };
}

export class Hud {
  readonly view = new Container();
  private readonly frame: NineSliceSprite;
  private readonly fill = new Sprite();

  private lastFilled = -1;
  private lastMaxHealth = -1;

  constructor() {
    this.frame = new NineSliceSprite({
      texture: regionTexture("x_bar.png", [0, 0, BAR_W, 22])!,
      leftWidth: 0,
      rightWidth: 0,
      topHeight: CAP_TOP,
      bottomHeight: CAP_BOTTOM,
      width: BAR_W,
    });
    this.frame.x = X;
    this.fill.x = X + FILL_X;

    // The fill sits inside the frame's hollow middle, so it draws over it.
    this.view.addChild(this.frame, this.fill);
  }

  update(player: Player, camera: Camera): void {
    this.syncFrame(player.max_health);
    this.syncFill(player.current_health, player.max_health);
    this.syncFade(player, camera);
  }

  private syncFrame(maxHealth: number): void {
    if (maxHealth === this.lastMaxHealth) return;
    this.lastMaxHealth = maxHealth;

    const { y, h } = barMetrics(maxHealth);
    this.frame.y = y;
    this.frame.height = h;
  }

  private syncFill(health: number, maxHealth: number): void {
    const clamped = Math.max(0, Math.min(health, maxHealth));
    // Floored, not rounded: the frame's inner span is 2px per health unit but the
    // fill is 63/32, so rounding a half-pixel up spills the top segment over the
    // cap on any odd max_health (16 gives 31.5px of fill in a 31px span).
    const filled = Math.floor((clamped / HP_SCALE) * FILL_H);
    this.fill.tint = health > maxHealth ? TINT_OVERHEAL : TINT_NORMAL;

    if (filled === this.lastFilled) return;
    this.lastFilled = filled;

    this.fill.visible = filled > 0;
    if (filled <= 0) return;

    // Bottom-to-top fill: the bottom `filled` rows of the texture, pinned to the
    // inside of the bottom cap. Cropping from the bottom rather than scaling keeps
    // the source's segment ticks fixed to the column instead of sliding with health.
    const { y, h } = barMetrics(this.lastMaxHealth);
    this.fill.texture = regionTexture("hp_fill.png", [0, FILL_H - filled, FILL_W, filled])!;
    this.fill.y = y + h - CAP_BOTTOM - filled;
  }

  /**
   * BarFader.gd drives this off the *screen* position of the player: the bar lives
   * in the top-left corner, so "near" is the top-left corner of the view, measured
   * against the camera rather than the world.
   */
  private syncFade(player: Player, camera: Camera): void {
    const near = player.pos.x < camera.x + NEAR_X && player.pos.y < camera.centerY + NEAR_Y;

    // Asymmetric on purpose: getting out of the way is near-instant, coming back
    // is a slow ease, so a brush past the corner does not flash the bar.
    const target = near ? FADE_MIN : 1;
    const seconds = near ? FADE_OUT_SECONDS : FADE_IN_SECONDS;
    const step = ((1 - FADE_MIN) / seconds) * DT;

    this.view.alpha =
      this.view.alpha < target
        ? Math.min(target, this.view.alpha + step)
        : Math.max(target, this.view.alpha - step);
  }
}
