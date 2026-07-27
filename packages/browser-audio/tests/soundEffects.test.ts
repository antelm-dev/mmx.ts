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

test("load retries after a transient fetch failure", async () => {
  let fetchCount = 0;
  const cause = new Error("network down");
  const context = createMockContext(async () => createMockBuffer());
  const effects = createSoundEffects({
    resolver: createProjectSoundResolver(manifest, "https://game.test/"),
    soundIds: ["jump"],
    context: context as unknown as AudioContext,
    fetchFn: async () => {
      fetchCount += 1;
      if (fetchCount === 1) throw cause;
      return new Response(new ArrayBuffer(8), { status: 200 });
    },
  });

  await assert.rejects(
    () => effects.load(),
    (error: unknown) => {
      assert.ok(error instanceof SoundAssetError);
      assert.equal(error.code, "fetch");
      assert.equal(error.soundId, "jump");
      assert.match(error.message, /https:\/\/game\.test\/sounds\/jump\.wav/);
      assert.equal(error.cause, cause);
      return true;
    },
  );

  await effects.load();
  assert.equal(fetchCount, 2);
  effects.play("jump");
});

test("load retries after a transient decode failure", async () => {
  let decodeCount = 0;
  let fetchCount = 0;
  const cause = new Error("bad audio");
  const context = createMockContext(async () => {
    decodeCount += 1;
    if (decodeCount === 1) throw cause;
    return createMockBuffer();
  });
  const effects = createSoundEffects({
    resolver: createProjectSoundResolver(manifest, "https://game.test/"),
    soundIds: ["jump"],
    context: context as unknown as AudioContext,
    fetchFn: async () => {
      fetchCount += 1;
      return new Response(new ArrayBuffer(8), { status: 200 });
    },
  });

  await assert.rejects(
    () => effects.load(),
    (error: unknown) => {
      assert.ok(error instanceof SoundAssetError);
      assert.equal(error.code, "decode");
      assert.equal(error.soundId, "jump");
      assert.match(error.message, /https:\/\/game\.test\/sounds\/jump\.wav/);
      assert.equal(error.cause, cause);
      return true;
    },
  );

  await effects.load();
  assert.equal(fetchCount, 2);
  assert.equal(decodeCount, 2);
  effects.play("jump");
});

test("concurrent load calls after failure share one retry attempt", async () => {
  let fetchCount = 0;
  const context = createMockContext(async () => createMockBuffer());
  const effects = createSoundEffects({
    resolver: createProjectSoundResolver(manifest, "https://game.test/"),
    soundIds: ["jump", "alias"],
    context: context as unknown as AudioContext,
    fetchFn: async () => {
      fetchCount += 1;
      if (fetchCount === 1) throw new Error("network down");
      return new Response(new ArrayBuffer(8), { status: 200 });
    },
  });

  await assert.rejects(() => effects.load());
  await Promise.all([effects.load(), effects.load()]);
  assert.equal(fetchCount, 2);
});

test("partial preload success is kept and remaining sounds retry", async () => {
  let fetchCount = 0;
  let playCount = 0;
  const context = createMockContext(async () => createMockBuffer());
  const originalCreateBufferSource = context.createBufferSource;
  context.createBufferSource = () => {
    const source = originalCreateBufferSource();
    const originalStart = source.start;
    source.start = () => {
      playCount += 1;
      originalStart();
    };
    return source;
  };

  const effects = createSoundEffects({
    resolver: createProjectSoundResolver(manifest, "https://game.test/"),
    soundIds: ["jump", "broken"],
    context: context as unknown as AudioContext,
    fetchFn: async (input) => {
      fetchCount += 1;
      const url = String(input);
      if (url.endsWith("broken.wav") && fetchCount < 3) {
        return new Response(null, { status: 503, statusText: "Unavailable" });
      }
      return new Response(new ArrayBuffer(8), { status: 200 });
    },
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

  const fetchCountAfterFailure = fetchCount;
  assert.ok(fetchCountAfterFailure >= 2);

  await effects.load();
  assert.equal(fetchCount, fetchCountAfterFailure + 1);

  effects.play("jump");
  effects.play("broken");
  assert.equal(playCount, 2);
});

test("play resolves runtime names through sound bindings to preloaded asset ids", async () => {
  const started: string[] = [];
  const context = createMockContext(async () => createMockBuffer());
  const originalCreate = context.createBufferSource;
  context.createBufferSource = () => {
    const source = originalCreate();
    const originalStart = source.start;
    source.start = () => {
      started.push("ok");
      originalStart();
    };
    return source;
  };

  const effects = createSoundEffects({
    resolver: {
      resolveUrl(soundId: string) {
        assert.equal(soundId, "sfx.player.jump");
        return "https://game.test/sounds/jump.wav";
      },
    },
    soundIds: ["sfx.player.jump"],
    bindings: { jump: "sfx.player.jump" },
    context: context as unknown as AudioContext,
    fetchFn: async () => new Response(new ArrayBuffer(8), { status: 200 }),
  });

  await effects.load();
  effects.play("jump");
  assert.equal(started.length, 1);
});
