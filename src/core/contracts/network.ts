export interface HttpClient {
  fetchJson<T>(url: string, timeoutMs?: number): Promise<T>;
  downloadFile(
    url: string,
    destinationPath: string,
    timeoutMs?: number,
  ): Promise<void>;
}
