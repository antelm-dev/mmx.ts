export {
  BINDABLE_ACTIONS,
  DEFAULT_BINDINGS,
  DEFAULT_SETTINGS,
  cloneBindings,
  cloneSettings,
  defaultSettings,
  mergeBindings,
  resolveBindingConflict,
  resetBindings,
} from "./bindings.js";
export {
  SettingsParseError,
  clampScale,
  clampVolume,
  isClientSettings,
  migrateSettings,
  normalizeSettings,
  parseSettings,
} from "./normalize.js";
export { createClientSettingsStore } from "./store.js";
export type {
  ClientSettings,
  ClientSettingsStore,
  CreateClientSettingsStoreOptions,
  DeepPartial,
  KeyBindings,
  SettingsSaveErrorHandler,
  SettingsStorage,
  SettingsTimers,
} from "./types.js";
export {
  DEFAULT_PERSIST_DEBOUNCE_MS,
  DEFAULT_WINDOW_SCALE,
  MAX_WINDOW_SCALE,
  SETTINGS_VERSION,
} from "./types.js";
