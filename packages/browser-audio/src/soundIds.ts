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
