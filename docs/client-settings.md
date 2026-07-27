# Client settings schema

`@mmx/client-settings` owns the versioned client settings document for Web and
Studio. Hosts inject storage; the package never touches React, Pixi, Electron,
Tauri, or DOM APIs at module evaluation time.

## Current schema (`version: 4`)

```ts
interface ClientSettings {
  version: 4;
  audio: { masterVolume: number }; // 0..1
  input: { bindings: Record<Action, [string, string]> };
  gameplay: { pauseOnBlur: boolean };
  window: { fullscreen: boolean; integerScale: number }; // scale 1..8
}
```

## Migrations

| From | To | Behavior |
| --- | --- | --- |
| 1 (flat) | 2 | adds default key bindings |
| 2 (flat) | 3 | merges `weapon_left` / `weapon_right` defaults |
| 3 (flat) | 4 | restructures into sectioned document |

Unknown future versions fail closed. Malformed older documents fall back to
defaults via `parseSettings` without discarding the migration path for valid
legacy volume/bindings.

## Storage ownership

| Host | Key / path | Adapter location |
| --- | --- | --- |
| Web browser | `mmx.desktop-settings.v1` | `apps/web/src/settings/webSettingsStorage.ts` |
| Web Tauri | `{app_data}/settings.json` | opaque JSON via `load_settings` / `save_settings` |
| Studio | `mmx.studio-client-settings.v1` | `apps/studio/.../settings/studioClientSettings.ts` |

Studio UI theme remains separate (`mmx-studio-theme`). It is editor chrome, not
gameplay client settings, and is not folded into `ClientSettings.appearance`.

## Binding ownership

```text
@mmx/browser-input / @mmx/runtime/browser → no settings dependency
@mmx/client-settings owns the binding data shape ([string, string] slots)
```

Prompt 03 may later share browser-input types; avoid a dependency cycle by
keeping settings as the owner of persisted binding maps.

## Prompt 05 note

`@mmx/runtime-host` should consume `ClientSettingsStore` (or a read-only
snapshot port) rather than re-implementing schema, migration, or debounce.
