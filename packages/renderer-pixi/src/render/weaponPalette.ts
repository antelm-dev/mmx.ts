/**
 * A weapon's 6-color palette (WeaponResource.gd's MainColor1-6 / Weapon.gd's
 * own MainColor1-6 for the buster). In the original, `PrimaryShot.gd:
 * update_character_palette` writes these into X's body-sprite shader as
 * `R_MainColor1-6` on every weapon switch (Player.gd:change_palette), and
 * `WeaponBar.gd` separately tints the HUD ammo fill from MainColor2 (the same
 * color `Weapon.gd:get_charge_color` reports). See PaletteSwapFilter for the
 * body recolor and Hud.ts for the HUD tint — both keyed off this one table so
 * there is exactly one place a weapon's colors are recorded. Presentation only:
 * it is not game data, so it never enters the game data hash.
 */
export type Palette6 = readonly [number, number, number, number, number, number];

/**
 * The buster's own palette — Hermes Buster.tscn's MainColor1-6 — is also the
 * *source* palette baked into Player_Material_Shader.tres: X's ordinary blue.
 * Equipping the buster is therefore an identity recolor (source == target),
 * which is why `update_character_palette` special-cases it as a no-armor-tint
 * palette change rather than skipping the recolor outright.
 */
export const BASE_PALETTE: Palette6 = [0x0080f8, 0x0040f0, 0x203080, 0x78d8f0, 0x50a0f0, 0x1858b0];

/** Each weapon's palette, by weapon id. */
export const WEAPON_PALETTE: Readonly<Record<string, Palette6>> = {
  buster: BASE_PALETTE,
  // Dark Arrow.tres MainColor1-6.
  dark_arrow: [0x717171, 0x3d415c, 0x2f2e48, 0xb68ec7, 0x7c5d90, 0x3c3249],
};

/** A weapon's palette; the identity recolor ({@link BASE_PALETTE}) for an unknown weapon or none. */
export function weaponPalette(weapon: string | null): Palette6 {
  return (weapon !== null && WEAPON_PALETTE[weapon]) || BASE_PALETTE;
}
