import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogLevel } from '../core/contracts/logger';
import type { RetryPolicy } from '../core/domain/retry';
import { AppError } from '../core/errors/app-error';

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
    tls?: {
      caPath?: string;
      certPath?: string;
      keyPath?: string;
      passphrase?: string;
      rejectUnauthorized: boolean;
      serverName?: string;
    };
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
  const defaults = readConfigFile(join(cwd, 'config', 'default.json'), {
    required: true,
    name: 'default',
  });
  const envName = env.NODE_ENV === 'production' ? 'production' : 'development';
  const profile = readConfigFile(join(cwd, 'config', `${envName}.json`), {
    required: false,
    name: envName,
  });
  const merged = deepMerge(defaults, profile);

  const deviceId = readNonEmptyString(
    env.DEVICE_ID ?? merged.deviceId,
    'deviceId',
    'player-local',
  );
  const commandTopic = `players/${deviceId}/commands`;
  const eventsTopic = `players/${deviceId}/events`;
  const statusTopic = `players/${deviceId}/status`;
  const mqttTransport = readEnum(
    env.MQTT_TRANSPORT ?? readPath(merged, 'mqtt.transport', 'memory'),
    'mqtt.transport',
    ['node-mqtt', 'memory'],
  );

  if (envName === 'production' && mqttTransport !== 'node-mqtt') {
    throw new AppError(
      'CONFIG_INVALID',
      'Production runtime requires mqtt.transport to be "node-mqtt"',
      false,
    );
  }

  return {
    deviceId,
    playlist: {
      endpoint: readNonEmptyString(
        env.PLAYLIST_ENDPOINT ??
          readPath(
            merged,
            'playlist.endpoint',
            'http://localhost:4000/playlist/v1',
          ),
        'playlist.endpoint',
      ),
      syncIntervalMs: readPositiveNumber(
        env.PLAYLIST_SYNC_INTERVAL_MS ??
          readPath(merged, 'playlist.syncIntervalMs', 60_000),
        'playlist.syncIntervalMs',
      ),
      downloadTimeoutMs: readPositiveNumber(
        env.PLAYLIST_DOWNLOAD_TIMEOUT_MS ??
          readPath(merged, 'playlist.downloadTimeoutMs', 15_000),
        'playlist.downloadTimeoutMs',
      ),
    },
    mqtt: {
      transport: mqttTransport,
      brokerUrl: readNonEmptyString(
        env.MQTT_BROKER_URL ??
          readPath(merged, 'mqtt.brokerUrl', 'mqtt://localhost:1883'),
        'mqtt.brokerUrl',
      ),
      username:
        env.MQTT_USERNAME ??
        (readPath(merged, 'mqtt.username', undefined) as string | undefined),
      password:
        env.MQTT_PASSWORD ??
        (readPath(merged, 'mqtt.password', undefined) as string | undefined),
      clientId: readNonEmptyString(
        env.MQTT_CLIENT_ID ??
          readPath(merged, 'mqtt.clientId', `${deviceId}-client`),
        'mqtt.clientId',
      ),
      tls: readMqttTlsConfig(env, merged),
      commandTopic,
      eventsTopic,
      statusTopic,
      commandQos: readQos(
        readPath(merged, 'mqtt.commandQos', 1),
        'mqtt.commandQos',
      ),
      eventQos: readQos(readPath(merged, 'mqtt.eventQos', 1), 'mqtt.eventQos'),
      statusQos: readQos(
        readPath(merged, 'mqtt.statusQos', 0),
        'mqtt.statusQos',
      ),
      retryPolicy: {
        initialDelayMs: readPositiveNumber(
          readPath(merged, 'mqtt.retryPolicy.initialDelayMs', 1_000),
          'mqtt.retryPolicy.initialDelayMs',
        ),
        maxDelayMs: readPositiveNumber(
          readPath(merged, 'mqtt.retryPolicy.maxDelayMs', 60_000),
          'mqtt.retryPolicy.maxDelayMs',
        ),
        multiplier: readPositiveNumber(
          readPath(merged, 'mqtt.retryPolicy.multiplier', 2),
          'mqtt.retryPolicy.multiplier',
        ),
        jitterRatio: readNumberInRange(
          readPath(merged, 'mqtt.retryPolicy.jitterRatio', 0.2),
          'mqtt.retryPolicy.jitterRatio',
          0,
          1,
        ),
      },
      heartbeatIntervalMs: readPositiveNumber(
        env.MQTT_HEARTBEAT_INTERVAL_MS ??
          readPath(merged, 'mqtt.heartbeatIntervalMs', 30_000),
        'mqtt.heartbeatIntervalMs',
      ),
    },
    cache: {
      root: readNonEmptyString(
        env.CACHE_ROOT ?? readPath(merged, 'cache.root', '.player-data'),
        'cache.root',
      ),
      manifestFileName: readNonEmptyString(
        readPath(merged, 'cache.manifestFileName', 'manifest.json'),
        'cache.manifestFileName',
      ),
    },
    playback: {
      loop: readPath(merged, 'playback.loop', true) !== false,
      defaultImageDurationSec: readPositiveNumber(
        readPath(merged, 'playback.defaultImageDurationSec', 10),
        'playback.defaultImageDurationSec',
      ),
    },
    logging: {
      level: readEnum(
        env.LOG_LEVEL ?? readPath(merged, 'logging.level', 'info'),
        'logging.level',
        ['debug', 'info', 'warn', 'error'],
      ) as LogLevel,
    },
    idempotency: {
      ttlMs: readPositiveNumber(
        readPath(merged, 'idempotency.ttlMs', 5 * 60_000),
        'idempotency.ttlMs',
      ),
      maxEntries: readPositiveNumber(
        readPath(merged, 'idempotency.maxEntries', 1000),
        'idempotency.maxEntries',
      ),
    },
  };
}

