(function bootstrapTizenPlayer() {
  'use strict';

  var supportedCommands = {
    reload_playlist: true,
    restart_player: true,
    play: true,
    pause: true,
    set_volume: true,
    screenshot: true,
  };

  var state = {
    playlist: [],
    currentIndex: 0,
    playbackState: 'idle',
    transitionTimer: null,
    playToken: 0,
    imageDeadlineMs: null,
    imageRemainingMs: null,
    currentVideo: null,
    currentImage: null,
    currentObjectUrl: null,
    cleanupVideoListeners: null,
    idempotency: new Map(),
    mqttClient: null,
    mqttConnected: false,
    mqttReconnectAttempt: 0,
    mqttReconnectTimer: null,
    heartbeatTimer: null,
    syncTimer: null,
    syncInFlight: false,
    resumeOnVisible: false,
    volume: 100,
    assetDbPromise: null,
    assetCacheWarned: false,
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
      return;
    }

    if (level === 'warn') {
      console.warn(serialized);
      return;
    }

    console.log(serialized);
  }

  function setOverlay(text) {
    if (overlay) {
      overlay.textContent = text;
    }
  }

  function parseJsonSafe(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function hashString(value) {
    var hash = 0;

    for (var index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }

    return 'v-' + Math.abs(hash);
  }

  function requestToPromise(request) {
    return new Promise(function resolveRequest(resolve, reject) {
      request.onsuccess = function onSuccess() {
        resolve(request.result);
      };
      request.onerror = function onError() {
        reject(request.error || new Error('IndexedDB request failed'));
      };
    });
  }

  function transactionToPromise(transaction) {
    return new Promise(function resolveTransaction(resolve, reject) {
      transaction.oncomplete = function onComplete() {
        resolve();
      };
      transaction.onabort = function onAbort() {
        reject(transaction.error || new Error('IndexedDB transaction aborted'));
      };
      transaction.onerror = function onError() {
        reject(transaction.error || new Error('IndexedDB transaction failed'));
      };
    });
  }

  function logAssetCacheWarning(message, context) {
    if (state.assetCacheWarned) {
      return;
    }

    state.assetCacheWarned = true;
    log('warn', message, context);
  }

  function inferHost() {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      typeof window.location.hostname === 'string' &&
      window.location.hostname.length > 0
    ) {
      return window.location.hostname;
    }

    return '127.0.0.1';
  }

  function getQueryOverrides() {
    if (
      typeof window === 'undefined' ||
      !window.location ||
      typeof window.location.search !== 'string'
    ) {
      return {};
    }

    var params = new URLSearchParams(window.location.search);
    return {
      host: params.get('host') || undefined,
      deviceId: params.get('deviceId') || undefined,
      playlistEndpoint: params.get('playlistEndpoint') || undefined,
      mqttUrl: params.get('mqttUrl') || undefined,
      mqttUsername: params.get('mqttUsername') || undefined,
      mqttPassword: params.get('mqttPassword') || undefined,
    };
  }

  function readString(value, fallback) {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }

  function readNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getDeviceId(storageKey, explicitDeviceId) {
    if (typeof explicitDeviceId === 'string' && explicitDeviceId.length > 0) {
      return explicitDeviceId;
    }

    var storageApi =
      typeof window !== 'undefined' ? window.localStorage : undefined;
    var existing = storageApi ? storageApi.getItem(storageKey) : null;
    if (existing) {
      return existing;
    }

    var generated = 'tizen-' + Math.random().toString(16).slice(2, 12);
    if (storageApi) {
      storageApi.setItem(storageKey, generated);
    }
    return generated;
  }

  function resolveRuntimeConfig() {
    var globalConfig =
      typeof window !== 'undefined' && window.__PLAYER_CONFIG__
        ? window.__PLAYER_CONFIG__
        : {};
    var query = getQueryOverrides();
    var host = readString(query.host, readString(globalConfig.host, inferHost()));
    var deviceId = getDeviceId(
      readString(globalConfig.deviceIdStorageKey, 'player_device_id'),
      readString(query.deviceId, globalConfig.deviceId),
    );

    return {
      deviceId: deviceId,
      manifestStorageKey: readString(
        globalConfig.manifestStorageKey,
        'player_manifest',
      ),
      assetDbName: readString(globalConfig.assetDbName, 'player_asset_cache'),
      assetStoreName: readString(globalConfig.assetStoreName, 'assets'),
      playlistEndpoint: readString(
        query.playlistEndpoint,
        readString(
          globalConfig.playlistEndpoint,
          'http://' + host + ':4000/playlist/v1',
        ),
      ),
      playlistSyncIntervalMs: readNumber(
        globalConfig.playlistSyncIntervalMs,
        30000,
      ),
      playlistDownloadTimeoutMs: readNumber(
        globalConfig.playlistDownloadTimeoutMs,
        15000,
      ),
      mqttUrl: readString(
        query.mqttUrl,
        readString(globalConfig.mqttUrl, 'ws://' + host + ':9001/mqtt'),
      ),
      mqttUsername: readString(query.mqttUsername, globalConfig.mqttUsername),
      mqttPassword: readString(query.mqttPassword, globalConfig.mqttPassword),
      mqttConnectTimeoutMs: readNumber(
        globalConfig.mqttConnectTimeoutMs,
        7000,
      ),
      heartbeatIntervalMs: readNumber(globalConfig.heartbeatIntervalMs, 30000),
      idempotencyTtlMs: readNumber(globalConfig.idempotencyTtlMs, 5 * 60000),
      idempotencyMaxEntries: readNumber(globalConfig.idempotencyMaxEntries, 1000),
      reconnectInitialMs: readNumber(globalConfig.reconnectInitialMs, 1000),
      reconnectMaxMs: readNumber(globalConfig.reconnectMaxMs, 60000),
      reconnectMultiplier: readNumber(globalConfig.reconnectMultiplier, 2),
      reconnectJitterRatio: readNumber(globalConfig.reconnectJitterRatio, 0.2),
      commandQos: readNumber(globalConfig.commandQos, 1),
      eventQos: readNumber(globalConfig.eventQos, 1),
      statusQos: readNumber(globalConfig.statusQos, 0),
      loop: globalConfig.loop !== false,
      defaultImageDurationSec: readNumber(
        globalConfig.defaultImageDurationSec,
        10,
      ),
      commandTopic: 'players/' + deviceId + '/commands',
      eventsTopic: 'players/' + deviceId + '/events',
      statusTopic: 'players/' + deviceId + '/status',
    };
  }

  var config = resolveRuntimeConfig();

  function loadManifest() {
    var raw = window.localStorage.getItem(config.manifestStorageKey);
    if (!raw) {
      return null;
    }

    return parseJsonSafe(raw);
  }

  function saveManifest(manifest) {
    window.localStorage.setItem(
      config.manifestStorageKey,
      JSON.stringify(manifest),
    );
  }

  function openAssetDb() {
    if (state.assetDbPromise) {
      return state.assetDbPromise;
    }

    if (typeof indexedDB === 'undefined') {
      logAssetCacheWarning('IndexedDB is not available. Asset cache disabled.');
      state.assetDbPromise = Promise.resolve(null);
      return state.assetDbPromise;
    }

    state.assetDbPromise = new Promise(function createDbPromise(resolve) {
      var request = indexedDB.open(config.assetDbName, 1);

      request.onupgradeneeded = function onUpgrade() {
        var db = request.result;
        if (!db.objectStoreNames.contains(config.assetStoreName)) {
          db.createObjectStore(config.assetStoreName, { keyPath: 'key' });
        }
      };

      request.onsuccess = function onSuccess() {
        resolve(request.result);
      };

      request.onerror = function onError() {
        logAssetCacheWarning('IndexedDB open failed. Asset cache disabled.', {
          message: request.error ? request.error.message : 'unknown',
        });
        resolve(null);
      };
    });

    return state.assetDbPromise;
  }

  async function getAssetEntry(key) {
    var db = await openAssetDb();
    if (!db) {
      return null;
    }

    var transaction = db.transaction(config.assetStoreName, 'readonly');
    var request = transaction.objectStore(config.assetStoreName).get(key);
    var result = await requestToPromise(request);
    await transactionToPromise(transaction);
    return result || null;
  }

  async function putAssetEntry(key, blob, contentType) {
    var db = await openAssetDb();
    if (!db) {
      return false;
    }

    var transaction = db.transaction(config.assetStoreName, 'readwrite');
    transaction.objectStore(config.assetStoreName).put({
      key: key,
      blob: blob,
      contentType: contentType,
      updatedAt: Date.now(),
    });
    await transactionToPromise(transaction);
    return true;
  }

  async function deleteAssetEntry(key) {
    var db = await openAssetDb();
    if (!db) {
      return;
    }

    var transaction = db.transaction(config.assetStoreName, 'readwrite');
    transaction.objectStore(config.assetStoreName).delete(key);
    await transactionToPromise(transaction);
  }

  async function listAssetKeys() {
    var db = await openAssetDb();
    if (!db) {
      return [];
    }

    var transaction = db.transaction(config.assetStoreName, 'readonly');
    var store = transaction.objectStore(config.assetStoreName);
    var keys = [];

    await new Promise(function collectKeys(resolve, reject) {
      var request = store.openKeyCursor();
      request.onsuccess = function onSuccess() {
        var cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }

        keys.push(String(cursor.key));
        cursor.continue();
      };
      request.onerror = function onError() {
        reject(request.error || new Error('IndexedDB cursor failed'));
      };
    });

    await transactionToPromise(transaction);
    return keys;
  }

  function buildAssetKey(item) {
    return 'asset:' + item.id + ':' + hashString(item.url);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map(function mapByte(value) {
        return value.toString(16).padStart(2, '0');
      })
      .join('');
  }

  async function computeSha256Hex(blob) {
    if (
      typeof window === 'undefined' ||
      !window.crypto ||
      !window.crypto.subtle ||
      typeof blob.arrayBuffer !== 'function'
    ) {
      return null;
    }

    var buffer = await blob.arrayBuffer();
    var hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    return bytesToHex(new Uint8Array(hashBuffer));
  }

  async function fetchWithTimeout(url, timeoutMs) {
    var controller = typeof AbortController !== 'undefined'
      ? new AbortController()
      : null;
    var timer = setTimeout(function abortRequest() {
      if (controller) {
        controller.abort();
      }
    }, timeoutMs);

    try {
      return await fetch(url, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('NETWORK_TIMEOUT');
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
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

      var candidateId =
        typeof item.id === 'string' && item.id.length > 0
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
          hash: typeof item.hash === 'string' ? item.hash : undefined,
        };
      }

      return {
        id: candidateId,
        type: 'video',
        url: item.url,
        hash: typeof item.hash === 'string' ? item.hash : undefined,
      };
    });

    var sourceHash = hashString(JSON.stringify(normalized));
    return {
      playlist: normalized,
      version:
        typeof value.version === 'string' && value.version.length > 0
          ? value.version
          : sourceHash,
      sourceHash: sourceHash,
    };
  }

  async function cacheAssets(items) {
    var nextItems = [];
    var expectedKeys = {};

    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      var assetKey = buildAssetKey(item);
      expectedKeys[assetKey] = true;

      try {
        var response = await fetchWithTimeout(
          item.url,
          config.playlistDownloadTimeoutMs,
        );
        if (!response.ok) {
          throw new Error('DOWNLOAD_FAILED_' + response.status);
        }

        var blob = await response.blob();
        if (item.hash) {
          var actualHash = await computeSha256Hex(blob);
          if (actualHash && actualHash.toLowerCase() !== item.hash.toLowerCase()) {
            throw new Error('HASH_MISMATCH_' + item.id);
          }
        }

        var stored = await putAssetEntry(
          assetKey,
          blob,
          response.headers.get('Content-Type') || blob.type || '',
        );

        if (stored) {
          nextItems.push(
            Object.assign({}, item, {
              localPath: assetKey,
            }),
          );
          continue;
        }
      } catch (error) {
        var alreadyCached = !!(await getAssetEntry(assetKey));
        log('warn', 'Asset caching failed, using fallback strategy', {
          itemId: item.id,
          url: item.url,
          alreadyCached: alreadyCached,
          message: error && error.message ? error.message : 'unknown',
        });

        if (alreadyCached) {
          nextItems.push(
            Object.assign({}, item, {
              localPath: assetKey,
            }),
          );
          continue;
        }
      }

      nextItems.push(item);
    }

    var cacheKeys = await listAssetKeys();
    for (var cursor = 0; cursor < cacheKeys.length; cursor += 1) {
      var key = cacheKeys[cursor];
      if (!expectedKeys[key]) {
        await deleteAssetEntry(key);
      }
    }

    return nextItems;
  }

  async function syncPlaylist() {
    var cachedManifest = loadManifest();

    try {
      var response = await fetchWithTimeout(
        config.playlistEndpoint,
        config.playlistDownloadTimeoutMs,
      );

      if (!response.ok) {
        throw new Error('HTTP_ERROR_' + response.status);
      }

      var payload = await response.json();
      var normalized = validatePlaylistResponse(payload);
      if (
        cachedManifest &&
        typeof cachedManifest.version === 'string' &&
        cachedManifest.version === normalized.version
      ) {
        return {
          source: 'remote',
          changed: false,
          version: normalized.version,
          playlist: cachedManifest.playlist || [],
        };
      }

      var playlistWithAssets = await cacheAssets(normalized.playlist);
      var manifest = {
        version: normalized.version,
        sourceHash: normalized.sourceHash,
        updatedAt: Date.now(),
        playlist: playlistWithAssets,
      };

      saveManifest(manifest);

      return {
        source: 'remote',
        changed: true,
        version: manifest.version,
        playlist: manifest.playlist,
      };
    } catch (error) {
      log('warn', 'Remote playlist fetch failed, falling back to cached manifest', {
        message: error && error.message ? error.message : 'unknown',
      });

      if (!cachedManifest || !Array.isArray(cachedManifest.playlist)) {
        throw error;
      }

      return {
        source: 'cache',
        changed: false,
        version: cachedManifest.version || 'cache',
        playlist: cachedManifest.playlist,
      };
    }
  }

  function cleanupMediaNodes() {
    if (state.cleanupVideoListeners) {
      state.cleanupVideoListeners();
      state.cleanupVideoListeners = null;
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

    if (state.currentObjectUrl) {
      URL.revokeObjectURL(state.currentObjectUrl);
      state.currentObjectUrl = null;
    }
  }

  function stopCurrentMedia() {
    if (state.transitionTimer) {
      clearTimeout(state.transitionTimer);
      state.transitionTimer = null;
    }

    cleanupMediaNodes();
  }

  function loadPlaylist(items) {
    state.playlist = Array.isArray(items) ? items : [];
    state.currentIndex = 0;

    log('info', 'Playlist applied', {
      itemCount: state.playlist.length,
    });
  }

  function isCurrentImage() {
    return (
      !!state.playlist[state.currentIndex] &&
      state.playlist[state.currentIndex].type === 'image'
    );
  }

  function moveIndexForward() {
    if (state.playlist.length === 0) {
      state.currentIndex = 0;
      return;
    }

    var nextIndex = state.currentIndex + 1;
    if (nextIndex >= state.playlist.length) {
      state.currentIndex = config.loop ? 0 : state.playlist.length - 1;
      if (!config.loop) {
        state.playbackState = 'idle';
      }
      return;
    }

    state.currentIndex = nextIndex;
  }

  async function resolvePlayableSource(item, token) {
    if (!item.localPath) {
      return item.url;
    }

    var entry = await getAssetEntry(item.localPath);
    if (!entry || !entry.blob) {
      return item.url;
    }

    var objectUrl = URL.createObjectURL(entry.blob);
    if (token !== state.playToken) {
      URL.revokeObjectURL(objectUrl);
      return null;
    }

    state.currentObjectUrl = objectUrl;
    return objectUrl;
  }

  function scheduleNextTransition(durationMs, token) {
    state.transitionTimer = setTimeout(function onTransition() {
      if (token !== state.playToken || state.playbackState !== 'playing') {
        return;
      }

      void goToNextItem();
    }, durationMs);
  }

  async function goToNextItem() {
    moveIndexForward();
    await playCurrentItem(true, 0);
  }

  async function playCurrentItem(resetRenderer, attemptedItems) {
    if (attemptedItems === undefined) {
      attemptedItems = 0;
    }

    if (state.playbackState !== 'playing') {
      return;
    }

    if (state.playlist.length === 0) {
      setOverlay('online | waiting for playlist');
      return;
    }

    if (attemptedItems >= state.playlist.length) {
      log('error', 'Playback halted because all playlist items failed');
      await stop();
      return;
    }

    var item = state.playlist[state.currentIndex];
    if (!item) {
      state.currentIndex = 0;
      await playCurrentItem(resetRenderer, attemptedItems + 1);
      return;
    }

    var token = ++state.playToken;

    if (state.transitionTimer) {
      clearTimeout(state.transitionTimer);
      state.transitionTimer = null;
    }

    if (resetRenderer) {
      cleanupMediaNodes();
    }

    try {
      var source = await resolvePlayableSource(item, token);
      if (!source || token !== state.playToken || state.playbackState !== 'playing') {
        return;
      }

      if (item.type === 'image') {
        var durationMs = Math.max(
          250,
          Math.round(
            (item.duration > 0 ? item.duration : config.defaultImageDurationSec) *
              1000,
          ),
        );

        state.imageRemainingMs = durationMs;
        state.imageDeadlineMs = Date.now() + durationMs;

        var image = document.createElement('img');
        image.src = source;
        image.alt = 'signage-image';
        image.style.width = '100%';
        image.style.height = '100%';
        image.style.objectFit = 'contain';
        image.addEventListener('error', function onImageError() {
          if (token !== state.playToken) {
            return;
          }

          log('warn', 'Image rendering failed, skipping item', {
            itemId: item.id,
            url: item.url,
          });
          moveIndexForward();
          void playCurrentItem(true, attemptedItems + 1);
        });

        root.appendChild(image);
        state.currentImage = image;
        scheduleNextTransition(durationMs, token);
        return;
      }

      state.imageRemainingMs = null;
      state.imageDeadlineMs = null;

      var video = document.createElement('video');
      video.src = source;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.autoplay = true;
      video.controls = false;
      video.volume = state.volume / 100;

      var endedHandler = function onEnded() {
        if (token !== state.playToken || state.playbackState !== 'playing') {
          return;
        }

        void goToNextItem();
      };

      var errorHandler = function onVideoError() {
        if (token !== state.playToken) {
          return;
        }

        log('warn', 'Video playback failed, skipping item', {
          itemId: item.id,
          url: item.url,
        });
        moveIndexForward();
        void playCurrentItem(true, attemptedItems + 1);
      };

      state.cleanupVideoListeners = function cleanupListeners() {
        video.removeEventListener('ended', endedHandler);
        video.removeEventListener('error', errorHandler);
      };

      video.addEventListener('ended', endedHandler);
      video.addEventListener('error', errorHandler);
      root.appendChild(video);
      state.currentVideo = video;

      await video.play().catch(function onPlayError(error) {
        throw new Error(
          error && error.message ? error.message : 'VIDEO_PLAYBACK_FAILED',
        );
      });
    } catch (error) {
      log('warn', 'Failed to render media item, skipping to next', {
        index: state.currentIndex,
        itemId: item.id,
        source: item.url,
        message: error && error.message ? error.message : 'unknown',
      });
      moveIndexForward();
      await playCurrentItem(true, attemptedItems + 1);
    }
  }

  async function play() {
    if (state.playlist.length === 0) {
      log('warn', 'Play requested with an empty playlist');
      return;
    }

    if (state.playbackState === 'paused') {
      state.playbackState = 'playing';

      if (isCurrentImage() && state.imageRemainingMs !== null) {
        state.imageDeadlineMs = Date.now() + state.imageRemainingMs;
        scheduleNextTransition(state.imageRemainingMs, state.playToken);
        return;
      }

      if (state.currentVideo) {
        await state.currentVideo.play().catch(function ignoreVideoResume() {
          return;
        });
      }

      return;
    }

    state.playbackState = 'playing';
    await playCurrentItem(true, 0);
  }

  async function pause() {
    if (state.playbackState !== 'playing') {
      return;
    }

    if (state.transitionTimer) {
      clearTimeout(state.transitionTimer);
      state.transitionTimer = null;
    }

    if (isCurrentImage() && state.imageDeadlineMs !== null) {
      state.imageRemainingMs = Math.max(0, state.imageDeadlineMs - Date.now());
    }

    state.playbackState = 'paused';

    if (state.currentVideo) {
      state.currentVideo.pause();
    }
  }

  async function stop() {
    state.playbackState = 'idle';
    state.playToken += 1;
    state.imageDeadlineMs = null;
    state.imageRemainingMs = null;
    stopCurrentMedia();
  }

  function cleanupIdempotency() {
    var now = Date.now();

    state.idempotency.forEach(function purgeEntry(entry, key) {
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
    publish(
      config.statusTopic,
      {
        type: 'status',
        status: status,
        deviceId: config.deviceId,
        ts: Date.now(),
        details: details || {},
      },
      config.statusQos,
    );
  }

  function buildCommandError(command, correlationId, code, message) {
    return {
      type: 'command_result',
      command: command || 'unknown',
      correlationId: correlationId || 'generated-' + Date.now(),
      status: 'error',
      error: {
        code: code,
        message: message,
      },
      deviceId: config.deviceId,
      ts: Date.now(),
    };
  }

  function validateCommandEnvelope(value) {
    if (!value || typeof value !== 'object') {
      throw {
        code: 'INVALID_COMMAND',
        message: 'Command payload must be an object',
      };
    }

    if (
      typeof value.command !== 'string' ||
      !supportedCommands[value.command]
    ) {
      throw {
        code: 'INVALID_COMMAND',
        message: 'Unsupported command: ' + String(value.command),
      };
    }

    if (
      typeof value.correlationId !== 'string' ||
      value.correlationId.trim().length === 0
    ) {
      throw {
        code: 'INVALID_COMMAND',
        message: 'correlationId must be a non-empty string',
      };
    }

    if (typeof value.timestamp !== 'number' || Number.isNaN(value.timestamp)) {
      throw {
        code: 'INVALID_COMMAND',
        message: 'timestamp must be a number',
      };
    }

    if (value.payload !== undefined && typeof value.payload !== 'object') {
      throw {
        code: 'INVALID_COMMAND',
        message: 'payload must be an object when provided',
      };
    }

    if (
      value.command === 'set_volume' &&
      (!value.payload ||
        typeof value.payload.volume !== 'number' ||
        value.payload.volume < 0 ||
        value.payload.volume > 100)
    ) {
      throw {
        code: 'INVALID_COMMAND',
        message: 'set_volume payload must include volume (0-100)',
      };
    }

    return {
      command: value.command,
      correlationId: value.correlationId,
      timestamp: value.timestamp,
      payload: value.payload,
    };
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

  async function runPlaylistSync(reason, forceReload) {
    if (state.syncInFlight) {
      log('warn', 'Playlist sync skipped because a previous sync is still running', {
        reason: reason,
      });
      return null;
    }

    state.syncInFlight = true;

    try {
      var syncResult = await syncPlaylist();
      var shouldReload = forceReload === true || syncResult.changed === true;

      if (shouldReload) {
        loadPlaylist(syncResult.playlist);
      }

      if (shouldReload && state.playbackState !== 'paused') {
        await play();
      } else if (!shouldReload && state.playbackState === 'idle') {
        await play();
      }

      return syncResult;
    } finally {
      state.syncInFlight = false;
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

  async function dispatchCommand(rawPayload) {
    var parsedPayload;

    try {
      parsedPayload = JSON.parse(rawPayload);
    } catch {
      return buildCommandError(
        'unknown',
        'generated-' + Date.now(),
        'INVALID_JSON',
        'Command payload is not valid JSON',
      );
    }

    var command;
    try {
      command = validateCommandEnvelope(parsedPayload);
    } catch (error) {
      return buildCommandError(
        parsedPayload && typeof parsedPayload.command === 'string'
          ? parsedPayload.command
          : 'unknown',
        parsedPayload && typeof parsedPayload.correlationId === 'string'
          ? parsedPayload.correlationId
          : 'generated-' + Date.now(),
        error && error.code ? error.code : 'INVALID_COMMAND',
        error && error.message ? error.message : 'Invalid command payload',
      );
    }

    cleanupIdempotency();

    var idempotencyKey = command.command + ':' + command.correlationId;
    var existing = state.idempotency.get(idempotencyKey);
    if (existing) {
      return Object.assign({}, existing.value, {
        duplicate: true,
        ts: Date.now(),
      });
    }

    try {
      var payload;

      if (command.command === 'reload_playlist') {
        var reloadResult = await runPlaylistSync('command-reload', false);
        payload = {
          source: reloadResult ? reloadResult.source : 'cache',
          changed: reloadResult ? reloadResult.changed : false,
          version: reloadResult ? reloadResult.version : 'unknown',
        };
      } else if (command.command === 'restart_player') {
        await stop();
        state.currentIndex = 0;
        var restartResult = await runPlaylistSync('command-restart', true);
        payload = {
          restarted: true,
          version: restartResult ? restartResult.version : 'unknown',
        };
      } else if (command.command === 'play') {
        await play();
        payload = {
          state: state.playbackState,
        };
      } else if (command.command === 'pause') {
        await pause();
        payload = {
          state: state.playbackState,
        };
      } else if (command.command === 'set_volume') {
        setVolume(command.payload.volume);
        payload = {
          volume: command.payload.volume,
        };
      } else if (command.command === 'screenshot') {
        payload = await captureScreenshot();
      } else {
        throw {
          code: 'COMMAND_NOT_IMPLEMENTED',
          message: 'Unsupported command: ' + command.command,
        };
      }

      var success = {
        type: 'command_result',
        command: command.command,
        correlationId: command.correlationId,
        status: 'success',
        payload: payload,
        deviceId: config.deviceId,
        ts: Date.now(),
      };

      state.idempotency.set(idempotencyKey, {
        value: success,
        expiresAt: Date.now() + config.idempotencyTtlMs,
      });

      return success;
    } catch (error) {
      var failure = buildCommandError(
        command.command,
        command.correlationId,
        error && error.code ? error.code : 'COMMAND_EXECUTION_FAILED',
        error && error.message
          ? error.message
          : 'Unknown command execution error',
      );

      state.idempotency.set(idempotencyKey, {
        value: failure,
        expiresAt: Date.now() + config.idempotencyTtlMs,
      });

      return failure;
    }
  }

  function cleanupMqttClient(forceClose) {
    if (!state.mqttClient) {
      return;
    }

    var client = state.mqttClient;
    state.mqttClient = null;
    state.mqttConnected = false;

    try {
      if (typeof client.removeAllListeners === 'function') {
        client.removeAllListeners();
      }

      if (typeof client.end === 'function') {
        client.end(forceClose === true);
      }
    } catch (error) {
      log('warn', 'MQTT cleanup failed', {
        message: error && error.message ? error.message : 'unknown',
      });
    }
  }

  function scheduleReconnect() {
    if (state.mqttReconnectTimer) {
      return;
    }

    state.mqttReconnectAttempt += 1;
    var base =
      config.reconnectInitialMs *
      Math.pow(config.reconnectMultiplier, state.mqttReconnectAttempt - 1);
    var clamped = Math.min(base, config.reconnectMaxMs);
    var jitter =
      1 + config.reconnectJitterRatio * (Math.random() * 2 - 1);
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

    cleanupMqttClient(true);

    var client = window.mqtt.connect(config.mqttUrl, {
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: config.mqttConnectTimeoutMs,
      clientId: config.deviceId + '-web',
      username: config.mqttUsername,
      password: config.mqttPassword,
    });

    state.mqttClient = client;

    client.on('connect', function onConnect() {
      state.mqttConnected = true;
      state.mqttReconnectAttempt = 0;
      setOverlay('online | mqtt connected');
      log('info', 'MQTT connected', {
        topic: config.commandTopic,
        mqttUrl: config.mqttUrl,
      });

      client.subscribe(
        config.commandTopic,
        { qos: config.commandQos },
        function onSubscribe(error) {
          if (error) {
            log('error', 'MQTT subscribe failed', {
              message: error.message || 'unknown',
            });
            cleanupMqttClient(true);
            scheduleReconnect();
            return;
          }

          publishStatus('online', { subscribed: true });
        },
      );
    });

    client.on('message', function onMessage(topic, bytes) {
      if (topic !== config.commandTopic) {
        return;
      }

      void dispatchCommand(String(bytes)).then(function onResult(eventPayload) {
        publish(config.eventsTopic, eventPayload, config.eventQos);
      });
    });

    client.on('close', function onClose() {
      state.mqttConnected = false;
      scheduleReconnect();
    });

    client.on('error', function onError(error) {
      state.mqttConnected = false;
      log('warn', 'MQTT client error', {
        message: error && error.message ? error.message : 'unknown',
      });
      cleanupMqttClient(true);
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
        state.resumeOnVisible = state.playbackState === 'playing';
        void pause();
        return;
      }

      if (state.resumeOnVisible) {
        state.resumeOnVisible = false;
        void play();
      }
    });
  }

  async function startup() {
    setOverlay('booting');
    log('info', 'Browser player startup', {
      deviceId: config.deviceId,
      playlistEndpoint: config.playlistEndpoint,
      mqttUrl: config.mqttUrl,
    });

    var manifest = loadManifest();
    if (manifest && Array.isArray(manifest.playlist) && manifest.playlist.length > 0) {
      loadPlaylist(manifest.playlist);
      await play();
      setOverlay('online | playing cached playlist');
    }

    try {
      var startupSync = await runPlaylistSync('startup', !manifest);
      if (startupSync && startupSync.source === 'remote') {
        setOverlay('online | synced playlist ' + startupSync.version);
      }
    } catch (error) {
      setOverlay(
        manifest && Array.isArray(manifest.playlist) && manifest.playlist.length > 0
          ? 'degraded | using cached playlist'
          : 'degraded | remote playlist unavailable',
      );
      log('warn', 'Initial remote sync failed, continuing in degraded mode', {
        message: error && error.message ? error.message : 'unknown',
      });
    }

    if (state.syncTimer) {
      clearInterval(state.syncTimer);
    }

    state.syncTimer = setInterval(function periodicSync() {
      void runPlaylistSync('interval', false)
        .then(function onPeriodicSync(syncResult) {
          if (!syncResult || !syncResult.changed) {
            return;
          }

          setOverlay('online | synced playlist ' + syncResult.version);
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
