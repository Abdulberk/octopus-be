import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function sha256Text(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function sha256File(path: string): Promise<string> {
  const buffer = await readFile(path);
  return createHash('sha256').update(buffer).digest('hex');
}
