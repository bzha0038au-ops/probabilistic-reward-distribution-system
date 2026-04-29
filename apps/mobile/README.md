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
pnpm mobile:android:dev-client
pnpm mobile:android:regression
pnpm --dir apps/mobile e2e:prepare
pnpm --dir apps/mobile e2e:maestro:holdem
pnpm --dir apps/mobile e2e:maestro:prediction-market
pnpm --dir apps/mobile check
```

## Android Dev-Build Regression

Use two terminals:

```bash
# Terminal A: start Metro for the Expo dev client
pnpm mobile:android:dev-client

# Terminal B: generate android/ if needed, build, install, adb reverse, and launch
pnpm mobile:android:regression
```

Notes:

- Keep the backend running on `http://127.0.0.1:4000` before launching the app.
- The regression script auto-detects the Android SDK from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `~/Library/Android/sdk`, or `~/Android/Sdk`.
- On a debug build, the login screen exposes a `Use seeded user` button. By default it uses `mobile.e2e.alice@example.com` / `User123!` for repeatable regression checks.
- If you need a non-emulator Metro host, set `REWARD_ANDROID_DEV_SERVER_HOST` before running `pnpm mobile:android:regression`.

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
- Local push-token registration in a dev build also needs a project ID. Either bind the app with `eas init` so Expo can infer it, or set `EXPO_PUBLIC_EXPO_PROJECT_ID=<your-eas-project-uuid>` in `apps/mobile/.env`.
- Android push-token registration also needs Firebase/FCM native config. Add `google-services.json` and apply the Google services Gradle plugin before expecting `/notification-push-devices` to register on Android.
- Put the Firebase file at `apps/mobile/google-services.json`. The app config and Gradle files will auto-detect it and enable Google services on the next native build.
- Remote push notification registration does not work on Android emulators or iOS simulators. Use a physical device for the final `/notification-push-devices` verification.
- If you want non-default store identifiers, set `ios.bundleIdentifier` and `android.package` before the first store submission.
- For fully non-interactive submit in CI, also fill store-side fields such as `submit.production.ios.ascAppId` and an Android `serviceAccountKeyPath`.

## Maestro E2E

Use Maestro for native validation of the `holdem` and `prediction-market` routes.

Prerequisites:

```bash
pnpm db:up
pnpm db:seed:manual
pnpm dev:backend
pnpm mobile:android
```

Install Maestro CLI once per machine:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Then prepare deterministic fixtures and run either flow:

```bash
pnpm --dir apps/mobile e2e:prepare
pnpm --dir apps/mobile e2e:maestro:holdem
pnpm --dir apps/mobile e2e:prepare
pnpm --dir apps/mobile e2e:maestro:prediction-market
```

What the fixture script sets up:

- `mobile.e2e.alice@example.com` / `User123!`
- `mobile.e2e.bob@example.com` / `User123!`
- Tier-2 verified wallets for both users
- A waiting Holdem table named `Mobile Maestro E2E Holdem`
- An open prediction market with slug `mobile-maestro-e2e-market`

Notes:

- The default Android `appId` is `com.anonymous.rewardmobile`.
- Override `REWARD_MOBILE_APP_ID` when targeting iOS or a custom native identifier.
- The flows assume a native debug build from `expo run:android` / `expo run:ios`, not the web build.

## API Base URL

- iOS simulator: `http://127.0.0.1:4000`
- Android emulator: `http://10.0.2.2:4000`
- Physical devices: use your machine's LAN IP

## Session + Recovery

- User sessions are stored in `expo-secure-store` on iOS/Android and restored on cold start.
- Native auth links use the `reward-mobile://` scheme.
- The app also accepts pasted `/reset-password?token=...` and `/verify-email?token=...` links from the web notification templates.
