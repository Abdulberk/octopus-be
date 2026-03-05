import type { Logger } from '../../core/contracts/logger';
import type {
  PlatformAdapter,
  ScreenshotResult,
} from '../../core/contracts/platform';
import { MOCK_SCREENSHOT_BASE64 } from '../../platform/screenshot';

export class ScreenshotService {
  constructor(
    private readonly platformAdapter: PlatformAdapter,
    private readonly logger: Logger,
  ) {}

  async captureWithFallback(): Promise<ScreenshotResult> {
    try {
      return await this.platformAdapter.captureScreenshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(
        'Platform screenshot capture failed. Using fallback mock.',
        {
          message,
        },
      );

      return {
        format: 'image/png',
        base64: MOCK_SCREENSHOT_BASE64,
        source: 'mock',
      };
    }
  }
}
