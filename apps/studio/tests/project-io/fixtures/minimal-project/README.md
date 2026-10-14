# Minimal project fixture

Portable sample project for prompts 06 and 08. Validate with:

```powershell
cd mmx-studio
pnpm test
```

Layout:

```text
tests/fixtures/minimal-project/
├── project.json
├── game/
│   └── data.json
├── levels/
│   └── level.main.json
└── assets/
    ├── sprites/
    │   ├── bg.png
    │   └── player.png
    └── sounds/
        └── jump.wav
```

The level is playable (floor row + spawn). Sprites are referenced through `game/data.json` bindings (player sheet `sprite.player.fixture`, checked by the Play e2e); `sfx.jump` is an intentional orphan for export exclusion tests.
