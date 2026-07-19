import type { DesktopBridge } from "../DesktopBridge.js";
import type { ScenePresenter } from "../presentation/ScenePresenter.js";
import type { SettingsModel } from "../settings/SettingsModel.js";

/**
 * Window scale, fullscreen, and keeping the renderer fit to whatever the OS
 * window ends up being.
 *
 * Split from {@link SettingsModel}: the model is just data plus persistence,
 * but applying a scale or fullscreen change means an async round trip to the
 * OS window (or the browser's Fullscreen API) that can fail and has to roll
 * the settings back if it does. That orchestration — and the resize/DPR
 * watchers that keep the renderer matching whatever the window ends up being
 * — is what this class owns. Talks to {@link ScenePresenter} rather than the
 * `Renderer` directly, since the presenter is what owns it and it does not
 * exist until asset loading finishes.
 */
export class AppLifecycle {
  constructor(
    private readonly desktop: DesktopBridge,
    private readonly settings: SettingsModel,
    private readonly presenter: ScenePresenter,
    private readonly onNotice: (message: string) => void,
  ) {}

  /** Apply whatever fullscreen/scale was loaded, before the renderer exists. */
  async applyInitial(): Promise<void> {
    const current = this.settings.get();
    if (current.fullscreen) {
      await this.desktop.setFullscreen(true).catch((error: unknown) => {
        this.settings.patch({ fullscreen: false });
        console.warn("Could not restore fullscreen", error);
      });
    } else {
      await this.desktop.applyWindowScale(current.scale).catch((error: unknown) => {
        console.warn("Could not apply window scale", error);
      });
    }
  }

  /** Prefer the settings zoom when windowed; fill the display in fullscreen. */
  fit(): void {
    const { fullscreen, scale } = this.settings.get();
    this.presenter.fit(fullscreen ? undefined : scale);
  }

  setScale(scale: number): void {
    const current = this.settings.get();
    const next = Math.max(1, Math.min(this.settings.maxScale, Math.round(scale)));
    if (next === current.scale && !current.fullscreen) return;
    const previous = current;
    this.settings.patch({ scale: next, fullscreen: false });
    void this.desktop
      .applyWindowScale(next)
      .then(() => {
        this.fit();
        this.onNotice(`scale ${next}x`);
      })
      .catch((error: unknown) => {
        this.settings.patch(previous);
        this.onNotice(`scale failed: ${String(error)}`);
      });
  }

  setFullscreen(fullscreen: boolean): void {
    const current = this.settings.get();
    if (fullscreen === current.fullscreen) return;
    this.settings.patch({ fullscreen });
    void this.desktop
      .setFullscreen(fullscreen)
      .then(async () => {
        if (!fullscreen) await this.desktop.applyWindowScale(current.scale);
        this.fit();
        this.onNotice(fullscreen ? "fullscreen" : "windowed");
      })
      .catch((error: unknown) => {
        this.settings.patch({ fullscreen: current.fullscreen });
        this.onNotice(`fullscreen failed: ${String(error)}`);
      });
  }

  /** Start watching window resize and DPR changes. Call once the renderer exists. */
  watch(): void {
    window.addEventListener("resize", () => this.fit());
    // Dragging the window to a monitor with a different scaling factor changes dpr
    // without necessarily resizing the viewport, and the media query only matches the
    // dpr it was created with — so re-arm it against the new value on every change.
    const watchDpr = (): void => {
      const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener(
        "change",
        () => {
          this.fit();
          watchDpr();
        },
        { once: true },
      );
    };
    watchDpr();
    this.fit();
  }
}
