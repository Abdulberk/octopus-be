(function setPlayerConfig() {
  'use strict';

  var host = '192.168.1.10';

  window.__PLAYER_CONFIG__ = Object.assign(
    {
      host: host,
      playlistEndpoint: 'http://' + host + ':4000/playlist/v1',
      mqttUrl: 'ws://' + host + ':9001/mqtt',
      mqttConnectTimeoutMs: 7_000,
      playlistSyncIntervalMs: 30_000,
      playlistDownloadTimeoutMs: 15_000,
      heartbeatIntervalMs: 30_000,
      commandQos: 1,
      eventQos: 1,
      statusQos: 0,
      loop: true,
      defaultImageDurationSec: 10,
      idempotencyTtlMs: 5 * 60_000,
      idempotencyMaxEntries: 1_000,
      reconnectInitialMs: 1_000,
      reconnectMaxMs: 60_000,
      reconnectMultiplier: 2,
      reconnectJitterRatio: 0.2,
    },
    window.__PLAYER_CONFIG__ || {},
  );
})();
