import type { ProjectDocument } from "@mmx/project-schema";
import { createProjectSoundResolver } from "./SoundAssetResolver.js";
import type { SoundAssetResolver } from "./SoundAssetResolver.js";
import { SoundAssetError } from "./SoundAssetResolver.js";
import { GAMEPLAY_SOUND_IDS } from "./soundIds.js";

export type { SoundId, SoundName } from "./soundIds.js";
export { GAMEPLAY_SOUND_IDS } from "./soundIds.js";

export interface PlayOptions {
  db?: number;
  rate?: number | [number, number];
  loop?: boolean;
  loopSeconds?: [number, number];
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

  constructor(options: CreateSoundEffectsOptions) {
    this.context = options.context ?? new AudioContext();
    this.resolver = options.resolver;
    this.soundIds = options.soundIds;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
  }

  setMasterVolume(volume: number): void {
    this.master.gain.value = Math.max(0, Math.min(1, volume));
  }

  load(): Promise<void> {
    this.loadPromise ??= Promise.all(this.soundIds.map((soundId) => this.loadSound(soundId))).then(
      () => undefined,
    );
    return this.loadPromise;
  }

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
