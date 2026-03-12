import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { HttpClient } from '../../core/contracts/network';
import { AppError } from '../../core/errors/app-error';

const DEFAULT_TIMEOUT_MS = 15_000;

export class FetchHttpClient implements HttpClient {
  async fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const response = await this.fetchWithTimeout(url, timeoutMs);

    if (!response.ok) {
      throw new AppError(
        'HTTP_ERROR',
        `HTTP request failed (${response.status}) while fetching ${url}`,
      );
    }

    return (await response.json()) as T;
  }

  async downloadFile(
    url: string,
    destinationPath: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<void> {
    const response = await this.fetchWithTimeout(url, timeoutMs);

    if (!response.ok) {
      throw new AppError(
        'DOWNLOAD_FAILED',
        `Download failed (${response.status}) for ${url}`,
      );
    }

    if (!response.body) {
      throw new AppError(
        'DOWNLOAD_FAILED',
        `Download returned an empty body for ${url}`,
      );
    }

    await mkdir(dirname(destinationPath), { recursive: true });
    await pipeline(
      Readable.fromWeb(response.body as never),
      createWriteStream(destinationPath),
    );
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('NETWORK_TIMEOUT', `Request timed out for ${url}`);
      }

      throw new AppError('NETWORK_ERROR', `Request failed for ${url}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
