import { BODY_HALF_H, DASH_FX_OFFSET_X, DASH_FX_OFFSET_Y } from "@mmx/engine";
import type { Player } from "@mmx/engine";
import { DASH_TRAIL, WALLSLIDE_TRAIL, type TrailStyle } from "../Trail.js";

export function dashSmokeOrigin(
  player: { pos: { x: number; y: number }; hh: number },
  dir: number,
): { x: number; y: number } {
  return {
    x: player.pos.x + DASH_FX_OFFSET_X * dir,
    y: player.pos.y + player.hh - BODY_HALF_H + DASH_FX_OFFSET_Y,
  };
}

export function selectTrailStyle(player: Player): TrailStyle | null {
  if (player.is_executing_either(["Dash", "AirDash"])) return DASH_TRAIL;
  if (player.is_executing("WallSlide")) return WALLSLIDE_TRAIL;
  return null;
}
