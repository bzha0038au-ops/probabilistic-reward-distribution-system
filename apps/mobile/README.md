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

## API Base URL

- iOS simulator: `http://127.0.0.1:4000`
- Android emulator: `http://10.0.2.2:4000`
- Physical devices: use your machine's LAN IP
