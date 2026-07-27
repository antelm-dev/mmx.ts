# @mmx/renderer-pixi

PixiJS presentation layer for MMX engine scenes. It renders terrain, actors,
decorations, HUD state, trails and effects; resolves Studio-exported asset
manifests; and provides editor previews plus a read-only debug overlay.

`pixi.js` is a peer dependency. This package is browser-facing and does not own
simulation, input, audio, settings, or the application loop.

## Entry points

| Import                            | Purpose                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@mmx/renderer-pixi`              | Renderer, asset manifest/resolver, editor preview, playtest, effects, and the complete public surface |
| `@mmx/renderer-pixi/presentation` | Host-neutral scene presentation and cosmetic helpers                                                  |
| `@mmx/renderer-pixi/debug`        | Debug overlay and debug-render options                                                                |

## Render a scene

```ts
import { createScenePresentation } from "@mmx/renderer-pixi/presentation";

const presentation = await createScenePresentation(canvas, scene, {
  manifest,
  decorations,
});

presentation.stepCosmetics(scene, fixedStepSeconds);
presentation.render(scene);

// On shutdown:
presentation.destroy();
```

Call `bindScene()` when the runtime replaces its scene. `fit()` recalculates the
integer display scale, while `setDebugOptions()` controls collision and sensor
geometry. `createScenePresentationWithHost()` is available for Studio or other
hosts that provide their own rendering adapter.

Asset lookup should go through `RendererAssetManifest`,
`buildRendererAssetManifestFromProject`, and `createRendererAssetResolver`.
Deep imports under `render/`, `editor/`, or `assets/` are private.

## Development

```bash
pnpm --filter @mmx/renderer-pixi test
pnpm --filter @mmx/renderer-pixi build
```
