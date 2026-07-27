export * from "./DashSmoke.js";
export * from "./EnemyDebris.js";
export * from "./EnemyExplosion.js";
export * from "./Trail.js";
export { Renderer, type RendererCreateOptions } from "./render/Renderer.js";
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
  resolveRendererAssetManifest,
  type AssetCatalog,
  type CreateAssetCatalogOptions,
  type EditorSpriteDefinition,
  type SpritePreview,
} from "./editor/catalog.js";
export {
  buildRendererAssetManifest,
  buildRendererAssetManifestFromProject,
  createRendererAssetResolver,
  manifestToPreviewTables,
  validateRendererAssetManifest,
  RendererAssetError,
  type RendererAssetBindings,
  type RendererAssetManifest,
  type RendererAssetResolver,
  type RendererAssetResolverContext,
  type RendererAssetUrlResolver,
  type ShotAnimManifest,
} from "./assets/index.js";
export {
  createPlaytestRenderer,
  type CreatePlaytestRendererOptions,
  type StudioPlaytestRenderer,
} from "./editor/playtest.js";
export {
  createScenePresentation,
  createScenePresentationWithHost,
  type CreateScenePresentationWithHostOptions,
  type ScenePresentation,
  type ScenePresentationEffects,
  type ScenePresentationHost,
  type ScenePresentationOptions,
} from "./presentation/ScenePresentation.js";
export { dashSmokeOrigin, selectTrailStyle } from "./presentation/cosmetics.js";
export {
  DebugOverlay,
  DEBUG_RENDER_OPTIONS_OFF,
  anyDebugRenderOption,
  mergeDebugRenderOptions,
  type DebugGeometryOverlay,
  type DebugRenderOptions,
} from "./debug/index.js";

export { loadSheets, regionTexture } from "./render/textures.js";
