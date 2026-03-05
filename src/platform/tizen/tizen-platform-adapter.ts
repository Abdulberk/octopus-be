import type {
  DeviceInfo,
  LifecycleState,
  PlatformAdapter,
  ScreenshotResult,
  VisibilityState,
} from '../../core/contracts/platform';
import { AppError } from '../../core/errors/app-error';

export class TizenPlatformAdapter implements PlatformAdapter {
  async getDeviceInfo(): Promise<DeviceInfo> {
    const globalApi = globalThis as Record<string, any>;
    const tizenApi = globalApi.tizen;

    let model: string | undefined;
    let firmware: string | undefined;

    try {
      model = tizenApi?.systeminfo?.getCapability?.(
        'http://tizen.org/feature/platform.version',
      );
      firmware = tizenApi?.systeminfo?.getCapability?.(
        'http://tizen.org/feature/network.wifi',
      );
    } catch {
      // Capability access is optional in fallback environments.
    }

    return {
      deviceId: await this.resolveDeviceId(),
      model,
      firmware,
      platform: 'tizen',
    };
  }

  async setVolume(value: number): Promise<void> {
    const normalized = Math.max(0, Math.min(100, value));
    const globalApi = globalThis as Record<string, any>;

    try {
      globalApi.webapis?.avplay?.setVolume?.(normalized);
      return;
    } catch {
      // Continue to fallback below.
    }

    throw new AppError(
      'VOLUME_UNSUPPORTED',
      'Volume control API is unavailable on this platform',
    );
  }

  async captureScreenshot(): Promise<ScreenshotResult> {
    const globalApi = globalThis as Record<string, any>;

    const maybeCapture = globalApi.webapis?.capture;
    if (maybeCapture && typeof maybeCapture.getScreenShot === 'function') {
      const encoded = maybeCapture.getScreenShot();
      if (typeof encoded === 'string' && encoded.length > 0) {
        return {
          format: 'image/png',
          base64: encoded,
          source: 'real',
        };
      }
    }

    throw new AppError(
      'SCREENSHOT_FAILED',
      'Platform screenshot API not available or permission denied',
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
    const globalApi = globalThis as Record<string, any>;
    const app = globalApi.tizen?.application?.getCurrentApplication?.();
    if (!app || typeof app.addEventListener !== 'function') {
      return () => undefined;
    }

    const pauseId = app.addEventListener('pause', () => handler('suspend'));
    const resumeId = app.addEventListener('resume', () => handler('resume'));

    return () => {
      app.removeEventListener?.(pauseId);
      app.removeEventListener?.(resumeId);
    };
  }

  private async resolveDeviceId(): Promise<string> {
    const globalApi = globalThis as Record<string, any>;

    try {
      const id = globalApi.webapis?.productinfo?.getDuid?.();
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    } catch {
      // continue fallback
    }

    return 'tizen-unknown-device';
  }
}
