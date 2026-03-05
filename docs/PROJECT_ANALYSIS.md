# Project Analysis

## Problem Statement
Build a production-grade digital signage player for Smart TV environments, with Tizen as the primary runtime target. The player must fetch remote playlists, play media in sequence, operate in offline mode, and process MQTT commands with idempotent command-result responses.

## Case Objective
Demonstrate architecture quality and implementation maturity for:
- playlist-driven playback
- MQTT command handling and response publishing
- offline-first cache strategy
- operational resilience and recoverability
- Tizen-oriented packaging flow (`.wgt`)

## Non-Functional Expectations
| Requirement | Target |
| --- | --- |
| Stability | Long-running playback without crash in error scenarios |
| Recoverability | Self-healing behavior after network, broker, and media faults |
| Maintainability | Layered architecture, strict interfaces, low coupling |
| Observability | Structured logging + status/events over MQTT |
| Portability | Platform adapter boundary for Tizen/Web fallback |

## Scope
| In Scope | Out of Scope |
| --- | --- |
| Playlist fetch/validation/playback | Full CMS/admin panel |
| Offline cache and cold-start fallback | Full DRM integration |
| MQTT reconnect + command idempotency | Fleet-wide production monitoring stack |
| Command set: reload/restart/play/pause/set_volume/screenshot | Full OTA implementation |
| Tizen packaging/runbook documentation | End-to-end WebOS production implementation |

## Constraints
| Constraint | Impact | Mitigation |
| --- | --- | --- |
| Tizen emulator API gaps | Screenshot/volume APIs may be unavailable | Hybrid fallback with deterministic mock |
| 1-week delivery window | Depth vs breadth tradeoff | Tizen-first strategy, WebOS adapter-ready only |
| External broker/network instability | Non-deterministic integration tests | Local dockerized Mosquitto + mock playlist API |
| Media download failures | Partial assets risk | Atomic `.part` writes + rollback to previous cache |

## Risk Matrix
| Risk | Probability | Severity | Mitigation |
| --- | --- | --- | --- |
| MQTT library unavailable | Medium | High | Optional transport fallback to in-memory transport |
| Invalid command payloads | High | Medium | Strict validator and structured error result |
| Corrupt media or broken URLs | Medium | Medium | Skip broken item, continue playback loop |
| Broker disconnect storms | Medium | High | Exponential backoff with jitter |
| Cold-start while offline with no cache | Medium | High | Explicit degraded state and retry loop |

## Requirement-to-Feature Traceability
| Case Requirement | Implementation Feature |
| --- | --- |
| Remote playlist fetch | `PlaylistSyncService` + `FetchHttpClient` |
| Sequential playback and loop | `PlaybackEngine` |
| Video end auto transition | Renderer ended callback into engine transition |
| MQTT command handling | `MqttClientService` + `CommandDispatcher` |
| Idempotent commands | `IdempotencyStore` keyed by `command + correlationId` |
| Screenshot response | `ScreenshotService` with real-or-mock fallback |
| Offline-first operation | Manifest cache + local media path resolution |
| Reconnect strategy | Backoff policy (`RetryPolicy`, `computeBackoffDelay`) |

## Acceptance Checklist
- [ ] Player fetches and validates remote playlist JSON
- [ ] Image/video items play in sequence
- [ ] Duration and video-ended transitions work consistently
- [ ] Playlist loops without crashing
- [ ] MQTT commands are consumed and validated
- [ ] Command results are published with `correlationId`
- [ ] Duplicate commands produce idempotent response behavior
- [ ] Cached playlist/media support offline runtime
- [ ] Failure paths do not crash runtime
- [ ] Tizen build/package/run steps are documented

