# Dead Man's Switch

Dead Man's Switch is scaffolded as a .NET solution with a web app and a mobile app:

- `DeadMansSwitch.Web` — ASP.NET Core web app
- `DeadMansSwitch.Mobile` — .NET MAUI mobile app (currently Android-only, `net10.0-android`)
- `DeadMansSwitch.slnx` — solution file

## What we've done

1. Created a new solution and scaffolded the web + mobile projects.
2. Confirmed the web app builds and runs locally.
3. Retargeted MAUI from multi-platform `net6` targets to Android-only `net10.0-android` for this environment.
4. Installed/validated required MAUI Android workloads and confirmed Android build success.
5. Added Fly.io deployment files for the web app:
   - `Dockerfile`
   - `fly.toml`
6. Validated Docker container build and local container smoke test (`HTTP 200`).

## Why this platform instead of a Node.js-first stack

Node.js is a solid option, but .NET was chosen here intentionally:

- **Unified language/tooling**: C# across backend and MAUI client reduces context switching.
- **Strong mobile + web alignment**: ASP.NET Core and MAUI fit naturally in one ecosystem.
- **Type safety and maintainability**: C# + .NET tooling offer strong compile-time guarantees for long-lived product code.
- **Operational maturity**: ASP.NET Core containerizes cleanly and deploys predictably on Fly.io.
- **Future growth path**: this setup supports adding richer domain logic and shared code between web/mobile without introducing a second primary stack.

This is not anti-Node; it is a fit-for-purpose decision for this project’s cross-platform goals and maintainability.

## Local usage

### Web app

```bash
cd /tmp/workspace/Paperalien/Fulfill/DeadMansSwitch/DeadMansSwitch.Web
dotnet run
```

Default local URL is typically:

- `http://localhost:5089`

### Mobile app (Android)

```bash
cd /tmp/workspace/Paperalien/Fulfill/DeadMansSwitch
dotnet workload restore DeadMansSwitch.Mobile/DeadMansSwitch.Mobile.csproj
dotnet build DeadMansSwitch.Mobile/DeadMansSwitch.Mobile.csproj -f net10.0-android
```

## Fly.io deployment (web)

Deployment config is in:

- `/tmp/workspace/Paperalien/Fulfill/DeadMansSwitch/fly.toml`
- `/tmp/workspace/Paperalien/Fulfill/DeadMansSwitch/Dockerfile`

From a machine with `flyctl` and Fly network access:

```bash
cd /tmp/workspace/Paperalien/Fulfill/DeadMansSwitch
fly auth login
fly apps create dead-mans-switch-paperalien
fly deploy
```

## Current environment note

In this sandbox, web runs locally inside the sandbox host (not directly on your phone), and Fly CLI install/deploy was blocked by DNS/network access to `fly.io`.
