---
"@mmx/engine": minor
"@mmx/renderer-pixi": minor
"@mmx/content-schema": minor
"@mmx/build-tools": minor
"@mmx/studio": minor
---

Pickups are drawn by their `sheet`, like enemies, so a pack or a project can add one such as `life.huge`. `LifeCapsule` exposes its definition's `sheet`; the renderer, the asset catalog and the editor preview look pickup clips up by it, and catalog definitions carry it in `components.pickup.sheet`. build-tools `studioBindingsToRendererBindings` and Studio bind a pickup whose sheet is an animation asset id to that asset unless `pickupAnimations` names the sheet. The templates' `pickupAnimations` keys are now the sheets (`heal`, `sheal`, `ammo`, `sammo`); older bindings keyed by a life capsule's Kind (`small`, `large`) still draw it. No gameplay change: the game hash stays `36e5bb6d8c3547a6`.
