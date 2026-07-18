import { Sprite, Texture } from "pixi.js";
import { BODY_HALF_H } from "../../core/constants.js";
import type { Player } from "../../engine/Player.js";
import type { GhostSource } from "../Trail.js";

/**
 * Where the player's sprite sits relative to his body, and how any sprite is
 * placed once a texture has been picked for it.
 *
 * Shared by the renderer and the afterimage trail: a ghost is a frozen copy of the
 * live sprite, so both have to resolve the anchor the same way or the trail drifts
 * out of register with the body that emitted it.
 */

// The sprite is placed at ONE fixed offset from the body and never re-anchored
// per frame — exactly like the original: in Player.tscn the (centered) animatedSprite
// node sits at position (0, -4) relative to the CharacterBody2D. Each pose is drawn
// relative to that origin, so jump/fall tuck the legs naturally instead of sliding.
export const SPRITE_OFFSET_X = 0;
export const SPRITE_OFFSET_Y = -4;

/**
 * The sprite as it stands right now, in draw-space coordinates.
 *
 * Anchored off the FEET, not pos.y: Actor.reduce_hitbox shrinks the dash hitbox from
 * the top, which slides the body center down 4px while the feet stay planted. In
 * Godot the sprite is a sibling of the CollisionShape2D so resizing it moved nothing;
 * here pos.y is the center, so anchoring to it would drop the whole sprite on dash.
 */
export function spriteSnapshot(player: Player): GhostSource | null {
  const region = player.currentRegion();
  if (!region) return null;
  return {
    x: player.pos.x + SPRITE_OFFSET_X,
    y: player.pos.y + player.hh - BODY_HALF_H + SPRITE_OFFSET_Y,
    region,
    facing: player.get_facing_direction(),
    layer: player.get_animation_layer(),
  };
}

/**
 * Point a pooled sprite at a texture and a world position.
 *
 * The centre is rounded to whole world pixels. The body's position is a float —
 * walk speed is 90px/s on a 60Hz tick, so 1.5px a frame — and drawing at x.5 would
 * resample the frame across two device-pixel columns, softening the sprite and
 * making its interior pixels visibly wobble as it moves. Rounding here rather than
 * in the engine keeps physics at full precision: only the picture is quantised.
 * Frame half-extents are integers, so the rounded centre keeps the sheet's own
 * pixel grid aligned to the screen's.
 *
 * Flipping is a negative scale about the sprite's centre anchor, which is the same
 * mirror the Canvas 2D path did with ctx.scale — and what Godot does with scale.x.
 */
export function place(
  sprite: Sprite,
  texture: Texture,
  cx: number,
  cy: number,
  facing: number,
  flipV = false,
): void {
  sprite.texture = texture;
  sprite.position.set(Math.round(cx), Math.round(cy));
  sprite.scale.set(facing, flipV ? -1 : 1);
  sprite.visible = true;
}
