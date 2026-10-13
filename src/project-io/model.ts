import type { LevelDocument } from "@mmx/content-schema";
import type { GameDataOverlay } from "@mmx/engine/data";
import type { ProjectDocument } from "@mmx/project-schema";

export type ProjectLevel = {
  id: string;
  path: string;
  document: LevelDocument;
};

export type StudioProject = {
  root: string;
  manifest: ProjectDocument;
  levels: ProjectLevel[];
  /** `data/game.json`: records merged over the engine's game data; absent when the file is. */
  gameData?: GameDataOverlay;
};

export type ProjectPayload = {
  rootPath: string;
  project: StudioProject;
};

export type ProjectIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
};

export type ProjectResult<T> =
  | { ok: true; value: T; issues: ProjectIssue[] }
  | { ok: false; issues: ProjectIssue[] };

export function issue(
  code: string,
  message: string,
  path: string,
  severity: ProjectIssue["severity"] = "error",
): ProjectIssue {
  return { severity, code, message, path };
}

export function fail<T>(issues: ProjectIssue[]): ProjectResult<T> {
  return { ok: false, issues };
}

export function succeed<T>(value: T, issues: ProjectIssue[] = []): ProjectResult<T> {
  return { ok: true, value, issues };
}
