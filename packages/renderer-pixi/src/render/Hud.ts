import { Container, NineSliceSprite, Sprite } from "pixi.js";
import {
  DT,
  SUB_WEAPON_MAX_AMMO,
  WEAPON_PALETTE,
  type WeaponId,
} from "@mmx/engine/core/constants.js";
import type { Camera } from "@mmx/engine/game/Camera.js";
import type { Player } from "@mmx/engine/game/Player.js";
import { regionTexture } from "./textures.js";

/**
 * X's life bar and the weapon-select ammo bar beside it, ported from Hud.tscn's
 * "X Bar" node and its "WeaponBar" child.
 *
 * Two pieces of the original's own art rather than an approximation of it: the
 * frame (X_bar.png / Weapon_bar.png, with the pilot's initial baked into the
 * bottom cap) drawn as a NinePatchRect, and the energy column (hp_fill.png —
 * the *same* fill texture WeaponBar.gd reuses for ammo) drawn as a
 * bottom-filling TextureProgressBar. Both map onto Pixi directly —
 * NinePatchRect is a NineSliceSprite with the same margins, and a bottom-to-top
 * progress fill is the bottom N rows of the fill texture — so the bar is
 * pixel-identical to the source instead of being redrawn as vector geometry
 * that merely resembles it. {@link EnergyBar} is that one shared shape; `Hud`
 * places two of them.
 */

// X Bar node: offset_left 8, width 14 (Hud.tscn).
const X = 8;
const BAR_W = 14;

// WeaponBar node: offset_left 15 relative to X Bar's own origin (Hud.tscn),
// i.e. immediately to the right of the 14px-wide life bar with a 1px gap.
const WEAPON_BAR_X = X + BAR_W + 1;

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

// TextureProgressBar max_value. Fixed regardless of the actor's actual max —
// it is the bar's *pixel* scale, and the frame grows to match (see barMetrics).
// The life bar's scale is X's own max_health (32); the weapon bar's is the
// sub-weapon ammo tank size (28) — both authored against the same formula,
// which is how WeaponBar.gd's static 76px-tall frame was arrived at (see
// barMetrics(28) below).
const HP_SCALE = 32;

/** Color.DEEP_SKY_BLUE, shown by HUD.gd while health is over the maximum. */
const TINT_OVERHEAL = 0x00bfff;
const TINT_NORMAL = 0xffffff;

/**
 * WeaponIcon node: offset_left 17 relative to X Bar's own origin (absolute
 * X + 17), bottom-anchored at offset_top -14 — a 16x16 icon that overlaps the
 * foot of both bars, identifying which weapon the ammo bar beside it belongs
 * to. Every `selectable_weapon_XX.png` crops the same (3,3,10,10) rect; only
 * the sheet differs per weapon, and only one weapon is ported so far.
 */
const ICON_X = X + 17;
const ICON_BOTTOM_OFFSET = -14;
const ICON_CROP: readonly [number, number, number, number] = [3, 3, 10, 10];
const WEAPON_ICON_SHEETS: Readonly<Partial<Record<WeaponId, string>>> = {
  dark_arrow: "weapon_icon_dark_arrow.png",
};

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
 * 52px bar authored in the scene. WeaponBar.gd never resizes its own frame, but
 * its static 76px height is exactly this formula at max=28 (a 24px growth over
 * the 52px baseline) — the same asset math, just never re-run at runtime since
 * the sub-weapon ammo scale never changes the way max_health can.
 */
function barMetrics(max: number): { y: number; h: number } {
  const growth = (max - 16) * 2;
  return { y: 56 - growth, h: 52 + growth };
}

interface EnergyBarOptions {
  x: number;
  frameSheet: string;
}

/**
 * One NinePatchRect frame plus a bottom-filling energy column — the shape
 * shared by X's life bar and the weapon ammo bar beside it. Everything here
 * is generic over "how full, out of how much, what colour"; `Hud` supplies
 * the actual health or ammo values.
 */
class EnergyBar {
  readonly view = new Container();
  private readonly frame: NineSliceSprite;
  private readonly fill = new Sprite();

  private lastFilled = -1;
  private lastMax = -1;

