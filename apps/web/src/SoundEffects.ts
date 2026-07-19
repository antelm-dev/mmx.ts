/** Browser sound-effect player backed by Web Audio.
 *
 * The simulation only emits gameplay events. This adapter owns decoding, mixing,
 * overlapping voices and the looping charge channels, so headless runs remain
 * deterministic and do not acquire a browser dependency.
 */
export type SoundName =
  | "jump"
  | "land"
  | "dash"
  | "wallslide"
  | "damage"
  | "charge"
  | "lemon"
  | "mediumShot"
  | "chargedShot"
  | "enemyHit"
  | "shieldHit"
  | "guardBreak"
  | "enemyDeath"
  | "playerDeath"
  | "heal"
  | "introAppear"
  | "introThunder";

const URLS: Record<SoundName, string> = {
  jump: new URL("../../../resources/sounds/player/jump.wav", import.meta.url).href,
  land: new URL("../../../resources/sounds/player/land.wav", import.meta.url).href,
  dash: new URL("../../../resources/sounds/player/dash.wav", import.meta.url).href,
  wallslide: new URL("../../../resources/sounds/player/wallslide.wav", import.meta.url).href,
  damage: new URL("../../../resources/sounds/player/damage.wav", import.meta.url).href,
  charge: new URL("../../../resources/sounds/weapons/charge.wav", import.meta.url).href,
  lemon: new URL("../../../resources/sounds/weapons/lemon.wav", import.meta.url).href,
  mediumShot: new URL("../../../resources/sounds/weapons/medium-shot.wav", import.meta.url).href,
  chargedShot: new URL("../../../resources/sounds/weapons/charged-shot.wav", import.meta.url).href,
  enemyHit: new URL("../../../resources/sounds/enemies/enemy-hit.wav", import.meta.url).href,
  shieldHit: new URL("../../../resources/sounds/enemies/shield-hit.ogg", import.meta.url).href,
  guardBreak: new URL("../../../resources/sounds/enemies/guard-break.wav", import.meta.url).href,
  enemyDeath: new URL("../../../resources/sounds/enemies/enemy-death.wav", import.meta.url).href,
  playerDeath: new URL("../../../resources/sounds/player/player-death.wav", import.meta.url).href,
  heal: new URL("../../../resources/sounds/pickups/heal.wav", import.meta.url).href,
  introAppear: new URL("../../../resources/sounds/player/intro-appear.wav", import.meta.url).href,
  introThunder: new URL("../../../resources/sounds/player/intro-thunder.wav", import.meta.url).href,
};

export interface PlayOptions {
  /** Gain in decibels, matching Godot's AudioStreamPlayer volume_db. */
  db?: number;
  /** Playback-rate range; a single value disables random pitch. */
  rate?: number | [number, number];
  /** Loop until stop(name), used by the charge streams. */
  loop?: boolean;
  /**
   * Loop points in seconds. Deliberately not PCM frames: decodeAudioData
   * resamples every sample to the context's rate, so the decoded buffer's
   * sampleRate is the output device's and not the file's. Converting frames
   * against it silently lands the loop somewhere in the middle of the sound.
   */
  loopSeconds?: [number, number];
  /** Retain a non-looping source so an interruption can stop it. */
  tracked?: boolean;
}

export class SoundEffects {
  private readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly active = new Map<SoundName, AudioBufferSourceNode>();

  constructor() {
    this.master.connect(this.context.destination);
  }

  setMasterVolume(volume: number): void {
    this.master.gain.value = Math.max(0, Math.min(1, volume));
  }

  /** Decode all samples up front so the first frame of an action is never late. */
  async load(): Promise<void> {
    await Promise.all(
      (Object.entries(URLS) as [SoundName, string][]).map(async ([name, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          this.buffers.set(name, await this.context.decodeAudioData(await response.arrayBuffer()));
        } catch (error) {
          // A missing sample must not prevent the game from starting.
          console.warn(`Could not load sound effect ${name}`, error);
        }
      }),
    );
  }

  /** Must be called from an input handler to satisfy browser autoplay policies. */
  unlock(): void {
    if (this.context.state === "suspended") void this.context.resume();
  }

  play(name: SoundName, options: PlayOptions = {}): void {
    const buffer = this.buffers.get(name);
    if (!buffer) return;

    if (options.loop || options.tracked) this.stop(name);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    if (options.loopSeconds) {
      source.loopStart = options.loopSeconds[0];
      source.loopEnd = Math.min(options.loopSeconds[1], buffer.duration);
    }
    source.playbackRate.value = randomRate(options.rate ?? 1);
    gain.gain.value = Math.pow(10, (options.db ?? 0) / 20);
    source.connect(gain).connect(this.master);
    if (options.loop || options.tracked) {
      this.active.set(name, source);
      source.addEventListener("ended", () => {
        if (this.active.get(name) === source) this.active.delete(name);
      });
    }
    source.start();
  }

  stop(name: SoundName): void {
    const source = this.active.get(name);
    if (!source) return;
    this.active.delete(name);
    source.stop();
  }
}

function randomRate(rate: number | [number, number]): number {
  if (typeof rate === "number") return rate;
  return rate[0] + Math.random() * (rate[1] - rate[0]);
}
