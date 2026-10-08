import { Container, Sprite, Texture } from "pixi.js";
import type {
  DecorationInstance,
  DecorationLayer,
  ImageLayer,
  LevelArt,
} from "@mmx/content-schema";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine";
import {
  DEFAULT_LAYER_PARALLAX,
  effectiveDecorationParallax,
  getDecorationAsset,
} from "./decorations.js";
import { regionTexture, sheetTexture } from "./textures.js";

/**
 * Static decoration scene graph. Built once per loaded level; camera parallax is
 * applied each frame without recreating sprites.
 *
 * Layer order (parented by {@link Renderer}):
 *   backdrop → far-background → background → world { world-back → terrain → actors → world-front } → foreground
 *
 * Project image layers go first in their layer container, so they sit behind
 * the catalog decorations of the same layer.
 */

type Placed = {
  sprite: Sprite;
  layer: DecorationLayer;
  parallax: number;
  worldX: number;
  worldY: number;
};

export class DecorationView {
  /** Full-view solid colour behind everything; hidden when the level sets no backdrop. */
  readonly backdrop = new Sprite(Texture.WHITE);
  readonly farBackground = new Container();
  readonly background = new Container();
  readonly worldBack = new Container();
  readonly worldFront = new Container();
  readonly foreground = new Container();

  private placed: Placed[] = [];
  private signature = "";

  constructor() {
    this.backdrop.width = VIEW_WIDTH;
    this.backdrop.height = VIEW_HEIGHT;
    this.backdrop.visible = false;
  }

  private layerContainer(layer: DecorationLayer): Container {
    switch (layer) {
      case "far-background":
        return this.farBackground;
      case "background":
        return this.background;
      case "world-back":
        return this.worldBack;
      case "world-front":
        return this.worldFront;
      case "foreground":
        return this.foreground;
    }
  }

  /**
   * Rebuild sprites when the authored set changes. Identity is keyed on a
   * compact signature so restarting the same level is a no-op.
   */
  setDecorations(instances: readonly DecorationInstance[], art: LevelArt = {}): void {
    this.backdrop.visible = art.backdrop !== undefined;
    if (art.backdrop !== undefined) this.backdrop.tint = art.backdrop;

    const imageLayers = art.imageLayers ?? [];
    const next = `${imageSignatureOf(imageLayers)}#${signatureOf(instances)}`;
    if (next === this.signature) return;
    this.clear();
    this.signature = next;

    for (const layer of imageLayers) {
      // Sheets are keyed by asset id; build-tools adds every image layer asset to the manifest.
      const texture = sheetTexture(layer.assetId);
      if (!texture) continue;
      // Whole world pixels, so the 3× viewport zoom never lands an edge between device pixels.
      const x = Math.round(layer.x);
      const y = Math.round(layer.y);
      const sprite = new Sprite(texture);
      sprite.position.set(x, y);
      this.layerContainer(layer.layer).addChild(sprite);
      this.placed.push({
        sprite,
        layer: layer.layer,
        parallax: layer.parallax,
        worldX: x,
        worldY: y,
      });
    }

    for (const inst of instances) {
      const asset = getDecorationAsset(inst.assetId);
      if (!asset) continue;
      const texture = regionTexture(asset.sheet, asset.region);
      if (!texture) continue;

      const sprite = new Sprite(texture);
      sprite.anchor.set(asset.anchor[0], asset.anchor[1]);
      sprite.position.set(inst.x, inst.y);
      if (inst.flipX) sprite.scale.x *= -1;
      if (inst.flipY) sprite.scale.y *= -1;
      if (inst.rotation) sprite.angle = inst.rotation;
      if (inst.tint !== undefined) sprite.tint = inst.tint;

      this.layerContainer(inst.layer).addChild(sprite);
      this.placed.push({
        sprite,
        layer: inst.layer,
        parallax: effectiveDecorationParallax(inst),
        worldX: inst.x,
        worldY: inst.y,
      });
    }
  }

  /**
   * Apply rounded parallax. World layers (default parallax 1) live inside the
   * scrolling scene and inherit its offset; other layers are siblings and get
   * `round(sceneOffset * parallax)`. Instance overrides on world layers nudge
   * the sprite relative to the scene scroll.
   */
  syncCamera(sceneOffsetX: number, sceneOffsetY: number): void {
    this.farBackground.position.set(
      Math.round(sceneOffsetX * DEFAULT_LAYER_PARALLAX["far-background"]),
      Math.round(sceneOffsetY * DEFAULT_LAYER_PARALLAX["far-background"]),
    );
    this.background.position.set(
      Math.round(sceneOffsetX * DEFAULT_LAYER_PARALLAX.background),
      Math.round(sceneOffsetY * DEFAULT_LAYER_PARALLAX.background),
    );
    this.foreground.position.set(
      Math.round(sceneOffsetX * DEFAULT_LAYER_PARALLAX.foreground),
      Math.round(sceneOffsetY * DEFAULT_LAYER_PARALLAX.foreground),
    );

    for (const item of this.placed) {
      const layerDefault = DEFAULT_LAYER_PARALLAX[item.layer];
      const inWorld = item.layer === "world-back" || item.layer === "world-front";
      if (inWorld) {
        const dx = Math.round(sceneOffsetX * (item.parallax - layerDefault));
        const dy = Math.round(sceneOffsetY * (item.parallax - layerDefault));
        item.sprite.position.set(item.worldX + dx, item.worldY + dy);
      } else if (item.parallax !== layerDefault) {
        const parent = this.layerContainer(item.layer);
        item.sprite.position.set(
          item.worldX + Math.round(sceneOffsetX * (item.parallax - layerDefault)),
          item.worldY + Math.round(sceneOffsetY * (item.parallax - layerDefault)),
        );
        void parent;
      }
    }
  }

  clear(): void {
    for (const item of this.placed) item.sprite.destroy();
    this.placed = [];
    this.signature = "";
    for (const c of [
      this.farBackground,
      this.background,
      this.worldBack,
      this.worldFront,
      this.foreground,
    ]) {
      c.removeChildren();
    }
  }

  destroy(): void {
    this.clear();
    this.backdrop.destroy();
    this.farBackground.destroy({ children: true });
    this.background.destroy({ children: true });
    this.worldBack.destroy({ children: true });
    this.worldFront.destroy({ children: true });
    this.foreground.destroy({ children: true });
  }
}

function imageSignatureOf(layers: readonly ImageLayer[]): string {
  return layers.map((l) => `${l.id}|${l.assetId}|${l.x}|${l.y}|${l.parallax}|${l.layer}`).join(";");
}

function signatureOf(instances: readonly DecorationInstance[]): string {
  return instances
    .map(
      (d) =>
        `${d.id}|${d.assetId}|${d.x}|${d.y}|${d.layer}|${d.flipX ? 1 : 0}|${d.flipY ? 1 : 0}|${d.rotation ?? ""}|${d.parallax ?? ""}|${d.tint ?? ""}`,
    )
    .join(";");
}
