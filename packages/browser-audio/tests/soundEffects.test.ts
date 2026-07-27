import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectDocument } from "@mmx/project-schema";
import { createProjectSoundResolver, SoundAssetError } from "../src/SoundAssetResolver.js";
import { createSoundEffects } from "../src/SoundEffects.js";

type MockContext = {
  state: AudioContextState;
  destination: object;
  createGain: () => { gain: { value: number }; connect: () => void };
  createBufferSource: () => MockSource;
  decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>;
  resume: () => Promise<void>;
};

type MockSource = {
  buffer: AudioBuffer | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  playbackRate: { value: number };
  connect: () => MockSource;
  addEventListener: (type: string, listener: () => void) => void;
  start: () => void;
  stop: () => void;
};

function createMockBuffer(duration = 1): AudioBuffer {
  return { duration } as AudioBuffer;
}

function createMockContext(decode: (data: ArrayBuffer) => Promise<AudioBuffer>): MockContext {
  return {
    state: "running",
    destination: {},
    createGain: () => ({
      gain: { value: 1 },
      connect: () => undefined,
    }),
    createBufferSource: () => {
      const source: MockSource = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        playbackRate: { value: 1 },
        connect: () => source,
        addEventListener: () => undefined,
        start: () => undefined,
        stop: () => undefined,
      };
      return source;
    },
    decodeAudioData: decode,
    resume: async () => undefined,
  };
}

const manifest: Pick<ProjectDocument, "assets"> = {
  assets: [
    { id: "jump", kind: "sound", path: "sounds/jump.wav" },
    { id: "alias", kind: "sound", path: "sounds/jump.wav" },
    { id: "broken", kind: "sound", path: "sounds/broken.wav" },
  ],
};

test("load deduplicates fetch and decode for shared sound paths", async () => {
  let fetchCount = 0;
  let decodeCount = 0;
  const context = createMockContext(async () => {
    decodeCount += 1;
    return createMockBuffer();
  });

  const effects = createSoundEffects({
    resolver: createProjectSoundResolver(manifest, "https://game.test/"),
    soundIds: ["jump", "alias"],
    context: context as unknown as AudioContext,
    fetchFn: async () => {
      fetchCount += 1;
      return new Response(new ArrayBuffer(8), { status: 200 });
    },
  });

  await effects.load();
  assert.equal(fetchCount, 1);
  assert.equal(decodeCount, 1);
});

test("load surfaces fetch failures as SoundAssetError", async () => {
  const context = createMockContext(async () => createMockBuffer());
  const effects = createSoundEffects({
    resolver: createProjectSoundResolver(manifest, "https://game.test/"),
    soundIds: ["broken"],
    context: context as unknown as AudioContext,
    fetchFn: async () => new Response(null, { status: 404, statusText: "Not Found" }),
  });

  await assert.rejects(
    () => effects.load(),
    (error: unknown) => {
      assert.ok(error instanceof SoundAssetError);
      assert.equal(error.code, "fetch");
      assert.equal(error.soundId, "broken");
      return true;
    },
  );
});

test("load surfaces decode failures as SoundAssetError", async () => {
  const context = createMockContext(async () => {
    throw new Error("bad audio");
  });
  const effects = createSoundEffects({
    resolver: createProjectSoundResolver(manifest, "https://game.test/"),
    soundIds: ["jump"],
    context: context as unknown as AudioContext,
    fetchFn: async () => new Response(new ArrayBuffer(8), { status: 200 }),
  });

  await assert.rejects(
    () => effects.load(),
    (error: unknown) => {
      assert.ok(error instanceof SoundAssetError);
      assert.equal(error.code, "decode");
      assert.equal(error.soundId, "jump");
      return true;
    },
  );
});

test("repeated load reuses the in-flight preload promise", async () => {
  let fetchCount = 0;
  const context = createMockContext(async () => createMockBuffer());
  const effects = createSoundEffects({
    resolver: createProjectSoundResolver(manifest, "https://game.test/"),
    soundIds: ["jump"],
    context: context as unknown as AudioContext,
    fetchFn: async () => {
      fetchCount += 1;
      return new Response(new ArrayBuffer(8), { status: 200 });
    },
  });

  await Promise.all([effects.load(), effects.load()]);
  assert.equal(fetchCount, 1);
});
