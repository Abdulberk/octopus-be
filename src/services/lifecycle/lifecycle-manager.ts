import type { Logger } from '../../core/contracts/logger';
import type { PlatformAdapter } from '../../core/contracts/platform';

interface LifecycleManagerCallbacks {
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
}

export class LifecycleManager {
  private unsubscribeVisibility?: () => void;
  private unsubscribeLifecycle?: () => void;

  constructor(
    private readonly platformAdapter: PlatformAdapter,
    private readonly callbacks: LifecycleManagerCallbacks,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.unsubscribeVisibility = this.platformAdapter.onVisibilityChange(
      (state) => {
        if (state === 'hidden') {
          this.logger.info('Visibility changed to hidden. Pausing playback.');
          void this.callbacks.onPause();
          return;
        }

        this.logger.info('Visibility changed to visible. Resuming playback.');
        void this.callbacks.onResume();
      },
    );

    if (this.platformAdapter.onLifecycleChange) {
      this.unsubscribeLifecycle = this.platformAdapter.onLifecycleChange(
        (state) => {
          if (state === 'suspend') {
            this.logger.info('Lifecycle changed to suspend. Pausing playback.');
            void this.callbacks.onPause();
            return;
          }

          this.logger.info('Lifecycle changed to resume. Resuming playback.');
          void this.callbacks.onResume();
        },
      );
    }
  }

  stop(): void {
    this.unsubscribeVisibility?.();
    this.unsubscribeLifecycle?.();
  }
}
