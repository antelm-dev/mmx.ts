export const PROJECT_MANIFEST = "project.json";
export const LEVELS_DIR = "levels";
export const ASSETS_DIR = "assets";
export const DATA_DIR = "data";
export const GAME_DIR = "game";
export const GAME_DATA_FILE = "data/game.json";
export const RENDERER_BINDINGS_FILE = "data/renderer-bindings.json";
export const VIRTUAL_PROJECT_MODULE = "virtual:mmx-project";
export const VIRTUAL_PROJECT_PREFIX = "\0virtual:mmx-project";
export const ASSET_PUBLIC_PREFIX = "/assets/";

export const PROJECT_WATCH_INPUTS = [
  PROJECT_MANIFEST,
  LEVELS_DIR,
  ASSETS_DIR,
  DATA_DIR,
  GAME_DIR,
] as const;
