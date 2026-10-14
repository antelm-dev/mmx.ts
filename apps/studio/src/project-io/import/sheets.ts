// Zero × MMX design sheets (authored data, not game data), moved from zero-x-mashup game/sheets/.

/** Zero's moves: streamed animation index in MMZ1 and which of its scripts (zero_moves.json). */
export const ZERO_MOVES: { move: string; anim: number; script: number }[] = [
  { move: "idle", anim: 0, script: 0 },
  { move: "run", anim: 2, script: 0 },
  { move: "dash", anim: 3, script: 0 },
  { move: "dash_end", anim: 3, script: 1 },
  { move: "jump", anim: 4, script: 0 },
  { move: "fall", anim: 4, script: 1 },
  { move: "land", anim: 4, script: 2 },
  { move: "slash_1", anim: 8, script: 0 },
  { move: "slash_2", anim: 10, script: 0 },
  { move: "slash_3", anim: 11, script: 0 },
  { move: "dash_slash", anim: 14, script: 0 },
  { move: "jump_slash", anim: 16, script: 0 },
  { move: "hurt", anim: 49, script: 0 },
  { move: "wall_slide", anim: 5, script: 0 },
  { move: "wall_jump", anim: 6, script: 0 },
  { move: "wall_dash_jump", anim: 6, script: 1 },
  { move: "wall_slash", anim: 17, script: 0 },
];

/**
 * MMZ1 sounds (sounds.json): `sfx` = wav entry index in RZZC/romPC/Zero1SE.arc per role, `music` = Ogg
 * file under nativePCx64/sound/bgm/wav. Roles were matched by ear against a recording of the real game
 * and are not all verified (wall_kick is a likely guess).
 */
export const ZERO_SOUNDS = {
  music: "zero1_bgm/zero1_bgm005.sngw",
  sfx: { slash: 16, dash: 19, land: 13, buster_shot: 17, enemy_shot: 71, hurt: 21, wall_kick: 19 } as Record<string, number>,
};

/**
 * Pantheon Hunter spawns on the Intro Highway, [x, y] in level px (enemies.json `spawns`, placed by eye in
 * zero-x-mashup; not MMX1 data). They drop onto the road (y 384) when the level starts.
 */
export const PANTHEON_SPAWNS: [number, number][] = [
  [520, 300],
  [760, 300],
  [1100, 300],
  [1180, 300],
  [1600, 300],
  [2100, 300],
  [2600, 300],
];
