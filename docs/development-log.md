# Development Log

## Phase 0: Verify Stack Works

### Initial Setup
- Created project structure manually (package.json, App.tsx, app.json, tsconfig.json, .gitignore)
- Note: npm commands had sandbox restrictions (npm tries to write logs to ~/.npm/_logs outside workspace)
- User ran `npm install` manually in terminal

### Version Compatibility Issues
- Expo 52 recommended different versions than initially specified
- Updated package.json with Expo-compatible versions:
  - `expo-status-bar`: `~2.2.3` → `~3.0.9`
  - `react`: `^18.3.1` → `19.1.0`
  - `react-native`: `^0.76.0` → `0.81.5`
  - `@types/react`: `^18.3.27` → `~19.1.10`

### Peer Dependency Warnings
- npm install showed warnings about peer dependencies:
  - React Native 0.81.5 expects React 18, but we're using React 19.1.0
  - `@types/react` version mismatch warnings
  - **Resolution**: Warnings were non-blocking; npm installed anyway (overriding peer deps)
  - **Status**: Need to verify runtime compatibility (tested and working)

### Web Support Dependencies
- Running `npm start --web` required additional packages:
  - Installed: `react-dom@19.1.0` and `react-native-web@^0.21.0` via `npx expo install`
  - Required for web platform support

### Phase 0 Completion ✅
- **Date**: January 17, 2025
- **Status**: SUCCESS
- **Result**: App runs in browser showing default Expo screen: "Open up App.tsx to start working on your app!"
- **Platforms Tested**: Web (browser)
- **Next Phase**: Phase 1 - Simple Todo List (In-Memory)

## Technical Notes

### npm/Sandbox Limitations
- npm commands through Cursor tools have sandbox restrictions
- npm tries to write logs to `~/.npm/_logs` (outside workspace), which is blocked
- Solution: Run npm/npx commands manually in terminal for dependency management

### Version Strategy
- Following Expo's recommended versions (via `expo install` or version warnings)
- Some peer dependency mismatches (React 19 vs React Native expecting React 18)
- Monitoring for runtime issues - none observed so far

### Project Files Created
- `package.json` - Expo project with TypeScript template dependencies
- `App.tsx` - Basic React Native entry point
- `app.json` - Expo configuration
- `tsconfig.json` - TypeScript configuration extending expo/tsconfig.base
- `.gitignore` - Standard Expo/.gitignore patterns
- `assets/` - Directory for app assets
