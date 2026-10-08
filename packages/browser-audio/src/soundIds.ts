export type SoundId =
  | "jump"
  | "land"
  | "dash"
  | "wallslide"
  | "damage"
  | "charge"
  | "lemon"
  | "mediumShot"
  | "chargedShot"
  | "darkArrow"
  | "enemyHit"
  | "shieldHit"
  | "guardBreak"
  | "enemyDeath"
  | "playerDeath"
  | "heal"
  | "introAppear"
  | "introThunder";

export type SoundName = SoundId;

/**
 * Sounds the runtime plays only when the project binds them. They are never
 * required by the build (a project without them compiles and stays silent at
 * that moment), so a new character's sounds do not break existing projects.
 * `slash`: Zero's saber swing. A saber impact needs no id of its own: it goes
 * through the enemy's damage/shield signals like a shot (`enemyHit`, `shieldHit`).
 */
export const OPTIONAL_GAMEPLAY_SOUND_IDS = ["slash"] as const;

/**
 * Runtime id of the level background music (`bindings.music.stage` in
 * game/data.json). Optional: an unbound project plays no music.
 */
export const STAGE_MUSIC_ID = "musicStage";

export const GAMEPLAY_SOUND_IDS = [
  "jump",
  "land",
  "dash",
  "wallslide",
  "damage",
  "charge",
  "lemon",
  "mediumShot",
  "chargedShot",
  "darkArrow",
  "enemyHit",
  "shieldHit",
  "guardBreak",
  "enemyDeath",
  "playerDeath",
  "heal",
  "introAppear",
  "introThunder",
] as const satisfies readonly SoundId[];
