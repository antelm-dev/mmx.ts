export * from "./DashSmoke.js";
export * from "./EnemyDebris.js";
export * from "./EnemyExplosion.js";
export * from "./Trail.js";
export { Renderer } from "./render/Renderer.js";
export { DecorationView } from "./render/DecorationView.js";
export {
  DECORATION_ASSETS,
  DEFAULT_LAYER_PARALLAX,
  decorationBounds,
  effectiveDecorationParallax,
  getDecorationAsset,
  knownDecorationAssetIds,
  requireDecorationAsset,
  type DecorationAsset,
} from "./render/decorations.js";
export { spriteSnapshot } from "./render/sprite.js";

export {
  createAssetCatalog,
  getDecorationPreview,
  loadEditorAssets,
  getSpritePreview,
  type AssetCatalog,
  type CreateAssetCatalogOptions,
  type EditorSpriteDefinition,
  type SpritePreview,
} from "./editor/catalog.js";
export {
  createPlaytestRenderer,
  type CreatePlaytestRendererOptions,
  type StudioPlaytestRenderer,
} from "./editor/playtest.js";

/** @deprecated Studio/editor-runtime should use createAssetCatalog / loadEditorAssets. Kept for apps/web. */
export { animData, enemyAnims, pickupAnims, SHEET_URLS } from "./render/assets.js";
/** @deprecated Studio/editor-runtime should use loadEditorAssets / getSpritePreview. Kept for apps/web. */
export { loadSheets, regionTexture } from "./render/textures.js";
