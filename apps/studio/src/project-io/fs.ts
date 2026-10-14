export type FileStat = {
  isDirectory: boolean;
  isFile: boolean;
};

export type FileSystem = {
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  writeText(path: string, content: string): Promise<void>;
  writeBytes(path: string, content: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  listDir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  remove(path: string): Promise<void>;
};
