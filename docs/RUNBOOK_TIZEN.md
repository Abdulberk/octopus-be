# Tizen Runbook

## 1) Prerequisites
- Tizen Studio installed (TV Extension included)
- Tizen CLI available in `PATH`
- Certificate profile configured in Tizen Studio
- Node.js 20+ and pnpm installed

## 2) Project Preparation
```bash
npm install
npm run build
npm run prepare:web-assets
```

Optional local infra:
```bash
docker compose up -d
pnpm mock:playlist
```

### Runtime Addressing
The packaged Tizen web app does not share the host machine's `localhost`.

Before packaging, edit `public/player-config.js` so that:
- `playlistEndpoint` points to a host/IP reachable from the emulator/device
- `mqttUrl` points to the same reachable host/IP using WebSocket MQTT (`ws://<host>:9001/mqtt`)

### Signing Profile Path
The Tizen CLI signs packages by reading the `profiles.xml` file referenced by
`default.profiles.path`.

Preferred locations are:
- `C:\tizen-studio-data\ide\keystore\profiles.xml`
- `<workspace>\.metadata\.plugins\org.tizen.common.sign\profiles.xml`

If your machine has a stale legacy profile path such as
`C:\tizen-studio-data\profile\profiles.xml`, the CLI can fail with
`security-profiles list` or `package` errors even when Certificate Manager shows
an apparently valid profile.

You can force the scripts to use the correct file in the current shell:
```powershell
$env:TIZEN_PROFILES_PATH="C:\tizen-studio-data\ide\keystore\profiles.xml"
```

## 3) Emulator Setup
1. Open Tizen Studio > Emulator Manager.
2. Create or start a TV emulator instance.
3. Confirm target appears in CLI:
```bash
tizen target -l
```

## 4) Build and Package Flow
From repository root:
```bash
pnpm tizen:build-web
pnpm tizen:package
```

Generated artifacts:
- web build output: `.output/`
- package: `.wgt` (inside output directory)

## 5) Signing Notes
- `scripts/tizen-build.ps1` uses `--sign default`.
- Ensure `default` profile exists in your certificate manager.
- If signing fails, update profile name or active profile in Tizen Studio.

## 6) Install and Run on Emulator
Install:
```bash
pnpm tizen:install
```

Run (replace app id if needed):
```bash
pnpm tizen:run -- -AppId org.example
```

## 7) Troubleshooting
| Symptom | Check |
| --- | --- |
| `tizen` command not found | PATH setup from Tizen Studio installation |
| Packaging/signing error | Active certificate profile and permissions |
| App not installing | Emulator target ID and network bridge |
| App starts but no media | Playlist endpoint reachability and URL validity |
| MQTT commands not received | Topic/deviceId mismatch, WebSocket broker reachability, or `public/player-config.js` host |

## 8) Verification Checklist
- [ ] App launches on emulator
- [ ] Playlist loads and loops
- [ ] MQTT command topic subscription active
- [ ] Command results published to events topic
- [ ] Offline fallback works with existing cache
