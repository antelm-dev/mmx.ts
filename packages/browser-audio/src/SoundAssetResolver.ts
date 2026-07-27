import type { ProjectAsset, ProjectDocument } from "@mmx/project-schema";

export type SoundAssetErrorCode = "missing" | "wrong-kind" | "fetch" | "decode";

export class SoundAssetError extends Error {
  readonly code: SoundAssetErrorCode;
  readonly soundId: string;
  readonly cause?: unknown;

  constructor(
    code: SoundAssetErrorCode,
    soundId: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "SoundAssetError";
    this.code = code;
    this.soundId = soundId;
    this.cause = options?.cause;
  }
}

export interface SoundAssetResolver {
  resolveUrl(soundId: string): string;
}

export function createProjectSoundResolver(
  project: Pick<ProjectDocument, "assets">,
  baseUrl: string,
): SoundAssetResolver {
  const byId = new Map<string, ProjectAsset>(project.assets.map((asset) => [asset.id, asset]));
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return {
    resolveUrl(soundId: string): string {
      const asset = byId.get(soundId);
      if (!asset) {
        throw new SoundAssetError(
          "missing",
          soundId,
          `Sound asset '${soundId}' is not in the project manifest.`,
        );
      }
      if (asset.kind !== "sound") {
        throw new SoundAssetError(
          "wrong-kind",
          soundId,
          `Asset '${soundId}' has kind '${asset.kind}'; expected 'sound'.`,
        );
      }
      return new URL(asset.path, root).href;
    },
  };
}
