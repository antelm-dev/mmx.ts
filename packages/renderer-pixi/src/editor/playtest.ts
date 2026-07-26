import { DT, VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine";
import type { Enemy, LifeCapsule, Scene, WeaponCapsule } from "@mmx/engine";
import type { DecorationInstance } from "@mmx/content-schema";
import { createAssetCatalog, type AssetCatalog } from "./catalog.js";
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
  setDecorations(decorations: readonly DecorationInstance[]): void;
  destroy(): void;
}

export interface CreatePlaytestRendererOptions {
  assets?: AssetCatalog;
  decorations?: readonly DecorationInstance[];
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
    decorations: readonly DecorationInstance[],
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
      presentation = await createScenePresentation(canvas, scene, { assets, decorations });
    } catch (error) {
      canvas.remove();
      throw error;
    }

    const instance = new PlaytestRendererImpl(host, canvas, presentation);
    instance.fit();
    instance.resizeObserver.observe(host);
    return instance;
  }

  setDecorations(decorations: readonly DecorationInstance[]): void {
    this.presentation.setDecorations(decorations);
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
  const assets = options.assets ?? createAssetCatalog();
  return PlaytestRendererImpl.create(host, scene, assets, options.decorations ?? []);
}
