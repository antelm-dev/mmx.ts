import { Container, Graphics } from "pixi.js";
import { TILE_SIZE } from "../../core/constants.js";
import { Tile, World } from "../../engine/World.js";

/**
 * The level's backdrop and collision geometry, built once.
 *
 * The Canvas 2D renderer re-walked the visible tile band every frame and culled to
 * it, because each tile cost a fill call whether or not the picture had changed.
 * None of this geometry ever moves, so on the GPU it is uploaded once as two
 * meshes and thereafter costs a transform — the camera scrolls the container, not
 * the tiles. That makes the culling not just unnecessary but counterproductive:
 * rebuilding a Graphics to match the view would re-tessellate and re-upload every
 * frame to save drawing a few thousand already-resident triangles.
 *
 * Style: near-black backdrop, with collision geometry drawn as dark blocks whose
 * *exposed* faces are outlined in a bright edge colour — so what the physics
 * treats as solid is exactly what reads as solid.
 */

export const COLOR_BG = 0x050a16;
const COLOR_TILE_FILL = 0x080d1c;
export const COLOR_TILE_EDGE = 0xe8eefc;

type Side = "top" | "bottom" | "left" | "right";

const SIDES: Side[] = ["top", "bottom", "left", "right"];

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

const NEIGHBOUR: Record<Side, [number, number]> = {
  top: [0, -1],
  bottom: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/**
 * Does the tile at this position fill the whole of one of its sides? Used to
 * hide the seam between touching geometry: a ramp's vertical edge is a full
 * face only where its profile reaches the top of the tile, which for the
 * shallow ramps built from a run of tiles is just the last one in the run.
 */
function coversSide(world: World, tx: number, ty: number, side: Side): boolean {
  const kind = world.tileAt(tx, ty);
  if (kind === Tile.Solid) return true;
  if (kind !== Tile.SlopeUpRight && kind !== Tile.SlopeUpLeft) return false;

  const { l, r } = world.slopeProfile(tx, ty, kind);
  switch (side) {
    case "left":
      return l >= TILE_SIZE;
    case "right":
      return r >= TILE_SIZE;
    case "bottom":
      return l > 0 || r > 0;
    default:
      return false; // the top is the ramp surface, never a full face
  }
}

/** Add one tile's solid area — a full square, or the wedge under a ramp. */
function fillTile(g: Graphics, world: World, kind: Tile, tx: number, ty: number): void {
  const x = tx * TILE_SIZE;
  const y = ty * TILE_SIZE;
  const x1 = x + TILE_SIZE;
  const y1 = y + TILE_SIZE;
  if (kind === Tile.Solid) {
    g.rect(x, y, TILE_SIZE, TILE_SIZE);
    return;
  }
  // A trapezoid rather than a triangle: a shallow ramp's tiles are cut at both
  // edges, and only the 45-degree case degenerates to a corner-to-corner wedge.
  const { l, r } = world.slopeProfile(tx, ty, kind);
  g.poly([x, y1, x1, y1, x1, y1 - r, x, y1 - l]);
}

/**
 * Trace the face of a tile on the given side.
 *
 * Inset by half a pixel so the 1px stroke covers the tile's outermost pixel row
 * instead of straddling the boundary — on the boundary itself it would land on
 * half a device pixel and blur.
 */
function traceSide(g: Graphics, side: Side, x: number, y: number): void {
  const x1 = x + TILE_SIZE;
  const y1 = y + TILE_SIZE;
  switch (side) {
    case "top":
      g.moveTo(x, y + 0.5).lineTo(x1, y + 0.5);
      break;
    case "bottom":
      g.moveTo(x, y1 - 0.5).lineTo(x1, y1 - 0.5);
      break;
    case "left":
      g.moveTo(x + 0.5, y).lineTo(x + 0.5, y1);
      break;
    default:
      g.moveTo(x1 - 0.5, y).lineTo(x1 - 0.5, y1);
  }
}

/** Trace the faces of this tile that are open to air, so worth outlining. */
function traceExposedEdges(g: Graphics, world: World, kind: Tile, tx: number, ty: number): void {
  const x = tx * TILE_SIZE;
  const y = ty * TILE_SIZE;

  // A ramp's surface is always exposed — nothing sits flush against it.
  if (kind === Tile.SlopeUpRight || kind === Tile.SlopeUpLeft) {
    const { l, r } = world.slopeProfile(tx, ty, kind);
    const y1 = y + TILE_SIZE;
    g.moveTo(x, y1 - l).lineTo(x + TILE_SIZE, y1 - r);
  }

  for (const side of SIDES) {
    if (!coversSide(world, tx, ty, side)) continue;
    const [dx, dy] = NEIGHBOUR[side];
    if (coversSide(world, tx + dx, ty + dy, OPPOSITE[side])) continue;
    traceSide(g, side, x, y);
  }
}

/** Fills the collision geometry, then strokes only the faces open to air. */
function buildTiles(world: World): Graphics {
  const g = new Graphics();

  for (let ty = 0; ty < world.rows; ty++) {
    for (let tx = 0; tx < world.cols; tx++) {
      const kind = world.tileAt(tx, ty);
      if (kind === Tile.Empty) continue;
      fillTile(g, world, kind, tx, ty);
    }
  }
  g.fill(COLOR_TILE_FILL);

  for (let ty = 0; ty < world.rows; ty++) {
    for (let tx = 0; tx < world.cols; tx++) {
      const kind = world.tileAt(tx, ty);
      if (kind === Tile.Empty) continue;
      traceExposedEdges(g, world, kind, tx, ty);
    }
  }
  return g.stroke({ width: 1, color: COLOR_TILE_EDGE, alignment: 0.5 });
}

export function buildTerrain(world: World): Container {
  const view = new Container();
  view.addChild(buildTiles(world));
  return view;
}
