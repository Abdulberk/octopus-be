import type { Logger } from '../core/contracts/logger';
import { MqttClientService } from '../infrastructure/mqtt/mqtt-client-service';
import { PlaybackEngine } from '../player/engine/playback-engine';
import { CommandDispatcher } from '../services/commands/command-dispatcher';
import { LifecycleManager } from '../services/lifecycle/lifecycle-manager';
import { PlaylistSyncService } from '../services/playlist/playlist-sync-service';

interface RuntimeOptions {
  playlistSyncIntervalMs: number;
}

export class PlayerRuntime {
  private playlistSyncTimer?: NodeJS.Timeout;
  private degraded = false;

  constructor(
    private readonly logger: Logger,
    private readonly playlistSyncService: PlaylistSyncService,
    private readonly playbackEngine: PlaybackEngine,
    private readonly mqttClientService: MqttClientService,
    private readonly commandDispatcher: CommandDispatcher,
    private readonly lifecycleManager: LifecycleManager,
    private readonly options: RuntimeOptions,
  ) {}

  async start(): Promise<void> {
    this.logger.info('Player runtime startup started');

    const cachedManifest = await this.playlistSyncService.initializeFromCache();
    if (cachedManifest && cachedManifest.playlist.length > 0) {
      await this.playbackEngine.loadPlaylist(cachedManifest.playlist);
      await this.playbackEngine.play();
    }

    await this.safeSyncPlaylistAndApply('startup');
    await this.mqttClientService.start(async (payload) => {
      await this.handleIncomingCommand(payload);
    });
    this.lifecycleManager.start();

    this.playlistSyncTimer = setInterval(() => {
      void this.safeSyncPlaylistAndApply('interval');
    }, this.options.playlistSyncIntervalMs);

    this.logger.info('Player runtime startup completed');
  }

  async stop(): Promise<void> {
    if (this.playlistSyncTimer) {
      clearInterval(this.playlistSyncTimer);
      this.playlistSyncTimer = undefined;
    }

    this.lifecycleManager.stop();
    await this.mqttClientService.stop();
    await this.playbackEngine.dispose();
  }

  async softRestart(): Promise<void> {
    this.logger.info('Soft restart requested');
    await this.playbackEngine.stop();
    await this.safeSyncPlaylistAndApply('restart');
  }

  private async syncPlaylistAndApply(
    reason: 'startup' | 'interval' | 'restart',
  ): Promise<void> {
    const syncResult = await this.playlistSyncService.syncRemote();
    const playbackState = this.playbackEngine.getState();

    const shouldReloadPlaylist =
      reason === 'restart' || syncResult.changed === true;

    if (shouldReloadPlaylist) {
      await this.playbackEngine.loadPlaylist(syncResult.playlist);
    }

    if (shouldReloadPlaylist && playbackState !== 'paused') {
      await this.playbackEngine.play();
      return;
    }

    if (!shouldReloadPlaylist && playbackState === 'idle') {
      await this.playbackEngine.play();
    }
  }

  private async safeSyncPlaylistAndApply(
    reason: 'startup' | 'interval' | 'restart',
  ): Promise<void> {
    try {
      await this.syncPlaylistAndApply(reason);
      if (this.degraded) {
        this.degraded = false;
        this.logger.info('Runtime recovered from degraded mode', { reason });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.degraded = true;
      this.logger.warn(
        'Playlist sync failed, runtime continues in degraded mode',
        {
          reason,
          message,
        },
      );
    }
  }

  private async handleIncomingCommand(payload: string): Promise<void> {
    const result = await this.commandDispatcher.dispatch(payload);

    try {
      await this.mqttClientService.publishCommandResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn('Failed to publish command result', {
        command: result.command,
        correlationId: result.correlationId,
        message,
      });
    }
  }
}
