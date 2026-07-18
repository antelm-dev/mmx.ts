import { Container, Sprite } from 'pixi.js';

/**
 * A container whose child sprites are recycled from frame to frame.
 *
 * Immediate-mode drawing had no state to keep: each blit was a call and the frame
 * ended. A scene graph is retained, so the ghosts and projectiles that come and go
 * every frame would otherwise mean allocating and destroying display objects at
 * 60Hz — which churns the GPU batcher as much as the heap. Instead the pool grows
 * to the high-water mark and the surplus is hidden rather than removed.
 *
 * Usage is the immediate-mode shape it replaces: begin(), one next() per thing to
 * draw, end().
 */
export class SpritePool {
  readonly view = new Container();
  private readonly sprites: Sprite[] = [];
  private used = 0;

  begin(): void {
    this.used = 0;
  }

  /**
   * The next sprite, reset to neutral state. Callers set position and texture
   * (see {@link place}); anything else they touch — alpha, tint — is cleared here
   * so a sprite can never inherit the look of whatever used it last frame.
   */
  next(): Sprite {
    let sprite = this.sprites[this.used];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5);
      this.sprites.push(sprite);
      this.view.addChild(sprite);
    }
    this.used++;
    sprite.alpha = 1;
    sprite.tint = 0xffffff;
    return sprite;
  }

  /** Hide whatever the pool did not hand out this frame. */
  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }
}
