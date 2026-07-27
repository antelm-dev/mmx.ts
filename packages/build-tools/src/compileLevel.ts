import { migrateDocument } from "@mmx/content-schema";
import {
  effectiveValue,
  getDefinition,
  instanceSize,
  requireDefinition,
} from "@mmx/content-schema";
import type { LevelDocument, LevelObjectInstance } from "@mmx/content-schema";
import type { LevelData, LevelEntity } from "@mmx/engine";
import { ProjectBuildError } from "./errors.js";
import { resolveProjectPath } from "./paths.js";

function objectToEntity(inst: LevelObjectInstance): LevelEntity {
  const def = requireDefinition(inst.definitionId);
  const size = instanceSize(inst);
  const fields: Record<string, unknown> = { ...def.fields, ...inst.overrides };
  for (const prop of def.properties) {
    if (fields[prop.key] === undefined && prop.default !== undefined) {
      fields[prop.key] = prop.default;
    }
  }
  for (const prop of def.properties) {
    fields[prop.key] = effectiveValue(inst, prop.key);
  }
  return {
    id: def.engineId,
    iid: inst.id,
    x: inst.x,
    y: inst.y,
    w: size.width,
    h: size.height,
    fields,
  };
}

export function levelDocumentToLevelData(document: LevelDocument): LevelData {
  const entities = document.objects.map(objectToEntity);
  return {
    identifier: document.id,
    gridSize: document.gridSize,
    cols: document.cols,
    rows: document.rows,
    tiles: document.tiles.slice(),
    slopes: document.slopes ? { ...document.slopes } : undefined,
    entities,
  };
}

export function validateLevelObjects(document: LevelDocument): void {
  for (const inst of document.objects) {
    if (!getDefinition(inst.definitionId)) {
      throw new ProjectBuildError(
        "level.unknown_definition",
        `Level '${document.id}' references unknown definition '${inst.definitionId}'.`,
      );
    }
  }
}

export async function readLevelDocument(
  root: string,
  relativePath: string,
  readText: (absolutePath: string) => Promise<string>,
): Promise<LevelDocument> {
  const absolute = resolveProjectPath(root, relativePath);
  const raw = JSON.parse(await readText(absolute)) as unknown;
  const document = migrateDocument(raw);
  validateLevelObjects(document);
  return document;
}
