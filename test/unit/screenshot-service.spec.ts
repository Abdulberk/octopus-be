import type { Logger } from '../../src/core/contracts/logger';
import type { PlatformAdapter } from '../../src/core/contracts/platform';
import { ScreenshotService } from '../../src/services/screenshot/screenshot-service';

const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe('ScreenshotService', () => {
  it('falls back to mock screenshot when platform API fails', async () => {
    const adapter: PlatformAdapter = {
      getDeviceInfo: async () => ({
        deviceId: 'device-1',
        platform: 'web',
      }),
      setVolume: async () => undefined,
      captureScreenshot: async () => {
        throw new Error('not-supported');
      },
      onVisibilityChange: () => () => undefined,
      onLifecycleChange: () => () => undefined,
    };

    const service = new ScreenshotService(adapter, noopLogger);
    const result = await service.captureWithFallback();

    expect(result.source).toBe('mock');
    expect(result.format).toBe('image/png');
    expect(result.base64.length).toBeGreaterThan(20);
  });
});
