export type { ClientSettings, SettingsStorage } from "@mmx/client-settings";
import type { ReplayFileAccess, ReplayText } from "../debug/types.js";
export type { ClipboardAccess, ReplayFileAccess, ReplayText } from "../debug/types.js";

export interface ReplayFileDropHost {
  onReplayDropped?(listener: (file: ReplayText) => void): Promise<() => void> | (() => void) | void;
}

export type ReplayFileHost = ReplayFileAccess & ReplayFileDropHost;

export interface WindowHost {
  isFullscreen(): Promise<boolean>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  applyIntegerScale?(scale: number): Promise<void>;
  maxIntegerScale?(): Promise<number>;
  onFullscreenChanged?(
    listener: (value: boolean) => void,
  ): Promise<() => void> | (() => void) | void;
  onFocusChanged?(listener: (focused: boolean) => void): Promise<() => void> | (() => void) | void;
}

export interface ClipboardHost {
  writeText(contents: string): Promise<void>;
}

export interface ApplicationMetadataHost {
  getAppId?(): Promise<string> | string;
  getAppVersion?(): Promise<string> | string;
  getPlatform?(): Promise<string> | string;
}
