/** Browser sound-effect player backed by Web Audio.
 *
 * The simulation only emits gameplay events. This adapter owns decoding, mixing,
 * overlapping voices and looping channels, so headless runs remain deterministic
 * and do not acquire a browser dependency.
 */
import type { ProjectDocument } from "@mmx/project-schema";
import { createBuiltinSoundResolver } from "./builtinSoundResolver.js";
import { createProjectSoundResolver } from "./SoundAssetResolver.js";
import type { SoundAssetResolver } from "./SoundAssetResolver.js";
import { SoundAssetError } from "./SoundAssetResolver.js";
import { GAMEPLAY_SOUND_IDS } from "./soundIds.js";

export type { SoundId, SoundName } from "./soundIds.js";
export { GAMEPLAY_SOUND_IDS } from "./soundIds.js";

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

export interface CreateSoundEffectsOptions {
  resolver: SoundAssetResolver;
  soundIds: readonly string[];
  context?: AudioContext;
  fetchFn?: typeof fetch;
}

export class SoundEffects {
  private readonly context: AudioContext;
  private readonly resolver: SoundAssetResolver;
  private readonly soundIds: readonly string[];
  private readonly fetchFn: typeof fetch;
  private readonly master: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly active = new Map<string, AudioBufferSourceNode>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private loadPromise: Promise<void> | null = null;
  private readonly urlLoads = new Map<string, Promise<AudioBuffer>>();

  constructor(options?: CreateSoundEffectsOptions) {
    const resolved = options ?? {
      resolver: createBuiltinSoundResolver(),
      soundIds: GAMEPLAY_SOUND_IDS,
    };
    this.context = resolved.context ?? new AudioContext();
    this.resolver = resolved.resolver;
    this.soundIds = resolved.soundIds;
    this.fetchFn = resolved.fetchFn ?? fetch.bind(globalThis);
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
  }

  setMasterVolume(volume: number): void {
    this.master.gain.value = Math.max(0, Math.min(1, volume));
  }

  /** Decode every configured sample once so later playtests reuse the same buffers. */
  load(): Promise<void> {
    this.loadPromise ??= Promise.all(this.soundIds.map((soundId) => this.loadSound(soundId))).then(
      () => undefined,
    );
    return this.loadPromise;
  }

  /** Must be called synchronously from an input handler to satisfy autoplay policies. */
  unlock(): void {
    if (this.context.state === "suspended") void this.context.resume();
  }

  play(soundId: string, options: PlayOptions = {}): void {
    const buffer = this.buffers.get(soundId);
    if (!buffer) return;

    if (options.loop || options.tracked) this.stop(soundId);
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
    if (options.loop || options.tracked) this.active.set(soundId, source);
    source.addEventListener("ended", () => {
      this.voices.delete(source);
      if (this.active.get(soundId) === source) this.active.delete(soundId);
    });
    source.start();
  }

  stop(soundId: string): void {
    const source = this.active.get(soundId);
    if (!source) return;
    this.active.delete(soundId);
    this.voices.delete(source);
    source.stop();
  }

  /** Stop every voice when a play session ends; decoded buffers remain reusable. */
  stopAll(): void {
    this.active.clear();
    for (const source of this.voices) source.stop();
    this.voices.clear();
  }

  private async loadSound(soundId: string): Promise<void> {
    let url: string;
    try {
      url = this.resolver.resolveUrl(soundId);
    } catch (error) {
      if (error instanceof SoundAssetError) throw error;
      throw new SoundAssetError("missing", soundId, `Could not resolve sound asset '${soundId}'.`, {
        cause: error,
      });
    }

    const buffer = await this.loadUrl(url, soundId);
    this.buffers.set(soundId, buffer);
  }

  private loadUrl(url: string, soundId: string): Promise<AudioBuffer> {
    const existing = this.urlLoads.get(url);
    if (existing) return existing;

    const promise = (async () => {
      let response: Response;
      try {
        response = await this.fetchFn(url);
      } catch (error) {
        throw new SoundAssetError(
          "fetch",
          soundId,
          `Failed to fetch sound '${soundId}' from ${url}.`,
          { cause: error },
        );
      }
      if (!response.ok) {
        throw new SoundAssetError(
          "fetch",
          soundId,
          `Failed to fetch sound '${soundId}' from ${url}: ${response.status} ${response.statusText}.`,
        );
      }

      let data: ArrayBuffer;
      try {
        data = await response.arrayBuffer();
      } catch (error) {
        throw new SoundAssetError(
          "fetch",
          soundId,
          `Failed to read sound '${soundId}' from ${url}.`,
          { cause: error },
        );
      }

      try {
        return await this.context.decodeAudioData(data);
      } catch (error) {
        throw new SoundAssetError(
          "decode",
          soundId,
          `Failed to decode sound '${soundId}' from ${url}.`,
          { cause: error },
        );
      }
    })();

    this.urlLoads.set(url, promise);
    return promise;
  }
}

function randomRate(rate: number | [number, number]): number {
  if (typeof rate === "number") return rate;
  return rate[0] + Math.random() * (rate[1] - rate[0]);
}

export function createSoundEffects(options: CreateSoundEffectsOptions): SoundEffects {
  return new SoundEffects(options);
}

export function createSoundEffectsFromManifest(
  project: Pick<ProjectDocument, "assets">,
  baseUrl: string,
  soundIds: readonly string[] = GAMEPLAY_SOUND_IDS,
): SoundEffects {
  return createSoundEffects({
    resolver: createProjectSoundResolver(project, baseUrl),
    soundIds,
  });
}
