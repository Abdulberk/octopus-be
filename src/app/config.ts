import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogLevel } from '../core/contracts/logger';
import type { RetryPolicy } from '../core/domain/retry';

export interface AppConfig {
  deviceId: string;
  playlist: {
    endpoint: string;
    syncIntervalMs: number;
    downloadTimeoutMs: number;
  };
  mqtt: {
    transport: 'node-mqtt' | 'memory';
    brokerUrl: string;
    username?: string;
    password?: string;
    clientId: string;
    commandTopic: string;
    eventsTopic: string;
    statusTopic: string;
    commandQos: 0 | 1 | 2;
    eventQos: 0 | 1 | 2;
    statusQos: 0 | 1 | 2;
    retryPolicy: RetryPolicy;
    heartbeatIntervalMs: number;
  };
  cache: {
    root: string;
    manifestFileName: string;
  };
  playback: {
    loop: boolean;
    defaultImageDurationSec: number;
  };
  logging: {
    level: LogLevel;
  };
  idempotency: {
    ttlMs: number;
    maxEntries: number;
  };
}

type PartialConfig = Partial<AppConfig> & Record<string, unknown>;

export function loadAppConfig(
  cwd = process.cwd(),
  env = process.env,
): AppConfig {
  const defaults = readConfigFile(join(cwd, 'config', 'default.json'));
  const envName = env.NODE_ENV === 'production' ? 'production' : 'development';
  const profile = readConfigFile(join(cwd, 'config', `${envName}.json`));
  const merged = deepMerge(defaults, profile);

  const deviceId = env.DEVICE_ID ?? String(merged.deviceId ?? 'player-local');
  const commandTopic = `players/${deviceId}/commands`;
  const eventsTopic = `players/${deviceId}/events`;
  const statusTopic = `players/${deviceId}/status`;

  return {
    deviceId,
    playlist: {
      endpoint:
        env.PLAYLIST_ENDPOINT ??
        String(
          readPath(
            merged,
            'playlist.endpoint',
            'http://localhost:4000/playlist/v1',
          ),
        ),
      syncIntervalMs: Number(
        env.PLAYLIST_SYNC_INTERVAL_MS ??
          readPath(merged, 'playlist.syncIntervalMs', 60_000),
      ),
      downloadTimeoutMs: Number(
        env.PLAYLIST_DOWNLOAD_TIMEOUT_MS ??
          readPath(merged, 'playlist.downloadTimeoutMs', 15_000),
      ),
    },
    mqtt: {
      transport:
        (env.MQTT_TRANSPORT as 'node-mqtt' | 'memory') ??
        (readPath(merged, 'mqtt.transport', 'memory') as
          | 'node-mqtt'
          | 'memory'),
      brokerUrl:
        env.MQTT_BROKER_URL ??
        String(readPath(merged, 'mqtt.brokerUrl', 'mqtt://localhost:1883')),
      username:
        env.MQTT_USERNAME ??
        (readPath(merged, 'mqtt.username', undefined) as string | undefined),
      password:
        env.MQTT_PASSWORD ??
        (readPath(merged, 'mqtt.password', undefined) as string | undefined),
      clientId:
        env.MQTT_CLIENT_ID ??
        String(readPath(merged, 'mqtt.clientId', `${deviceId}-client`)),
      commandTopic,
      eventsTopic,
      statusTopic,
      commandQos: Number(readPath(merged, 'mqtt.commandQos', 1)) as 0 | 1 | 2,
      eventQos: Number(readPath(merged, 'mqtt.eventQos', 1)) as 0 | 1 | 2,
      statusQos: Number(readPath(merged, 'mqtt.statusQos', 0)) as 0 | 1 | 2,
      retryPolicy: {
        initialDelayMs: Number(
          readPath(merged, 'mqtt.retryPolicy.initialDelayMs', 1_000),
        ),
        maxDelayMs: Number(
          readPath(merged, 'mqtt.retryPolicy.maxDelayMs', 60_000),
        ),
        multiplier: Number(readPath(merged, 'mqtt.retryPolicy.multiplier', 2)),
        jitterRatio: Number(
          readPath(merged, 'mqtt.retryPolicy.jitterRatio', 0.2),
        ),
      },
      heartbeatIntervalMs: Number(
        env.MQTT_HEARTBEAT_INTERVAL_MS ??
          readPath(merged, 'mqtt.heartbeatIntervalMs', 30_000),
      ),
    },
    cache: {
      root:
        env.CACHE_ROOT ??
        String(readPath(merged, 'cache.root', '.player-data')),
      manifestFileName: String(
        readPath(merged, 'cache.manifestFileName', 'manifest.json'),
      ),
    },
    playback: {
      loop: readPath(merged, 'playback.loop', true) !== false,
      defaultImageDurationSec: Number(
        readPath(merged, 'playback.defaultImageDurationSec', 10),
      ),
    },
    logging: {
      level:
        (env.LOG_LEVEL as LogLevel) ??
        (readPath(merged, 'logging.level', 'info') as LogLevel),
    },
    idempotency: {
      ttlMs: Number(readPath(merged, 'idempotency.ttlMs', 5 * 60_000)),
      maxEntries: Number(readPath(merged, 'idempotency.maxEntries', 1000)),
    },
  };
}

function readConfigFile(path: string): PartialConfig {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as PartialConfig;
  } catch {
    return {};
  }
}

function deepMerge<T extends Record<string, any>>(base: T, override: T): T {
  const output: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existing = output[key];
    if (isObject(value) && isObject(existing)) {
      output[key] = deepMerge(existing, value);
      continue;
    }
    output[key] = value;
  }

  return output as T;
}

function readPath(
  object: Record<string, unknown>,
  path: string,
  fallback: unknown,
): unknown {
  const tokens = path.split('.');
  let current: unknown = object;

  for (const token of tokens) {
    if (!isObject(current) || !(token in current)) {
      return fallback;
    }
    current = current[token];
  }

  return current ?? fallback;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
