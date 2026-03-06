# Digital Signage Player (Tizen-First)

Operational README for local run, MQTT validation, and Tizen package flow.

## 1) Scope
This repository provides:
- Node-based local playback/runtime harness
- Tizen/browser playback package under `public/`
- MQTT command/event channel
- offline cache behavior
- Tizen packaging and emulator run flow

WebOS is intentionally left as adapter-readiness, not full delivery scope.

## 2) Architecture Summary
Main layers:
- `src/core`: domain types + contracts + base errors
- `src/services`: playlist sync, command dispatch, lifecycle, screenshot
- `src/infrastructure`: network, storage, mqtt, logging adapters
- `src/player`: playback engine + renderer strategies
- `src/platform`: Tizen/Web platform adapter isolation
- `src/app`: runtime bootstrap + dependency wiring

Detailed documents:
- `docs/PROJECT_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/COMMAND_PROTOCOL.md`
- `docs/TEST_STRATEGY.md`
- `docs/RUNBOOK_TIZEN.md`
- `docs/DECISIONS_AND_TRADEOFFS.md`

## 3) Requirements
- Node.js 20+
- npm 10+ or pnpm 9+
- Docker Desktop
- Tizen Studio 6.x (with IDE installer)

## 4) Tizen Studio Setup (Windows)
Install once:
1. Install `Tizen Studio 6.x with IDE installer`.
2. Open `Package Manager` and install:
- `10.0 Tizen - Web app. development (CLI)`
- `10.0 Tizen - Web app. development (IDE)`
- `Extras - Emulator`
- `Tizen SDK tools - Certificate Manager`

Current terminal session (PowerShell):
```powershell
$env:TIZEN_STUDIO_HOME="C:\tizen-studio"
$env:Path += ";C:\tizen-studio\tools;C:\tizen-studio\tools\ide\bin"
tizen version
sdb version
```

Create signing profile (one-time):
1. Open `Tizen Studio > Tools > Certificate Manager`.
2. Create profile `default`.
3. Keep profile active as `default`.
4. If package command fails, verify active profile:
```powershell
tizen security-profiles list
```
5. If CLI still fails to read the profile, ensure the Tizen CLI config points at a CLI-compatible `profiles.xml`.
Official Tizen CLI documentation expects `default.profiles.path` to target a file such as:
`C:\tizen-studio-data\ide\keystore\profiles.xml`
or a workspace `.metadata\.plugins\org.tizen.common.sign\profiles.xml`.
You can override it per-session with:
```powershell
$env:TIZEN_PROFILES_PATH="C:\tizen-studio-data\ide\keystore\profiles.xml"
```

## 5) Install
```bash
npm install
# or
pnpm install
```

## 6) Local Development Run
Start local infrastructure:
```bash
docker compose up -d
```

Prepare browser/Tizen runtime assets:
```bash
npm run prepare:web-assets
```

Run player runtime:
```bash
# PowerShell
$env:MQTT_TRANSPORT="node-mqtt"
$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:DEVICE_ID="player-local"
pnpm run start:dev
```

Run checks:
```bash
pnpm run lint
pnpm run build
pnpm run test -- --runInBand
```

## 7) MQTT Broker and Topics
Default Node runtime broker:
- `mqtt://localhost:1883`

Default Tizen/browser broker:
- `ws://<host>:9001/mqtt`

Topic structure:
- Subscribe: `players/{deviceId}/commands`
- Publish command results: `players/{deviceId}/events`
- Publish status/heartbeat: `players/{deviceId}/status`

Example with `deviceId=player-local`:
- `players/player-local/commands`
- `players/player-local/events`
- `players/player-local/status`

### QoS Decision and Rationale
- Commands: `QoS 1`  
  Reason: command delivery should be at-least-once.
- Command results/events: `QoS 1`  
  Reason: result/ack visibility is important for remote control.
- Status/heartbeat: `QoS 0`  
  Reason: periodic telemetry can be lossy and should stay lightweight.

Idempotency protects command handlers from duplicate command execution.

