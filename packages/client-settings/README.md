# @mmx/client-settings

Versioned, host-neutral client preferences for audio, input, gameplay, and
window behavior. The package normalizes untrusted stored data, migrates older
settings, resolves key-binding conflicts, and persists updates through an
injected storage adapter.

## Public API

```ts
import { createClientSettingsStore, type SettingsStorage } from "@mmx/client-settings";

const storage: SettingsStorage = {
  load: async () => JSON.parse(localStorage.getItem("mmx.settings") ?? "null"),
  save: async (value) => {
    localStorage.setItem("mmx.settings", JSON.stringify(value));
  },
};

const settings = createClientSettingsStore({ storage });
await settings.load();
settings.patch({ audio: { masterVolume: 0.8 } });
await settings.flush();
```

The store starts from safe defaults, emits cloned snapshots to subscribers,
debounces saves, and serializes writes. Use `dispose()` during host shutdown to
flush pending state.

For one-off data handling, use `parseSettings`, `migrateSettings`, or
`normalizeSettings`. `parseSettings` rejects invalid input with
`SettingsParseError`; migration and normalization recover supported legacy or
partial values into the current `SETTINGS_VERSION`.

This package does not choose a storage backend or access `localStorage` or
Electron APIs directly. Timers use the host defaults unless `SettingsTimers`
is injected.

## Development

```bash
pnpm --filter @mmx/client-settings test
pnpm --filter @mmx/client-settings build
```
