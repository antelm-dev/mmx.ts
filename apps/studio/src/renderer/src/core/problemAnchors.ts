import type { LevelDocument, Severity } from "@mmx/content-schema";
import type { PositionedIssue } from "@mmx/editor-runtime/adapters";
import { decorationBounds } from "@mmx/renderer-pixi";
import { boxOf } from "./EditorViewportGeometry.js";

/** What a validation problem points at, and the world point its canvas badge sits on. */
export type ProblemTarget = { x: number; y: number } & (
  | { kind: "object" | "decoration" | "tileLayer" | "imageLayer"; id: string }
  | { kind: "position" }
);

/** One canvas badge: every problem about the same target, at the highest severity. */
export interface ProblemAnchor {
  key: string;
  target: ProblemTarget;
  severity: Severity;
  issues: PositionedIssue[];
}

/**
 * The element an issue's `objectId` names (object, decoration, tile or image layer) with the
 * badge point at its top-right corner, else the engine diagnostic's `position`; none for an
 * unanchored issue (`spawn.count`, `grid.size`) or a non-finite point.
 */
export function problemTarget(
  doc: LevelDocument,
  issue: Pick<PositionedIssue, "objectId" | "position">,
): ProblemTarget | undefined {
  const target = findTarget(doc, issue);
  return target && Number.isFinite(target.x) && Number.isFinite(target.y) ? target : undefined;
}

function findTarget(
  doc: LevelDocument,
  { objectId: id, position }: Pick<PositionedIssue, "objectId" | "position">,
): ProblemTarget | undefined {
  if (id !== undefined) {
    const inst = doc.objects.find((o) => o.id === id);
    if (inst) {
      const box = boxOf(inst);
      return { kind: "object", id, x: box.x + box.w, y: box.y };
    }
    const deco = doc.decorations.find((d) => d.id === id);
    if (deco) {
      const box = decorationBounds(deco);
      return { kind: "decoration", id, x: box ? box.x + box.w : deco.x, y: box ? box.y : deco.y };
    }
    // A tile layer covers the level; an image layer's size needs its loaded image, so its origin.
    if (Array.isArray(doc.tileLayers) && doc.tileLayers.some((l) => l?.id === id))
      return { kind: "tileLayer", id, x: doc.cols * doc.gridSize, y: 0 };
    const image = Array.isArray(doc.imageLayers)
      ? doc.imageLayers.find((l) => l?.id === id)
      : undefined;
    if (image) return { kind: "imageLayer", id, x: image.x, y: image.y };
  }
  return position && { kind: "position", ...position };
}

/** Group the anchored issues into one badge per target, the error severity winning. */
export function problemAnchors(
  doc: LevelDocument,
  issues: readonly PositionedIssue[],
): ProblemAnchor[] {
  const anchors = new Map<string, ProblemAnchor>();
  for (const issue of issues) {
    const target = problemTarget(doc, issue);
    if (!target) continue;
    const key =
      target.kind === "position"
        ? `position:${target.x},${target.y}`
        : `${target.kind}:${target.id}`;
    const anchor = anchors.get(key);
    if (!anchor) anchors.set(key, { key, target, severity: issue.severity, issues: [issue] });
    else {
      anchor.issues.push(issue);
      if (issue.severity === "error") anchor.severity = "error";
    }
  }
  return [...anchors.values()];
}
