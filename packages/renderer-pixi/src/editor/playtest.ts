import { DT, VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine";
import type { Enemy, LifeCapsule, Scene, WeaponCapsule } from "@mmx/engine";
import type { DecorationInstance, LevelArt } from "@mmx/content-schema";
import type { DebugRenderOptions } from "../debug/options.js";
import { createAssetCatalog, resolveRendererAssetManifest, type AssetCatalog } from "./catalog.js";
import type { RendererAssetBindings, RendererAssetManifest } from "../assets/manifest.js";
import type { RendererAssetResolver } from "../assets/resolver.js";
import {
  createScenePresentation,
  type ScenePresentation,
} from "../presentation/ScenePresentation.js";

export interface StudioPlaytestRenderer {
  bindScene(scene: Scene): void;
  attachEnemy(enemy: Enemy): void;
  attachPickup(pickup: LifeCapsule): void;
  attachWeaponCapsule(capsule: WeaponCapsule): void;
  sampleCosmetics(scene: Scene): void;
  render(scene: Scene): void;
  setDecorations(decorations: readonly DecorationInstance[], art?: LevelArt): void;
  setDebugOptions(options: Partial<DebugRenderOptions>): void;
  debugOptions(): DebugRenderOptions;
  destroy(): void;
}

export interface CreatePlaytestRendererOptions {
  assets?: AssetCatalog;
  manifest?: RendererAssetManifest;
  resolver?: RendererAssetResolver;
  bindings?: RendererAssetBindings;
  decorations?: readonly DecorationInstance[];
  levelArt?: LevelArt;
  debugOptions?: Partial<DebugRenderOptions>;
}

class PlaytestRendererImpl implements StudioPlaytestRenderer {
  private readonly resizeObserver: ResizeObserver;

  private constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly presentation: ScenePresentation,
  ) {
    this.resizeObserver = new ResizeObserver(() => this.fit());
  }

  static async create(
    host: HTMLElement,
    scene: Scene,
    assets: AssetCatalog,
    manifest: RendererAssetManifest,
    decorations: readonly DecorationInstance[],
    levelArt: LevelArt | undefined,
    debugOptions?: Partial<DebugRenderOptions>,
  ): Promise<PlaytestRendererImpl> {
    const canvas = document.createElement("canvas");
    canvas.id = "play-canvas";
    Object.assign(canvas.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      imageRendering: "pixelated",
    });
    host.append(canvas);

    let presentation: ScenePresentation;
    try {
      presentation = await createScenePresentation(canvas, scene, {
        assets,
        manifest,
        decorations,
        levelArt,
        debugOptions,
      });
    } catch (error) {
      canvas.remove();
      throw error;
    }

    const instance = new PlaytestRendererImpl(host, canvas, presentation);
    instance.fit();
    instance.resizeObserver.observe(host);
    return instance;
  }

  setDecorations(decorations: readonly DecorationInstance[], art?: LevelArt): void {
    this.presentation.setDecorations(decorations, art);
  }

  setDebugOptions(options: Partial<DebugRenderOptions>): void {
    this.presentation.setDebugOptions(options);
  }

  debugOptions(): DebugRenderOptions {
    return this.presentation.debugOptions();
  }

  bindScene(scene: Scene): void {
    this.presentation.bindScene(scene);
  }

  attachEnemy(enemy: Enemy): void {
    this.presentation.attachEnemy(enemy);
  }

  attachPickup(pickup: LifeCapsule): void {
    this.presentation.attachPickup(pickup);
  }

  attachWeaponCapsule(capsule: WeaponCapsule): void {
    this.presentation.attachWeaponCapsule(capsule);
  }

  sampleCosmetics(scene: Scene): void {
    this.presentation.stepCosmetics(scene, DT);
  }

  render(scene: Scene): void {
    this.presentation.render(scene);
  }

  private fit(): void {
    const scale = Math.max(
      1,
      Math.floor(
        Math.min(this.host.clientWidth / VIEW_WIDTH, this.host.clientHeight / VIEW_HEIGHT),
      ),
    );
    this.presentation.fit(scale);
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.presentation.destroy();
    this.canvas.remove();
  }
}

export async function createPlaytestRenderer(
  host: HTMLElement,
  scene: Scene,
  options: CreatePlaytestRendererOptions = {},
): Promise<StudioPlaytestRenderer> {
  const manifest = resolveRendererAssetManifest(options);
  const assets = options.assets ?? createAssetCatalog({ manifest });
  return PlaytestRendererImpl.create(
    host,
    scene,
    assets,
    manifest,
    options.decorations ?? [],
    options.levelArt,
    options.debugOptions,
  );
}
