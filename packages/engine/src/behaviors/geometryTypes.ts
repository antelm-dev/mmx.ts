/**
 * The renderer-neutral vocabulary for design-time debug geometry.
 *
 * Behaviour factories may expose a `debugGeometry` provider (Part 11 fills them
 * in); this module owns the *semantic* types those providers speak in. The
 * engine chooses roles and exact world-space geometry; it never chooses colours,
 * opacity, line width, fonts, or any other visual styling — that is Studio's job.
 */

export type DebugGeometryRole =
  | "body"
  | "hurtbox"
  | "contact-damage"
  | "vision"
  | "movement-path"
  | "movement-origin"
  | "camera-zone"
  | "trigger"
  | "influence"
  | "spawn-clearance";

export type DebugPrimitive =
  | {
      kind: "rect";
      role: DebugGeometryRole;
      x: number;
      y: number;
      width: number;
      height: number;
      label?: string;
    }
  | {
      kind: "line";
      role: DebugGeometryRole;
      from: { x: number; y: number };
      to: { x: number; y: number };
      label?: string;
    }
  | {
      kind: "arrow";
      role: DebugGeometryRole;
      from: { x: number; y: number };
      to: { x: number; y: number };
      label?: string;
    }
  | { kind: "point"; role: DebugGeometryRole; x: number; y: number; label?: string };

/**
 * Where a design-time instance sits, in world pixels, as a geometry provider
 * sees it. `facing` is +1/-1; symmetric geometry ignores it.
 */
export interface EntityTransform {
  x: number;
  y: number;
  facing: number;
  width?: number;
  height?: number;
}
