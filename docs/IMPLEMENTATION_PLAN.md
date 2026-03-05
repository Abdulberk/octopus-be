# Implementation Plan

## Milestone Timeline (Day 1-7)
| Day | Milestone | Output |
| --- | --- | --- |
| 1 | Architecture scaffolding | Layered folders, domain/contracts, app bootstrap |
| 2 | Playback core | Playback engine + renderer strategies + loop handling |
| 3 | Offline cache core | Playlist validator/sync, manifest, atomic downloads |
| 4 | MQTT + command pipeline | Transport, reconnect policy, dispatch/idempotency |
| 5 | Platform and lifecycle | Tizen/web adapters, screenshot fallback, lifecycle manager |
| 6 | Test hardening | Unit tests for core resilience paths |
| 7 | Packaging + docs | Tizen runbook, protocol docs, decision records |

## Detailed Task Breakdown
### Day 1
- Replace Nest starter structure with player-centric TypeScript modules.
- Add config system and runtime container bootstrap.
- Define public interfaces for playlist, command, and events.

### Day 2
- Implement `PlaybackEngine` state machine.
- Add renderer abstraction and DOM/headless implementations.
- Validate duration handling and transition callbacks.

### Day 3
- Implement playlist schema validation.
- Implement remote sync and local manifest persistence.
- Add asset download flow with `.part` temp files and rename semantics.

### Day 4
- Implement MQTT transport and service with reconnect policy.
- Add command validator/dispatcher and idempotency store.
- Wire command-result publishing with `correlationId`.

### Day 5
- Implement platform adapters (`TizenPlatformAdapter`, `WebFallbackPlatformAdapter`).
- Implement screenshot service with hybrid fallback.
- Add lifecycle manager hooks for visibility/suspend/resume.

### Day 6
- Add unit tests for retry/idempotency/dispatcher/playback/cache/screenshot/mqtt reconnect.
- Validate non-crashing behavior in failure scenarios.

### Day 7
- Add Tizen build/run scripts.
- Add dockerized local infra (Mosquitto + playlist mock).
- Finalize docs package and review submission checklist.

## Definition of Done by Milestone
| Milestone | DoD |
| --- | --- |
| Architecture scaffolding | App boots and module graph compiles |
| Playback core | Playlist runs with image duration + video ended transitions |
| Offline cache core | Manifest persists and fallback from cache works |
| MQTT + command | Commands are validated, executed, and result-published |
| Platform/lifecycle | Pause/resume hooks and screenshot fallback operational |
| Test hardening | Critical unit tests passing |
| Packaging/docs | Tizen runbook and architecture/protocol docs complete |

## Dependency Order and Critical Path
1. Domain/contracts must be defined before service wiring.
2. Playback engine must exist before command handlers can control media state.
3. Playlist sync must stabilize before offline behavior can be tested.
4. MQTT service must stabilize before command integration tests.
5. Documentation finalization depends on all earlier implementation decisions.

## Demo Readiness Gates
- Gate 1: Playlist playback shown from mock endpoint.
- Gate 2: MQTT commands execute with result events.
- Gate 3: Offline fallback demonstrated after endpoint failure.
- Gate 4: Screenshot command returns deterministic payload.
- Gate 5: Tizen build/package steps documented and reproducible.

## Final Submission Checklist
- [ ] Source compiles (`pnpm build`)
- [ ] Unit tests pass (`pnpm test`)
- [ ] Local infra starts (`docker compose up`)
- [ ] Mock playlist server serves sample data
- [ ] MQTT topics and payload examples documented
- [ ] Tizen runbook includes signing/package/install/run
- [ ] Trade-offs and deferred items documented

