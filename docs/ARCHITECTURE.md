# Architecture

## Layered Overview
The player is organized into five primary layers:
1. `core`: domain models, contracts, retry logic, shared errors
2. `services`: business workflows (playlist sync, command dispatch, lifecycle, screenshot)
3. `infrastructure`: external I/O adapters (HTTP, storage, MQTT, logging)
4. `player`: playback engine and renderer strategies
5. `platform`: Tizen/Web platform-specific adapters

## Runtime Targets
- `src/*`: Node-driven runtime used for local service validation, deterministic unit tests, and operational logic.
- `public/*`: Tizen/browser delivery bundle used in packaged web app execution.

Both targets are expected to stay behaviorally aligned for:
- playlist validation and periodic sync
- command validation and idempotent command results
- MQTT reconnect behavior
- offline cold-start fallback

## Module Boundaries
| Module | Responsibility | Depends On |
| --- | --- | --- |
| `core/domain` | Playlist/command/event/storage/retry types | None |
| `core/contracts` | Ports for logger/network/storage/mqtt/platform/renderer | None |
| `services/playlist` | Fetch, validate, cache, fallback playlist | Core contracts + domain |
| `services/commands` | Parse/validate/dispatch/idempotency | Core contracts + domain |
| `services/lifecycle` | Suspend/resume and visibility handling | Platform contract |
| `infrastructure/*` | Concrete IO implementations | Core contracts |
| `player/engine` | Playlist progression, timing, loop, state | Renderer contract |
| `player/renderers` | DOM/headless render implementations | Renderer contract |
| `platform/*` | Tizen/Web API encapsulation | Platform contract |

## Data Flow
1. `bootstrap` loads config and creates dependency graph.
2. Runtime attempts `initializeFromCache` for offline cold-start.
3. Runtime performs remote sync and updates playback playlist.
4. Playback engine starts and renders image/video in loop.
5. MQTT client subscribes to `players/{deviceId}/commands`.
6. Command dispatcher validates payload and executes handler.
7. Command result is published to `players/{deviceId}/events`.
8. Heartbeat/status events are published to `players/{deviceId}/status`.

## Error Handling and Recovery
- Every command path returns structured `command_result` with `success` or `error`.
- JSON/schema failures are isolated to command-level errors, not process-level crashes.
- Playlist sync falls back to active cached manifest on network failures.
- Media caching failures preserve last-known playable assets when available.
- MQTT connection failures trigger exponential retry with jitter.
- Rendering failures skip the broken item and continue playlist progression.

## Offline-First Cache Lifecycle
1. Playlist JSON is normalized and versioned (`version` or hash).
2. Node runtime downloads assets as `.part` temp files.
3. Node runtime atomically renames assets and manifest after processing.
4. Tizen/browser runtime persists manifest in `localStorage` and media blobs in `IndexedDB`.
5. On startup, cached manifest is loaded if present.
6. On remote failure, runtime continues from cached manifest.

## Resource and Memory Policy
- Playback timer and transition token prevent race conditions.
- Renderer resources are stopped/disposed on item switches and runtime stop.
- Lifecycle subscriptions return unsubscriber functions and are cleaned up.
- Event handlers are attached/detached explicitly in renderers/adapters.

## Security and Configuration Boundaries
- Runtime behavior is controlled through `config/*.json` and environment overrides.
- Topics and connection properties are centralized in app config.
- Command payload validation rejects malformed input early.
- TLS/auth hardening is intentionally documented as production follow-up.

## Extensibility Path for WebOS
- Platform API calls are isolated behind `PlatformAdapter`.
- Web fallback adapter demonstrates compatibility for non-Tizen environments.
- A future `WebOsPlatformAdapter` can be added without changing core/services logic.
