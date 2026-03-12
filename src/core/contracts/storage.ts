export interface StorageAdapter {
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
  readJson<T>(path: string): Promise<T>;
  writeJsonAtomic(path: string, data: unknown): Promise<void>;
  writeFileAtomic(path: string, data: Uint8Array | string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  list(path: string): Promise<string[]>;
  rename(fromPath: string, toPath: string): Promise<void>;
  remove(path: string): Promise<void>;
}