  constructor(options: EnergyBarOptions) {
    this.frame = new NineSliceSprite({
      texture: regionTexture(options.frameSheet, [0, 0, BAR_W, 22])!,
      leftWidth: 0,
      rightWidth: 0,
      topHeight: CAP_TOP,
      bottomHeight: CAP_BOTTOM,
      width: BAR_W,
    });
    this.frame.x = options.x;
    this.fill.x = options.x + FILL_X;

    // The fill sits inside the frame's hollow middle, so it draws over it.
    this.view.addChild(this.frame, this.fill);
  }

  sync(value: number, max: number, tint: number): void {
    this.syncFrame(max);
    this.syncFill(value, max, tint);
  }

  private syncFrame(max: number): void {
    if (max === this.lastMax) return;
    this.lastMax = max;

    const { y, h } = barMetrics(max);
    this.frame.y = y;
    this.frame.height = h;
  }

  private syncFill(value: number, max: number, tint: number): void {
    const clamped = Math.max(0, Math.min(value, max));
    // Floored, not rounded: the frame's inner span is 2px per unit but the
    // fill is 63/32, so rounding a half-pixel up spills the top segment over
    // the cap on any odd max (16 gives 31.5px of fill in a 31px span).
    const filled = Math.floor((clamped / HP_SCALE) * FILL_H);
    this.fill.tint = tint;

    if (filled === this.lastFilled) return;
    this.lastFilled = filled;

    this.fill.visible = filled > 0;
    if (filled <= 0) return;

    // Bottom-to-top fill: the bottom `filled` rows of the texture, pinned to the
    // inside of the bottom cap. Cropping from the bottom rather than scaling keeps
    // the source's segment ticks fixed to the column instead of sliding with health.
    const { y, h } = barMetrics(this.lastMax);
    this.fill.texture = regionTexture("hp_fill.png", [0, FILL_H - filled, FILL_W, filled])!;
    this.fill.y = y + h - CAP_BOTTOM - filled;
  }
}

export class Hud {
  readonly view = new Container();
  private readonly xBar: EnergyBar;
  private readonly weaponBar: EnergyBar;
  private readonly weaponIcon = new Sprite();

  constructor() {
    this.xBar = new EnergyBar({ x: X, frameSheet: "x_bar.png" });
    this.weaponBar = new EnergyBar({ x: WEAPON_BAR_X, frameSheet: "weapon_bar.png" });
    // barMetrics' bottom edge (y + h) is 108 regardless of max — the frame
    // grows upward out of a fixed bottom cap — so the icon's y is fixed too.
    this.weaponIcon.x = ICON_X;
    this.weaponIcon.y = 108 + ICON_BOTTOM_OFFSET;
    this.view.addChild(this.xBar.view, this.weaponBar.view, this.weaponIcon);
  }

  update(player: Player, camera: Camera): void {
    this.xBar.sync(
      player.current_health,
      player.max_health,
      player.current_health > player.max_health ? TINT_OVERHEAL : TINT_NORMAL,
    );
    this.syncWeaponBar(player);
    this.syncFade(player, camera);
  }

  /**
   * WeaponBar.gd:is_exception — hidden outright for the buster, which has no
   * ammo to show. Tinted from the weapon's own palette (MainColor2, the same
   * "charge color" Weapon.gd:get_charge_color reports) rather than through a
   * full palette-swap shader on the bar itself. The icon hides the same way
   * (WeaponBar.gd's hide()/show() toggle both), and also whenever the active
   * weapon has no icon sheet ported yet.
   */
  private syncWeaponBar(player: Player): void {
    const weapon = player.activeWeapon;
    const visible = weapon !== "buster";
    this.weaponBar.view.visible = visible;
    if (!visible) {
      this.weaponIcon.visible = false;
      return;
    }

    const tint = WEAPON_PALETTE[weapon][1];
    this.weaponBar.sync(player.getWeaponAmmo(weapon), SUB_WEAPON_MAX_AMMO, tint);

    const iconSheet = WEAPON_ICON_SHEETS[weapon];
    const texture = iconSheet && regionTexture(iconSheet, ICON_CROP);
    this.weaponIcon.visible = !!texture;
    if (texture) this.weaponIcon.texture = texture;
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