function readConfigFile(
  path: string,
  options: { required: boolean; name: string },
): PartialConfig {
  if (!existsSync(path)) {
    if (!options.required) {
      return {};
    }

    throw new AppError(
      'CONFIG_NOT_FOUND',
      `Configuration file "${options.name}" was not found at ${path}`,
      false,
    );
  }

  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as PartialConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    throw new AppError(
      'CONFIG_INVALID',
      `Configuration file "${options.name}" is invalid: ${message}`,
      false,
    );
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

function readNonEmptyString(
  value: unknown,
  label: string,
  fallback?: string,
): string {
  const candidate =
    typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate;
  }

  throw new AppError(
    'CONFIG_INVALID',
    `Configuration value "${label}" must be a non-empty string`,
    false,
  );
}

function readPositiveNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  throw new AppError(
    'CONFIG_INVALID',
    `Configuration value "${label}" must be a positive number`,
    false,
  );
}

function readNumberInRange(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
    return parsed;
  }

  throw new AppError(
    'CONFIG_INVALID',
    `Configuration value "${label}" must be between ${min} and ${max}`,
    false,
  );
}

function readEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T;
  }

  throw new AppError(
    'CONFIG_INVALID',
    `Configuration value "${label}" must be one of: ${allowed.join(', ')}`,
    false,
  );
}

function readQos(value: unknown, label: string): 0 | 1 | 2 {
  const parsed = Number(value);
  if (parsed === 0 || parsed === 1 || parsed === 2) {
    return parsed;
  }

  throw new AppError(
    'CONFIG_INVALID',
    `Configuration value "${label}" must be 0, 1, or 2`,
    false,
  );
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  throw new AppError(
    'CONFIG_INVALID',
    `Configuration value "${label}" must be a boolean`,
    false,
  );
}

function readMqttTlsConfig(
  env: NodeJS.ProcessEnv,
  merged: PartialConfig,
): AppConfig['mqtt']['tls'] | undefined {
  const rejectUnauthorizedValue =
    env.MQTT_REJECT_UNAUTHORIZED ??
    readPath(merged, 'mqtt.tls.rejectUnauthorized', undefined);
  const caPath = readOptionalString(
    env.MQTT_CA_PATH ?? readPath(merged, 'mqtt.tls.caPath', undefined),
  );
  const certPath = readOptionalString(
    env.MQTT_CERT_PATH ?? readPath(merged, 'mqtt.tls.certPath', undefined),
  );
  const keyPath = readOptionalString(
    env.MQTT_KEY_PATH ?? readPath(merged, 'mqtt.tls.keyPath', undefined),
  );
  const passphrase = readOptionalString(
    env.MQTT_KEY_PASSPHRASE ??
      readPath(merged, 'mqtt.tls.passphrase', undefined),
  );
  const serverName = readOptionalString(
    env.MQTT_SERVER_NAME ?? readPath(merged, 'mqtt.tls.serverName', undefined),
  );
  const rejectUnauthorized =
    rejectUnauthorizedValue === undefined
      ? true
      : readBoolean(rejectUnauthorizedValue, 'mqtt.tls.rejectUnauthorized');
  const tlsConfigured =
    rejectUnauthorizedValue !== undefined ||
    !!caPath ||
    !!certPath ||
    !!keyPath ||
    !!passphrase ||
    !!serverName;

  if (!tlsConfigured) {
    return undefined;
  }

  return {
    caPath,
    certPath,
    keyPath,
    passphrase,
    rejectUnauthorized,
    serverName,
  };
}
