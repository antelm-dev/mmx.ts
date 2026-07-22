import type { LevelDocument, LevelObjectInstance } from "./types.js";

/**
 * A command-based, fully reversible mutation log.
 *
 * Every document change goes through one {@link EditorCommand} so that undo/redo
 * is uniform and a grouped gesture (a drag that fired a hundred pointer events)
 * collapses to a single history entry — the command carries the net delta, not
 * the path. Commands are pure functions of the document, which is what lets them
 * be unit-tested headlessly and keeps the editor's saved document the single
 * source of truth (temporary UI state lives elsewhere; see the editor app).
 */
export interface EditorCommand {
  label: string;
  execute(document: LevelDocument): LevelDocument;
  undo(document: LevelDocument): LevelDocument;
}

type TransformKey = "x" | "y" | "width" | "height" | "rotation";
export type Transform = Partial<Record<TransformKey, number>>;

function mapObjects(
  doc: LevelDocument,
  fn: (o: LevelObjectInstance) => LevelObjectInstance,
): LevelDocument {
  return { ...doc, objects: doc.objects.map(fn) };
}

function withOverride(o: LevelObjectInstance, key: string, value: unknown): LevelObjectInstance {
  const overrides = { ...o.overrides };
  if (value === undefined) delete overrides[key];
  else overrides[key] = value;
  const next: LevelObjectInstance = { ...o };
  if (Object.keys(overrides).length > 0) next.overrides = overrides;
  else delete next.overrides;
  return next;
}

/** Move a set of objects by a net delta. One entry per drag, not per pointer move. */
export function moveObjects(ids: readonly string[], dx: number, dy: number): EditorCommand {
  const set = new Set(ids);
  const shift =
    (sx: number, sy: number) =>
    (doc: LevelDocument): LevelDocument =>
      mapObjects(doc, (o) => (set.has(o.id) ? { ...o, x: o.x + sx, y: o.y + sy } : o));
  return { label: "Move", execute: shift(dx, dy), undo: shift(-dx, -dy) };
}

/** Apply a transform patch (resize/move/rotate) to one object, reversibly. */
export function setTransform(id: string, before: Transform, after: Transform): EditorCommand {
  const apply =
    (patch: Transform) =>
    (doc: LevelDocument): LevelDocument =>
      mapObjects(doc, (o) => (o.id === id ? { ...o, ...patch } : o));
  return { label: "Resize", execute: apply(after), undo: apply(before) };
}

/** Set one editable property (transform or override) on one object. */
export function setProperty(
  id: string,
  key: string,
  scope: "transform" | "override",
  before: unknown,
  after: unknown,
): EditorCommand {
  const apply =
    (value: unknown) =>
    (doc: LevelDocument): LevelDocument =>
      mapObjects(doc, (o) => {
        if (o.id !== id) return o;
        if (scope === "transform") {
          const next: LevelObjectInstance = { ...o };
          (next as unknown as Record<string, unknown>)[key] = value;
          return next;
        }
        return withOverride(o, key, value);
      });
  return { label: `Set ${key}`, execute: apply(after), undo: apply(before) };
}

/** Add one or more freshly built instances (also used for paste/duplicate). */
export function addObjects(
  instances: readonly LevelObjectInstance[],
  label = "Add",
): EditorCommand {
  const ids = new Set(instances.map((i) => i.id));
  return {
    label,
    execute: (doc) => ({ ...doc, objects: [...doc.objects, ...instances] }),
    undo: (doc) => ({ ...doc, objects: doc.objects.filter((o) => !ids.has(o.id)) }),
  };
}

/**
 * Delete objects, capturing their original positions so undo restores order.
 * Takes the document at creation time so the removed instances are recoverable.
 */
export function deleteObjects(doc: LevelDocument, ids: readonly string[]): EditorCommand {
  const idSet = new Set(ids);
  const removed = doc.objects.map((o, index) => ({ o, index })).filter((e) => idSet.has(e.o.id));
  return {
    label: removed.length > 1 ? "Delete objects" : "Delete",
    execute: (d) => ({ ...d, objects: d.objects.filter((o) => !idSet.has(o.id)) }),
    undo: (d) => {
      const objects = [...d.objects];
      for (const { o, index } of removed) objects.splice(Math.min(index, objects.length), 0, o);
      return { ...d, objects };
    },
  };
}

/** Undo/redo stacks over a live document. */
export class History {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];

  constructor(private doc: LevelDocument) {}

  get document(): LevelDocument {
    return this.doc;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Label of the command undo would reverse, for the toolbar tooltip. */
  get undoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.label;
  }

  execute(command: EditorCommand): LevelDocument {
    this.doc = command.execute(this.doc);
    this.undoStack.push(command);
    this.redoStack.length = 0;
    return this.doc;
  }

  undo(): LevelDocument | null {
    const command = this.undoStack.pop();
    if (!command) return null;
    this.doc = command.undo(this.doc);
    this.redoStack.push(command);
    return this.doc;
  }

  redo(): LevelDocument | null {
    const command = this.redoStack.pop();
    if (!command) return null;
    this.doc = command.execute(this.doc);
    this.undoStack.push(command);
    return this.doc;
  }

  /** Replace the document and clear history — used when opening a new level. */
  reset(doc: LevelDocument): void {
    this.doc = doc;
    this.undoStack = [];
    this.redoStack = [];
  }
}
