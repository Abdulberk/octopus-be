import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAppConfig } from '../../src/app/config';

describe('loadAppConfig', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'player-config-'));
    await mkdir(join(rootDir, 'config'), { recursive: true });
    await writeFile(
      join(rootDir, 'config', 'default.json'),
      JSON.stringify({
        deviceId: 'device-1',
        playlist: {
          endpoint: 'http://playlist.example.com/v1',
          syncIntervalMs: 30_000,
          downloadTimeoutMs: 15_000,
        },
        mqtt: {
          transport: 'node-mqtt',
          brokerUrl: 'mqtt://broker.example.com:1883',
          clientId: 'device-1-client',
          commandQos: 1,
          eventQos: 1,
          statusQos: 0,
          heartbeatIntervalMs: 30_000,
          retryPolicy: {
            initialDelayMs: 1_000,
            maxDelayMs: 60_000,
            multiplier: 2,
            jitterRatio: 0.2,
          },
        },
        cache: {
          root: '.player-data',
          manifestFileName: 'manifest.json',
        },
        playback: {
          loop: true,
          defaultImageDurationSec: 10,
        },
        logging: {
          level: 'info',
        },
        idempotency: {
          ttlMs: 300_000,
          maxEntries: 1000,
        },
      }),
    );
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('fails fast when a config file contains malformed JSON', async () => {
    await writeFile(join(rootDir, 'config', 'development.json'), '{invalid');

    expect(() => loadAppConfig(rootDir, {} as NodeJS.ProcessEnv)).toThrow(
      'Configuration file "development" is invalid',
    );
  });

  it('rejects in-memory MQTT transport in production mode', () => {
    expect(() =>
      loadAppConfig(rootDir, {
        NODE_ENV: 'production',
        MQTT_TRANSPORT: 'memory',
      } as NodeJS.ProcessEnv),
    ).toThrow('Production runtime requires mqtt.transport to be "node-mqtt"');
  });
});
