import path from "node:path";
import {
  levelDocumentToLevelData,
  loadProjectSceneClips,
  requireProject,
  type LoadedProject,
} from "@mmx/build-tools";
import type { LevelData, SceneClips } from "@mmx/engine";
import type { CompiledGameData } from "@mmx/engine/data";

function projectArgument(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--project");
  return index >= 0 ? argv[index + 1] : undefined;
}

export function requireProjectDirectory(argv = process.argv.slice(2)): string {
  const value = projectArgument(argv) ?? process.env.MMX_PROJECT;
  if (!value) {
    throw new Error(
      "A Studio project export is required. Pass --project <dir> or set MMX_PROJECT.",
    );
  }
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), value);
}

export async function loadProjectLevels(projectDir: string): Promise<{
  project: LoadedProject;
  levels: LevelData[];
}> {
  const project = await requireProject(projectDir);
  return {
    project,
    levels: project.levels.map((entry) => levelDocumentToLevelData(entry.document)),
  };
}

export async function loadEntryLevel(projectDir: string): Promise<{
  level: LevelData;
  loadoutId?: string;
  gameData: CompiledGameData;
  clips?: SceneClips;
}> {
  const { project, levels } = await loadProjectLevels(projectDir);
  const index = project.levels.findIndex((entry) => entry.id === project.manifest.entryLevelId);
  const level = levels[index];
  if (!level) {
    throw new Error(`Entry level '${project.manifest.entryLevelId}' is missing.`);
  }
  return {
    level,
    loadoutId: project.manifest.player?.loadout,
    gameData: project.compiledGameData,
    clips: await loadProjectSceneClips(project),
  };
}
