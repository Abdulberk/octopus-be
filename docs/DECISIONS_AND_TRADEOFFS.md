# Decisions and Trade-Offs

## 1) Why Tizen-First
Decision:
- Prioritize Tizen as the fully executable target.

Reason:
- Case explicitly prioritizes Tizen and `.wgt` packaging.
- Better depth and reliability within 1-week delivery.

Trade-off:
- WebOS remains adapter-ready, not full runtime-complete.

## 2) Why QoS1 for Commands and Results
Decision:
- Commands and command results use QoS1.

Reason:
- Control-plane messages must be delivered at least once.
- Idempotency strategy safely handles duplicates.

Trade-off:
- Potential duplicate deliveries require deduplication logic.

## 3) Why Hybrid Screenshot Fallback
Decision:
- Attempt real platform screenshot first; fallback to deterministic mock.

Reason:
- Emulator/device API support can vary.
- Case requires reliable command-result behavior even when API is unavailable.

Trade-off:
- Mock responses may not represent true visual output.

## 4) Why Dockerized Local Mock Infrastructure
Decision:
- Use docker-compose with Mosquitto + playlist mock server.

Reason:
- Reproducible local demo flow with minimal environment drift.
- Removes external dependency for reviewer validation.

Trade-off:
- Added setup footprint for environments without Docker.

## 5) Why Unit-Heavy Validation Strategy
Decision:
- Prioritize deterministic unit tests on critical logic.

Reason:
- Core behavior risks are timing, idempotency, retry, and fallback logic.
- Faster confidence loop in limited time.

Trade-off:
- Reduced breadth of full-stack emulator automation.

## 6) Deferred Items
Deferred intentionally:
- Full WebOS runtime implementation
- Production-grade MQTT TLS/certificate/auth provisioning
- OTA update workflow beyond architecture-level design
- Full observability backend integration
- Fleet-level remote log ingestion pipeline

## Future Work
1. Add `WebOsPlatformAdapter` and validate command parity.
2. Integrate authenticated TLS MQTT transport and cert rotation policy.
3. Add optional emulator smoke checks on top of the CI lint/test/build pipeline.
4. Extend command set with diagnostics and health introspection.
5. Add metrics exporter for memory/runtime performance trend analysis.
