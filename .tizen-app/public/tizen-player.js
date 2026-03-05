(function bootstrapTizenPlayer() {
  'use strict';

  var DEFAULTS = {
    playlistEndpoint: 'http://localhost:4000/playlist/v1',
    playlistSyncIntervalMs: 30_000,
    mqttUrl: 'ws://localhost:9001/mqtt',
    mqttConnectTimeoutMs: 7_000,
    heartbeatIntervalMs: 30_000,
    idempotencyTtlMs: 5 * 60_000,
    idempotencyMaxEntries: 1_000,
    reconnectInitialMs: 1_000,
    reconnectMaxMs: 60_000,
    reconnectMultiplier: 2,
    reconnectJitterRatio: 0.2,
    commandQos: 1,
    eventQos: 1,
    statusQos: 0,
    loop: true,
    defaultImageDurationSec: 10,
  };

  var state = {
    playlist: [],
    index: 0,
    playing: false,
    paused: false,
    timer: null,
    currentVideo: null,
    currentImage: null,
    idempotency: new Map(),
    mqttClient: null,
    mqttConnected: false,
    mqttReconnectAttempt: 0,
    mqttReconnectTimer: null,
    heartbeatTimer: null,
    syncTimer: null,
    volume: 100,
  };

  var overlay = document.getElementById('status-overlay');
  var root = document.getElementById('player-root');

  function log(level, message, context) {
    var payload = {
      ts: Date.now(),
      level: level,
      message: message,
      context: context || {},
    };
    var serialized = JSON.stringify(payload);
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  function setOverlay(text) {
    if (overlay) {
      overlay.textContent = text;
    }
  }

  function getDeviceId() {
    var key = 'player_device_id';
    var existing = localStorage.getItem(key);
    if (existing) {
      return existing;
    }
    var generated = 'tizen-' + Math.random().toString(16).slice(2, 12);
    localStorage.setItem(key, generated);
    return generated;
  }

  var deviceId = getDeviceId();
  var config = {
    playlistEndpoint: DEFAULTS.playlistEndpoint,
    playlistSyncIntervalMs: DEFAULTS.playlistSyncIntervalMs,
    mqttUrl: DEFAULTS.mqttUrl,
    mqttConnectTimeoutMs: DEFAULTS.mqttConnectTimeoutMs,
    heartbeatIntervalMs: DEFAULTS.heartbeatIntervalMs,
    idempotencyTtlMs: DEFAULTS.idempotencyTtlMs,
    idempotencyMaxEntries: DEFAULTS.idempotencyMaxEntries,
    reconnectInitialMs: DEFAULTS.reconnectInitialMs,
    reconnectMaxMs: DEFAULTS.reconnectMaxMs,
    reconnectMultiplier: DEFAULTS.reconnectMultiplier,
    reconnectJitterRatio: DEFAULTS.reconnectJitterRatio,
    commandQos: DEFAULTS.commandQos,
    eventQos: DEFAULTS.eventQos,
    statusQos: DEFAULTS.statusQos,
    loop: DEFAULTS.loop,
    defaultImageDurationSec: DEFAULTS.defaultImageDurationSec,
    commandTopic: 'players/' + deviceId + '/commands',
    eventsTopic: 'players/' + deviceId + '/events',
    statusTopic: 'players/' + deviceId + '/status',
  };

  function parseJsonSafe(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function hashString(value) {
    var hash = 0;
    for (var i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return 'v-' + Math.abs(hash);
  }

  function manifestKey() {
    return 'player_manifest';
  }

  function saveManifest(manifest) {
    localStorage.setItem(manifestKey(), JSON.stringify(manifest));
  }

  function loadManifest() {
    var raw = localStorage.getItem(manifestKey());
    if (!raw) {
      return null;
    }
    return parseJsonSafe(raw);
  }

  function validatePlaylistResponse(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.playlist)) {
      throw new Error('PLAYLIST_INVALID');
    }

    var normalized = value.playlist.map(function normalize(item, index) {
      if (!item || typeof item !== 'object') {
        throw new Error('PLAYLIST_ITEM_INVALID');
      }

      if (item.type !== 'image' && item.type !== 'video') {
        throw new Error('PLAYLIST_ITEM_INVALID');
      }
      if (typeof item.url !== 'string' || item.url.length === 0) {
        throw new Error('PLAYLIST_ITEM_INVALID');
      }

      var candidateId = typeof item.id === 'string' && item.id.length > 0
        ? item.id
        : 'item-' + index + '-' + hashString(item.type + ':' + item.url + ':' + index);

      if (item.type === 'image') {
        if (typeof item.duration !== 'number' || item.duration <= 0) {
          throw new Error('PLAYLIST_ITEM_INVALID');
        }
        return {
          id: candidateId,
          type: 'image',
          url: item.url,
          duration: item.duration,
        };
      }

      return {
        id: candidateId,
        type: 'video',
        url: item.url,
      };
    });

    return {
      playlist: normalized,
      version: typeof value.version === 'string' && value.version.length > 0
        ? value.version
        : hashString(JSON.stringify(normalized)),
    };
  }

  async function syncPlaylist() {
    var response = await fetch(config.playlistEndpoint, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('HTTP_ERROR_' + response.status);
    }

    var payload = await response.json();
    var normalized = validatePlaylistResponse(payload);

    var manifest = {
      version: normalized.version,
      updatedAt: Date.now(),
      playlist: normalized.playlist,
    };

    saveManifest(manifest);
    return {
      source: 'remote',
      changed: true,
      version: manifest.version,
      playlist: manifest.playlist,
    };
  }

  function applyManifest(manifest) {
    state.playlist = manifest.playlist || [];
    if (state.index >= state.playlist.length) {
      state.index = 0;
    }
    log('info', 'Playlist applied', {
      itemCount: state.playlist.length,
      version: manifest.version,
    });
  }

  function stopCurrentMedia() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    if (state.currentVideo) {
      state.currentVideo.pause();
      state.currentVideo.removeAttribute('src');
      state.currentVideo.load();
      state.currentVideo.remove();
      state.currentVideo = null;
    }

    if (state.currentImage) {
      state.currentImage.remove();
      state.currentImage = null;
    }
  }

  function nextIndex() {
    if (state.playlist.length === 0) {
      state.index = 0;
      return;
    }

    var next = state.index + 1;
    if (next >= state.playlist.length) {
      state.index = config.loop ? 0 : state.playlist.length - 1;
      return;
    }
    state.index = next;
  }

  function renderCurrent() {
    if (!state.playing || state.paused) {
      return;
    }

    if (state.playlist.length === 0) {
      setOverlay('online | waiting for playlist');
      return;
    }

    var item = state.playlist[state.index];
    if (!item) {
      state.index = 0;
      return;
    }

    stopCurrentMedia();

    if (item.type === 'image') {
      var image = document.createElement('img');
      image.src = item.url;
      image.alt = 'signage-image';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.objectFit = 'contain';
      root.appendChild(image);
      state.currentImage = image;

      var durationMs = Math.max(250, Math.round((item.duration || config.defaultImageDurationSec) * 1000));
      state.timer = setTimeout(function onImageDone() {
        nextIndex();
        renderCurrent();
      }, durationMs);
    } else {
      var video = document.createElement('video');
      video.src = item.url;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.autoplay = true;
      video.controls = false;
      video.volume = state.volume / 100;
      video.addEventListener('ended', function onEnded() {
        nextIndex();
        renderCurrent();
      });
      video.addEventListener('error', function onError() {
        log('warn', 'Video playback failed, skipping item', {
          itemId: item.id,
          url: item.url,
        });
        nextIndex();
        renderCurrent();
      });
      root.appendChild(video);
      state.currentVideo = video;
      video.play().catch(function playError(error) {
        log('warn', 'Video play() failed, skipping item', {
          itemId: item.id,
          url: item.url,
          message: error && error.message ? error.message : 'unknown',
        });
        nextIndex();
        renderCurrent();
      });
    }
  }

  function play() {
    state.playing = true;
    state.paused = false;
    renderCurrent();
  }

  function pause() {
    state.paused = true;
    if (state.currentVideo) {
      state.currentVideo.pause();
    }
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function setVolume(volume) {
    var normalized = Math.max(0, Math.min(100, Number(volume)));
    state.volume = normalized;
    if (state.currentVideo) {
      state.currentVideo.volume = normalized / 100;
    }

    try {
      if (
        window.webapis &&
        window.webapis.avplay &&
        typeof window.webapis.avplay.setVolume === 'function'
      ) {
        window.webapis.avplay.setVolume(normalized);
      }
    } catch (error) {
      log('warn', 'Platform volume API unavailable', {
        message: error && error.message ? error.message : 'unknown',
      });
    }
  }

  async function captureScreenshot() {
    try {
      if (
        window.webapis &&
        window.webapis.capture &&
        typeof window.webapis.capture.getScreenShot === 'function'
      ) {
        var encoded = window.webapis.capture.getScreenShot();
        if (typeof encoded === 'string' && encoded.length > 0) {
          return {
            format: 'image/png',
            base64: encoded,
            source: 'real',
          };
        }
      }
    } catch (error) {
      log('warn', 'Platform screenshot API failed', {
        message: error && error.message ? error.message : 'unknown',
      });
    }

    return {
      format: 'image/png',
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgNf6x4sAAAAASUVORK5CYII=',
      source: 'mock',
    };
  }

  function cleanupIdempotency() {
    var now = Date.now();
    state.idempotency.forEach(function each(entry, key) {
      if (entry.expiresAt <= now) {
        state.idempotency.delete(key);
      }
    });

    while (state.idempotency.size > config.idempotencyMaxEntries) {
      var firstKey = state.idempotency.keys().next().value;
      if (!firstKey) {
        break;
      }
      state.idempotency.delete(firstKey);
    }
  }

  function publish(topic, payload, qos) {
    if (!state.mqttClient || !state.mqttConnected) {
      return;
    }
    state.mqttClient.publish(topic, JSON.stringify(payload), { qos: qos });
  }

  function publishStatus(status, details) {
    publish(config.statusTopic, {
      type: 'status',
      status: status,
      deviceId: deviceId,
      ts: Date.now(),
      details: details || {},
    }, config.statusQos);
  }

  async function dispatchCommand(rawPayload) {
    var payload = parseJsonSafe(rawPayload);
    if (!payload) {
      return {
        type: 'command_result',
        command: 'unknown',
        correlationId: 'generated-' + Date.now(),
        status: 'error',
        error: {
          code: 'INVALID_JSON',
          message: 'Command payload is not valid JSON',
        },
        deviceId: deviceId,
        ts: Date.now(),
      };
    }

    var command = payload.command;
    var correlationId = payload.correlationId;
    var timestamp = payload.timestamp;
    var body = payload.payload;

    if (typeof command !== 'string') {
      return commandError('unknown', correlationId, 'INVALID_COMMAND', 'Missing command');
    }
    if (typeof correlationId !== 'string' || correlationId.length === 0) {
      return commandError(command, 'generated-' + Date.now(), 'INVALID_COMMAND', 'Invalid correlationId');
    }
    if (typeof timestamp !== 'number') {
      return commandError(command, correlationId, 'INVALID_COMMAND', 'Invalid timestamp');
    }

    cleanupIdempotency();
    var idempotencyKey = command + ':' + correlationId;
    var existing = state.idempotency.get(idempotencyKey);
    if (existing) {
      return Object.assign({}, existing.value, {
        duplicate: true,
        ts: Date.now(),
      });
    }

    try {
      var resultPayload;

      if (command === 'reload_playlist') {
        var synced = await syncPlaylist();
        applyManifest({
          version: synced.version,
          playlist: synced.playlist,
        });
        if (!state.paused) {
          play();
        }
        resultPayload = {
          source: synced.source,
          changed: synced.changed,
          version: synced.version,
        };
      } else if (command === 'restart_player') {
        stopCurrentMedia();
        state.index = 0;
        state.paused = false;
        state.playing = false;
        play();
        resultPayload = { restarted: true };
      } else if (command === 'play') {
        play();
        resultPayload = { state: 'playing' };
      } else if (command === 'pause') {
        pause();
        resultPayload = { state: 'paused' };
      } else if (command === 'set_volume') {
        if (!body || typeof body.volume !== 'number' || body.volume < 0 || body.volume > 100) {
          throw new Error('set_volume payload must include volume (0-100)');
        }
        setVolume(body.volume);
        resultPayload = { volume: body.volume };
      } else if (command === 'screenshot') {
        resultPayload = await captureScreenshot();
      } else {
        throw new Error('Unsupported command: ' + command);
      }

      var success = {
        type: 'command_result',
        command: command,
        correlationId: correlationId,
        status: 'success',
        payload: resultPayload,
        deviceId: deviceId,
        ts: Date.now(),
      };

      state.idempotency.set(idempotencyKey, {
        value: success,
        expiresAt: Date.now() + config.idempotencyTtlMs,
      });

      return success;
    } catch (error) {
      var message = error && error.message ? error.message : 'Unknown command execution error';
      var code = message.indexOf('set_volume payload') >= 0 ? 'INVALID_COMMAND' : 'COMMAND_EXECUTION_FAILED';
      var failure = commandError(command, correlationId, code, message);

      state.idempotency.set(idempotencyKey, {
        value: failure,
        expiresAt: Date.now() + config.idempotencyTtlMs,
      });

      return failure;
    }
  }

  function commandError(command, correlationId, code, message) {
    return {
      type: 'command_result',
      command: command || 'unknown',
      correlationId: correlationId || 'generated-' + Date.now(),
      status: 'error',
      error: {
        code: code,
        message: message,
      },
      deviceId: deviceId,
      ts: Date.now(),
    };
  }

  function scheduleReconnect() {
    if (state.mqttReconnectTimer) {
      return;
    }

    state.mqttReconnectAttempt += 1;
    var base = config.reconnectInitialMs * Math.pow(config.reconnectMultiplier, state.mqttReconnectAttempt - 1);
    var clamped = Math.min(base, config.reconnectMaxMs);
    var jitter = 1 + config.reconnectJitterRatio * (Math.random() * 2 - 1);
    var delay = Math.max(0, Math.round(clamped * jitter));

    setOverlay('offline | reconnecting mqtt in ' + delay + 'ms');
    log('warn', 'Scheduling MQTT reconnect', {
      attempt: state.mqttReconnectAttempt,
      delay: delay,
    });

    state.mqttReconnectTimer = setTimeout(function reconnect() {
      state.mqttReconnectTimer = null;
      connectMqtt();
    }, delay);
  }

  function connectMqtt() {
    if (!window.mqtt || typeof window.mqtt.connect !== 'function') {
      log('warn', 'mqtt.js is unavailable in browser runtime, MQTT disabled');
      return;
    }

    var client = window.mqtt.connect(config.mqttUrl, {
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: config.mqttConnectTimeoutMs,
      clientId: deviceId + '-web',
    });

    state.mqttClient = client;

    client.on('connect', function onConnect() {
      state.mqttConnected = true;
      state.mqttReconnectAttempt = 0;
      setOverlay('online | mqtt connected');
      log('info', 'MQTT connected', {
        topic: config.commandTopic,
      });

      client.subscribe(config.commandTopic, { qos: config.commandQos }, function subscribeAck(error) {
        if (error) {
          log('error', 'MQTT subscribe failed', {
            message: error.message || 'unknown',
          });
          return;
        }
        publishStatus('online', { subscribed: true });
      });
    });

    client.on('message', function onMessage(topic, bytes) {
      if (topic !== config.commandTopic) {
        return;
      }
      var raw = String(bytes);
      dispatchCommand(raw).then(function onResult(eventPayload) {
        publish(config.eventsTopic, eventPayload, config.eventQos);
      });
    });

    client.on('close', function onClose() {
      if (!state.mqttConnected) {
        scheduleReconnect();
        return;
      }
      state.mqttConnected = false;
      publishStatus('offline', { reason: 'close' });
      scheduleReconnect();
    });

    client.on('error', function onError(error) {
      state.mqttConnected = false;
      log('warn', 'MQTT client error', {
        message: error && error.message ? error.message : 'unknown',
      });
      scheduleReconnect();
    });
  }

  function setupHeartbeat() {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
    }

    state.heartbeatTimer = setInterval(function heartbeatTick() {
      if (!state.mqttConnected) {
        return;
      }
      publishStatus('online', { heartbeat: true });
    }, config.heartbeatIntervalMs);
  }

  function setupLifecycleHooks() {
    document.addEventListener('visibilitychange', function onVisibilityChange() {
      if (document.hidden) {
        pause();
        return;
      }
      if (state.playing) {
        state.paused = false;
        renderCurrent();
      }
    });
  }

  async function startup() {
    setOverlay('booting');
    log('info', 'Browser player startup', {
      deviceId: deviceId,
      playlistEndpoint: config.playlistEndpoint,
      mqttUrl: config.mqttUrl,
    });

    var manifest = loadManifest();
    if (manifest && Array.isArray(manifest.playlist) && manifest.playlist.length > 0) {
      applyManifest(manifest);
      play();
      setOverlay('online | playing cached playlist');
    }

    try {
      var sync = await syncPlaylist();
      applyManifest({
        version: sync.version,
        playlist: sync.playlist,
      });
      play();
      setOverlay('online | synced playlist ' + sync.version);
    } catch (error) {
      var message = error && error.message ? error.message : 'unknown';
      setOverlay('degraded | remote playlist unavailable');
      log('warn', 'Initial remote sync failed, continuing in degraded mode', {
        message: message,
      });
    }

    if (state.syncTimer) {
      clearInterval(state.syncTimer);
    }
    state.syncTimer = setInterval(function periodicSync() {
      syncPlaylist()
        .then(function onSync(sync) {
          applyManifest({
            version: sync.version,
            playlist: sync.playlist,
          });
          if (!state.paused) {
            play();
          }
        })
        .catch(function onSyncFail(error) {
          log('warn', 'Periodic playlist sync failed', {
            message: error && error.message ? error.message : 'unknown',
          });
        });
    }, config.playlistSyncIntervalMs);

    setupLifecycleHooks();
    connectMqtt();
    setupHeartbeat();
  }

  startup().catch(function onFatal(error) {
    setOverlay('fatal startup error');
    log('error', 'Fatal startup error', {
      message: error && error.message ? error.message : 'unknown',
    });
  });
})();

