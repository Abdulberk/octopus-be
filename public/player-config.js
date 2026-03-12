(function setPlayerConfig() {
  'use strict';

  var runtime =
    typeof window !== 'undefined' ? window : {};
  var existing = runtime.__PLAYER_CONFIG__ || {};
  var explicitHost =
    typeof runtime.__PLAYER_HOST__ === 'string' &&
    runtime.__PLAYER_HOST__.length > 0
      ? runtime.__PLAYER_HOST__
      : typeof existing.host === 'string' && existing.host.length > 0
        ? existing.host
        : undefined;

  var defaults = {
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
  };

  if (explicitHost) {
    defaults.host = explicitHost;
    defaults.playlistEndpoint = 'http://' + explicitHost + ':4000/playlist/v1';
    defaults.mqttUrl = 'ws://' + explicitHost + ':9001/mqtt';
  }

  runtime.__PLAYER_CONFIG__ = Object.assign(defaults, existing);
})();
