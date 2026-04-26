# Mobile App (Expo)

This app is the native user client for iOS and Android.

It shares backend contracts and request helpers with the web app through `@reward/user-core`.

## Local Development

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
pnpm dev:mobile
```

Useful commands:

```bash
pnpm mobile:ios
pnpm mobile:android
pnpm --dir apps/mobile check
```

## EAS Release

All EAS commands should be run from the app directory in this monorepo:

```bash
cd apps/mobile
pnpm release:preview
pnpm release:production
pnpm submit:android:internal
pnpm submit:android:production
pnpm submit:ios
```

The repository also exposes root shortcuts:

```bash
pnpm mobile:release:preview
pnpm mobile:release:production
pnpm mobile:submit:android:internal
pnpm mobile:submit:android:production
pnpm mobile:submit:ios
```

Notes:

- `apps/mobile/eas.json` now defines `preview` and `production` build profiles plus `internal` and `production` submit profiles.
- Run `pnpm --dir apps/mobile exec eas login` first, or provide `EXPO_TOKEN` in CI.
- EAS build versions are configured to use remote versioning, so production builds auto-increment build numbers on EAS.
- The app uses `runtimeVersion.policy = "fingerprint"` so OTA compatibility tracks native-runtime changes safely.
- The first `eas init` / `eas build` will still need to bind the Expo project and write `extra.eas.projectId` into app config.
- If you want non-default store identifiers, set `ios.bundleIdentifier` and `android.package` before the first store submission.
- For fully non-interactive submit in CI, also fill store-side fields such as `submit.production.ios.ascAppId` and an Android `serviceAccountKeyPath`.

## API Base URL

- iOS simulator: `http://127.0.0.1:4000`
- Android emulator: `http://10.0.2.2:4000`
- Physical devices: use your machine's LAN IP

## Session + Recovery

- User sessions are stored in `expo-secure-store` on iOS/Android and restored on cold start.
- Native auth links use the `reward-mobile://` scheme.
- The app also accepts pasted `/reset-password?token=...` and `/verify-email?token=...` links from the web notification templates.
