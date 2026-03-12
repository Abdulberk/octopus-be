import {
  access,
  readdir,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StorageAdapter } from '../../core/contracts/storage';

export class FileStorage implements StorageAdapter {
  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async readJson<T>(path: string): Promise<T> {
    const data = await readFile(path, 'utf8');
    return JSON.parse(data) as T;
  }

  async writeJsonAtomic(path: string, data: unknown): Promise<void> {
    await this.writeFileAtomic(path, JSON.stringify(data, null, 2));
  }

  async writeFileAtomic(
    path: string,
    data: Uint8Array | string,
  ): Promise<void> {
    const directory = dirname(path);
    await mkdir(directory, { recursive: true });

    const partialPath = `${path}.part`;
    await writeFile(partialPath, data);
    await rename(partialPath, path);
  }

  async readFile(path: string): Promise<Buffer> {
    return await readFile(path);
  }

  async list(path: string): Promise<string[]> {
    try {
      const entries = await readdir(path);
      return entries.map((entry) => join(path, entry));
    } catch {
      return [];
    }
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    const directory = dirname(toPath);
    await mkdir(directory, { recursive: true });
    await rename(fromPath, toPath);
  }

  async remove(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }
}