## 8) Command Payload Examples
`reload_playlist`
```json
{
  "command": "reload_playlist",
  "correlationId": "reload-001",
  "timestamp": 1700000001
}
```

`restart_player`
```json
{
  "command": "restart_player",
  "correlationId": "restart-001",
  "timestamp": 1700000002
}
```

`play`
```json
{
  "command": "play",
  "correlationId": "play-001",
  "timestamp": 1700000003
}
```

`pause`
```json
{
  "command": "pause",
  "correlationId": "pause-001",
  "timestamp": 1700000004
}
```

`set_volume`
```json
{
  "command": "set_volume",
  "correlationId": "volume-001",
  "timestamp": 1700000005,
  "payload": {
    "volume": 40
  }
}
```

`screenshot`
```json
{
  "command": "screenshot",
  "correlationId": "shot-001",
  "timestamp": 1700000006
}
```

## 9) Event Payload Examples
Success:
```json
{
  "type": "command_result",
  "command": "screenshot",
  "correlationId": "shot-001",
  "status": "success",
  "payload": {
    "format": "image/png",
    "base64": "<BASE64_IMAGE_DATA>",
    "source": "real | mock"
  },
  "deviceId": "player-local",
  "ts": 1700000123
}
```

Error:
```json
{
  "type": "command_result",
  "command": "unknown",
  "correlationId": "generated-1700000999",
  "status": "error",
  "error": {
    "code": "INVALID_JSON",
    "message": "Command payload is not valid JSON"
  },
  "deviceId": "player-local",
  "ts": 1700001001
}
```

## 10) Offline-First Behavior
- Manifest (`version`, playlist) is persisted locally.
- Node runtime stores manifest/assets under `.player-data`.
- Tizen/browser runtime stores manifest in `localStorage` and media assets in `IndexedDB`.
- On startup:
  - if cache exists, playback starts from cache immediately
  - remote sync runs in background
- If remote sync fails:
  - runtime continues in degraded mode
  - app does not crash
- Asset download uses `.part` temporary files with atomic rename.
- Browser/Tizen asset persistence requires source URLs to be fetchable from the runtime (CORS-safe media URLs are recommended).

## 11) Screenshot Behavior
- First attempt: platform screenshot API (`real` source).
- Fallback: deterministic mock base64 (`mock` source).
- Command always returns a structured `command_result` success/error event.

## 12) Logging and Monitoring
- Structured logging with `debug/info/warn/error`.
- Command outcomes are published through MQTT events.
- Status/heartbeat events are published periodically.
- Logger has optional `remoteSink` extension point for external log forwarding.

## 13) Tizen Build / Package / Run
Build and package:
```bash
npm run prepare:web-assets
pnpm tizen:build-web
pnpm tizen:package
```

Before packaging for emulator/device, update `public/player-config.js` with a host/IP that is reachable from the TV runtime.
Do not leave `localhost` unless the broker and playlist API are running inside the same device/emulator environment.

Check emulator target:
```bash
sdb devices
```

Install and run:
```bash
pnpm tizen:install -- -Target emulator-26101
pnpm tizen:run -- -Target emulator-26101 -AppId org.example
```

See full runbook:
- `docs/RUNBOOK_TIZEN.md`

## 14) Local Mock Infrastructure
- Mosquitto config: `docker/mosquitto/mosquitto.conf`
- Mosquitto exposes:
  - TCP MQTT on `1883`
  - WebSocket MQTT on `9001`
- Playlist mock server: `mock/playlist-server/server.js`
- Sample playlists:
  - `mock/sample-playlists/v1.json`
  - `mock/sample-playlists/v2.json`

## 15) Trade-offs and Assumptions
- Tizen-first full flow; WebOS remains adapter-level extension path.
- TLS/auth hardening is documented as production follow-up scope.
- Unit-heavy validation is preferred over broad emulator automation in this case timebox.
- Node runtime and Tizen/browser runtime are kept behaviorally aligned for playlist sync, command handling, reconnect, and offline fallback.

## 16) Submission Notes
- ESLint / Prettier / TypeScript enabled.
- Environment-based config split is under `config/`.
