# Test Strategy

## Test Pyramid
| Level | Focus | Status |
| --- | --- | --- |
| Unit | Deterministic core logic and edge-case behavior | Primary coverage |
| Integration | MQTT/playlist/runtime interactions with mocks | Selective |
| E2E | Full emulator execution | Manual case validation step |

## Unit Test Matrix
| Module | What Is Verified |
| --- | --- |
| `retry` | Exponential backoff and max delay cap |
| `idempotency-store` | TTL expiry and capacity eviction |
| `command-dispatcher` | Validation, success flow, duplicate behavior |
| `playback-engine` | Image duration transitions, video-ended transitions |
| `playlist-sync-service` | Manifest creation and offline fallback |
| `screenshot-service` | Real API failure fallback to deterministic mock |
| `mqtt-client-service` | Reconnect retries with exponential backoff |
| `player-runtime` | Unchanged sync should not reset active playback; soft restart should still reload |

## Integration Scenarios (Planned/Manual)
- command payload arrives over MQTT and returns `command_result` event
- `reload_playlist` updates playback source version
- `restart_player` triggers soft re-init flow without process exit
- broker disconnect and reconnect behavior in running session
- Tizen/browser package resolves MQTT over WebSocket and uses cached assets when remote sync later fails

## Failure Injection Scenarios
- invalid JSON command payload
- invalid schema for `set_volume`
- network fetch failure during playlist sync
- media download partial failure (`.part` cleanup)
- broker unreachable on startup
- renderer/media playback failure on a single item

## Offline Cold-Start Scenarios
1. Cache exists + remote unavailable -> playback starts from cache.
2. Cache absent + remote unavailable -> runtime enters degraded mode and retries.
3. Cache exists + stale remote response -> cache remains playable until fresh sync.

## Acceptance Criteria by Test Evidence
| Requirement | Evidence |
| --- | --- |
| Idempotent command handling | `command-dispatcher.spec.ts` duplicate assertion |
| Reconnect/backoff strategy | `mqtt-client-service.spec.ts` connection attempt progression |
| Reconnect duplicate suppression | `mqtt-client-service.spec.ts` single-handle-after-reconnect assertion |
| Offline fallback | `playlist-sync-service.spec.ts` cache source assertion |
| Playlist loop and transitions | `playback-engine.spec.ts` transition assertions |
| Unchanged sync does not restart playback | `player-runtime.spec.ts` unchanged-startup assertion |
| Screenshot fallback contract | `screenshot-service.spec.ts` source=`mock` assertion |

## Coverage Goals
- Goal: prioritize critical path logic over broad shallow coverage.
- Target areas: command dispatcher, playback engine, playlist sync, reconnect logic.

## Known Non-Testable Areas (Current Scope)
- Real Tizen screenshot API behavior in all firmware variants
- Full WebOS runtime behavior
- Production TLS-authenticated MQTT broker behavior in this case setup
