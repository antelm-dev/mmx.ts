export {
  STARTER_TEMPLATE_ID,
  STARTER_ATTRIBUTION,
  STARTER_GAME_DATA,
  STARTER_MANIFEST,
  resolveStarterTemplateRoot,
} from "./paths.js";
export {
  validateStarterTemplate,
  validateStarterTemplateOnDisk,
  readStarterManifest,
  type StarterValidationCounts,
  type StarterValidationResult,
} from "./validate.js";
export {
  copyStarterProjectToDirectory,
  exportFreshStarterCopy,
  type CreateFromStarterInput,
} from "./copy.js";
