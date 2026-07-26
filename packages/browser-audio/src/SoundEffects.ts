/** Browser sound-effect player backed by Web Audio.
 *
 * The simulation only emits gameplay events. This adapter owns decoding, mixing,
 * overlapping voices and looping channels, so headless runs remain deterministic
 * and do not acquire a browser dependency.
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
  | "darkArrow"
  | "enemyHit"
  | "shieldHit"
  | "guardBreak"
  | "enemyDeath"
  | "playerDeath"
  | "heal"
  | "introAppear"
  | "introThunder";

const soundUrl = (path: string) => new URL(`../assets/sounds/${path}`, import.meta.url).href;

const URLS: Record<SoundName, string> = {
  jump: soundUrl("player/jump.wav"),
  land: soundUrl("player/land.wav"),
  dash: soundUrl("player/dash.wav"),
  wallslide: soundUrl("player/wallslide.wav"),
  damage: soundUrl("player/damage.wav"),
  charge: soundUrl("weapons/charge.wav"),
  lemon: soundUrl("weapons/lemon.wav"),
  mediumShot: soundUrl("weapons/medium-shot.wav"),
  chargedShot: soundUrl("weapons/charged-shot.wav"),
  darkArrow: soundUrl("weapons/dark-arrow.ogg"),
  enemyHit: soundUrl("enemies/enemy-hit.wav"),
  shieldHit: soundUrl("enemies/shield-hit.ogg"),
  guardBreak: soundUrl("enemies/guard-break.wav"),
  enemyDeath: soundUrl("enemies/enemy-death.wav"),
  playerDeath: soundUrl("player/player-death.wav"),
  heal: soundUrl("pickups/heal.wav"),
  introAppear: soundUrl("player/intro-appear.wav"),
  introThunder: soundUrl("player/intro-thunder.wav"),
};

export interface PlayOptions {
  /** Gain in decibels, matching Godot's AudioStreamPlayer volume_db. */
  db?: number;
  /** Playback-rate range; a single value disables random pitch. */
  rate?: number | [number, number];
  /** Loop until stop(name), used by the charge streams. */
  loop?: boolean;
  /** Loop points in seconds. */
  loopSeconds?: [number, number];
  /** Retain a non-looping source so an interruption can stop it by name. */
  tracked?: boolean;
}

export class SoundEffects {
  private readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly active = new Map<SoundName, AudioBufferSourceNode>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private loadPromise: Promise<void> | null = null;

  constructor() {
    this.master.connect(this.context.destination);
  }

  setMasterVolume(volume: number): void {
    this.master.gain.value = Math.max(0, Math.min(1, volume));
  }

  /** Decode every sample once so later playtests reuse the same buffers. */
  load(): Promise<void> {
    this.loadPromise ??= Promise.all(
      (Object.entries(URLS) as [SoundName, string][]).map(async ([name, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          this.buffers.set(name, await this.context.decodeAudioData(await response.arrayBuffer()));
        } catch (error) {
          // A missing sample must not prevent the game or editor from starting.
          console.warn(`Could not load sound effect ${name}`, error);
        }
      }),
    ).then(() => undefined);
    return this.loadPromise;
  }

  /** Must be called synchronously from an input handler to satisfy autoplay policies. */
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
    this.voices.add(source);
    if (options.loop || options.tracked) this.active.set(name, source);
    source.addEventListener("ended", () => {
      this.voices.delete(source);
      if (this.active.get(name) === source) this.active.delete(name);
    });
    source.start();
  }

  stop(name: SoundName): void {
    const source = this.active.get(name);
    if (!source) return;
    this.active.delete(name);
    this.voices.delete(source);
    source.stop();
  }

  /** Stop every voice when a play session ends; decoded buffers remain reusable. */
  stopAll(): void {
    this.active.clear();
    for (const source of this.voices) source.stop();
    this.voices.clear();
  }
}

function randomRate(rate: number | [number, number]): number {
  if (typeof rate === "number") return rate;
  return rate[0] + Math.random() * (rate[1] - rate[0]);
}
