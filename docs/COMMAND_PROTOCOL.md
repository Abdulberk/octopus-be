# Command Protocol

## MQTT Topics
- Subscribe: `players/{deviceId}/commands`
- Publish command results: `players/{deviceId}/events`
- Publish status/heartbeat: `players/{deviceId}/status`

## QoS Policy
| Flow | QoS | Rationale |
| --- | --- | --- |
| Commands | 1 | At-least-once delivery for control operations |
| Command Results | 1 | Ack/result delivery reliability |
| Status/Heartbeat | 0 | Lightweight periodic telemetry |

## Command Envelope Schema
```json
{
  "command": "reload_playlist | restart_player | play | pause | set_volume | screenshot",
  "correlationId": "string",
  "timestamp": 1700000000,
  "payload": {}
}
```

Validation rules:
- `command`: must be one of supported commands
- `correlationId`: non-empty string
- `timestamp`: numeric unix timestamp
- `payload`: optional object
- `set_volume`: payload must include `volume` between `0` and `100`

## Command Result Schema
```json
{
  "type": "command_result",
  "command": "screenshot",
  "correlationId": "abc-123",
  "status": "success | error",
  "duplicate": false,
  "deviceId": "device-01",
  "ts": 1700000123,
  "payload": {},
  "error": {
    "code": "SCREENSHOT_FAILED",
    "message": "string"
  }
}
```

## Correlation and Idempotency Contract
- Idempotency key: `{command}:{correlationId}`
- Duplicate command with same key returns cached result payload
- Duplicate responses include `duplicate: true`
- TTL and max-entry policy are configurable (`idempotency` config)

## Error Codes
| Code | Meaning |
| --- | --- |
| `INVALID_JSON` | Payload is not valid JSON |
| `INVALID_COMMAND` | Command schema or constraints invalid |
| `COMMAND_NOT_IMPLEMENTED` | Supported command missing handler |
| `COMMAND_EXECUTION_FAILED` | Unexpected command execution failure |
| `SCREENSHOT_FAILED` | Platform screenshot API unavailable or denied |
| `VOLUME_UNSUPPORTED` | Platform volume control is unsupported |
| `MQTT_NOT_CONNECTED` | Publish/subscribe requested while disconnected |

## Command Examples
### `reload_playlist`
```json
{
  "command": "reload_playlist",
  "correlationId": "reload-001",
  "timestamp": 1700000001
}
```

### `restart_player`
```json
{
  "command": "restart_player",
  "correlationId": "restart-001",
  "timestamp": 1700000002
}
```

### `play`
```json
{
  "command": "play",
  "correlationId": "play-001",
  "timestamp": 1700000003
}
```

### `pause`
```json
{
  "command": "pause",
  "correlationId": "pause-001",
  "timestamp": 1700000004
}
```

### `set_volume`
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

### `screenshot`
```json
{
  "command": "screenshot",
  "correlationId": "shot-001",
  "timestamp": 1700000006
}
```

## Screenshot Response Contract
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
  }
}
```

Error:
```json
{
  "type": "command_result",
  "command": "screenshot",
  "correlationId": "shot-001",
  "status": "error",
  "error": {
    "code": "SCREENSHOT_FAILED",
    "message": "Platform screenshot API not available or permission denied"
  }
}
```

