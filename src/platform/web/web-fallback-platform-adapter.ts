import type {
  DeviceInfo,
  LifecycleState,
  PlatformAdapter,
  ScreenshotResult,
  VisibilityState,
} from '../../core/contracts/platform';
import { AppError } from '../../core/errors/app-error';

export class WebFallbackPlatformAdapter implements PlatformAdapter {
  private volume = 100;

  async getDeviceInfo(): Promise<DeviceInfo> {
    const userAgent =
      typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    return {
      deviceId: this.resolveDeviceId(),
      model: userAgent,
      platform: 'web',
    };
  }

  async setVolume(value: number): Promise<void> {
    this.volume = Math.max(0, Math.min(100, value));

    if (typeof document === 'undefined') {
      return;
    }

    const normalized = this.volume / 100;
    document.querySelectorAll('video').forEach((videoElement) => {
      const media = videoElement;
      media.volume = normalized;
    });
  }

  async captureScreenshot(): Promise<ScreenshotResult> {
    const globalWithOverride = globalThis as Record<string, any>;
    const overridden = globalWithOverride.__PLAYER_SCREENSHOT_BASE64__;

    if (typeof overridden === 'string' && overridden.length > 0) {
      return {
        format: 'image/png',
        base64: overridden,
        source: 'real',
      };
    }

    throw new AppError(
      'SCREENSHOT_FAILED',
      'Screenshot API is not available in fallback adapter',
    );
  }

  onVisibilityChange(handler: (state: VisibilityState) => void): () => void {
    if (typeof document === 'undefined') {
      return () => undefined;
    }

    const listener = (): void => {
      handler(document.hidden ? 'hidden' : 'visible');
    };

    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  }

  onLifecycleChange(handler: (state: LifecycleState) => void): () => void {
    if (typeof window === 'undefined') {
      return () => undefined;
    }

    const blur = (): void => handler('suspend');
    const focus = (): void => handler('resume');

    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);

    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
    };
  }

  private resolveDeviceId(): string {
    const globalWithStorage = globalThis as Record<string, any>;

    const cacheKey = 'player_device_id';
    const localStorageApi = globalWithStorage.localStorage as
      | Storage
      | undefined;
    const existing = localStorageApi?.getItem(cacheKey);

    if (existing) {
      return existing;
    }

    const generated = `web-${Math.random().toString(16).slice(2, 12)}`;
    localStorageApi?.setItem(cacheKey, generated);
    return generated;
  }
}
