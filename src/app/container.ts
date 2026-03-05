import type { CommandHandler } from '../core/contracts/command-handler';
import type { PlatformAdapter } from '../core/contracts/platform';
import type { PlaybackRenderer } from '../core/contracts/renderer';
import type { CommandName } from '../core/domain/commands';
import type { CommandResultEvent } from '../core/domain/events';
import { AppError } from '../core/errors/app-error';
import { InMemoryMqttTransport } from '../infrastructure/mqtt/in-memory-mqtt-transport';
import { MqttClientService } from '../infrastructure/mqtt/mqtt-client-service';
import { NodeMqttTransport } from '../infrastructure/mqtt/node-mqtt-transport';
import { FetchHttpClient } from '../infrastructure/network/fetch-http-client';
import { StructuredLogger } from '../infrastructure/logging/structured-logger';
import { FileStorage } from '../infrastructure/storage/file-storage';
import { TizenPlatformAdapter } from '../platform/tizen/tizen-platform-adapter';
import { WebFallbackPlatformAdapter } from '../platform/web/web-fallback-platform-adapter';
import { PlaybackEngine } from '../player/engine/playback-engine';
import { DomRenderer } from '../player/renderers/dom-renderer';
import { HeadlessRenderer } from '../player/renderers/headless-renderer';
import { CommandDispatcher } from '../services/commands/command-dispatcher';
import { IdempotencyStore } from '../services/commands/idempotency-store';
import { LifecycleManager } from '../services/lifecycle/lifecycle-manager';
import { PlaylistSyncService } from '../services/playlist/playlist-sync-service';
import { ScreenshotService } from '../services/screenshot/screenshot-service';
import type { AppConfig } from './config';
import { PlayerRuntime } from './runtime';

export function createRuntime(config: AppConfig): PlayerRuntime {
  const logger = new StructuredLogger({ level: config.logging.level });
  const storage = new FileStorage();
  const httpClient = new FetchHttpClient();

  const platformAdapter = createPlatformAdapter();
  const renderer = createRenderer();

  const playbackEngine = new PlaybackEngine(renderer, logger, {
    loop: config.playback.loop,
    defaultImageDurationSec: config.playback.defaultImageDurationSec,
  });

  const playlistSyncService = new PlaylistSyncService(
    httpClient,
    storage,
    logger,
    {
      endpoint: config.playlist.endpoint,
      cacheRoot: config.cache.root,
      manifestFileName: config.cache.manifestFileName,
      downloadTimeoutMs: config.playlist.downloadTimeoutMs,
    },
  );

  const transport = createMqttTransport(config, logger);
  const mqttClientService = new MqttClientService(transport, logger, {
    commandTopic: config.mqtt.commandTopic,
    eventsTopic: config.mqtt.eventsTopic,
    statusTopic: config.mqtt.statusTopic,
    commandQos: config.mqtt.commandQos,
    eventQos: config.mqtt.eventQos,
    statusQos: config.mqtt.statusQos,
    reconnectPolicy: config.mqtt.retryPolicy,
    heartbeatIntervalMs: config.mqtt.heartbeatIntervalMs,
  });

  const screenshotService = new ScreenshotService(platformAdapter, logger);
  const idempotencyStore = new IdempotencyStore<CommandResultEvent>({
    ttlMs: config.idempotency.ttlMs,
    maxEntries: config.idempotency.maxEntries,
  });

  const runtimeRef: { current?: PlayerRuntime } = {};
  const handlers: Partial<Record<CommandName, CommandHandler>> = {
    reload_playlist: async () => {
      const result = await playlistSyncService.syncRemote();
      await playbackEngine.loadPlaylist(result.playlist);
      if (playbackEngine.getState() !== 'paused') {
        await playbackEngine.play();
      }

      return {
        source: result.source,
        changed: result.changed,
        version: result.version,
      };
    },
    restart_player: async () => {
      if (!runtimeRef.current) {
        throw new AppError('RUNTIME_UNAVAILABLE', 'Runtime is not initialized');
      }
      await runtimeRef.current.softRestart();
      return { restarted: true };
    },
    play: async () => {
      await playbackEngine.play();
      return {
        state: playbackEngine.getState(),
      };
    },
    pause: async () => {
      await playbackEngine.pause();
      return {
        state: playbackEngine.getState(),
      };
    },
    set_volume: async (command) => {
      const volume = command.payload?.volume;
      if (typeof volume !== 'number') {
        throw new AppError(
          'INVALID_COMMAND',
          'set_volume requires numeric volume',
        );
      }

      await platformAdapter.setVolume(volume);
      await renderer.setVolume(volume / 100);

      return {
        volume,
      };
    },
    screenshot: async () => {
      const screenshot = await screenshotService.captureWithFallback();
      return {
        format: screenshot.format,
        base64: screenshot.base64,
        source: screenshot.source,
      };
    },
  };

  const commandDispatcher = new CommandDispatcher(
    handlers,
    logger,
    idempotencyStore,
    {
      deviceId: config.deviceId,
    },
  );

  const lifecycleManager = new LifecycleManager(
    platformAdapter,
    {
      onPause: async () => playbackEngine.pause(),
      onResume: async () => playbackEngine.play(),
    },
    logger,
  );

  runtimeRef.current = new PlayerRuntime(
    logger,
    playlistSyncService,
    playbackEngine,
    mqttClientService,
    commandDispatcher,
    lifecycleManager,
    {
      playlistSyncIntervalMs: config.playlist.syncIntervalMs,
    },
  );

  return runtimeRef.current;
}

function createPlatformAdapter(): PlatformAdapter {
  const globalApi = globalThis as Record<string, unknown>;
  if ('tizen' in globalApi) {
    return new TizenPlatformAdapter();
  }

  return new WebFallbackPlatformAdapter();
}

function createRenderer(): PlaybackRenderer {
  if (typeof document !== 'undefined') {
    return new DomRenderer('player-root');
  }

  return new HeadlessRenderer();
}

function createMqttTransport(config: AppConfig, logger: StructuredLogger) {
  if (config.mqtt.transport === 'node-mqtt') {
    try {
      return new NodeMqttTransport(
        {
          brokerUrl: config.mqtt.brokerUrl,
          username: config.mqtt.username,
          password: config.mqtt.password,
          clientId: config.mqtt.clientId,
        },
        logger,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      logger.warn(
        'Node MQTT transport initialization failed, falling back to in-memory',
        {
          message,
        },
      );
      return new InMemoryMqttTransport();
    }
  }

  return new InMemoryMqttTransport();
}
