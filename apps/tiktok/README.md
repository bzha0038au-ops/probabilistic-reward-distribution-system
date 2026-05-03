# TikTok Minis Starter

This app is a minimal TikTok Mini app starter for the Reward monorepo. It uses a plain Vite + TypeScript H5 setup so the output stays compatible with TikTok Minis packaging and debugging.

## Files that matter

- `index.html` loads the TikTok Minis SDK from `https://connect.tiktok-minis.com/drama/sdk.js`.
- `minis.config.json` defines the local debug port, build output, navbar settings, and trusted API domains.
- `src/tiktok-minis.ts` wraps SDK bootstrapping and basic Mini APIs.
- `src/main.ts` renders a small starter UI and wires sample `login` / `authorize` actions.

## Setup

1. Install dependencies from the repo root:

   ```sh
   pnpm install --filter ./apps/tiktok...
   ```

2. Copy `.env.example` to `.env.local` and replace `VITE_TIKTOK_CLIENT_KEY` with your real TikTok Mini `clientKey`.
3. Update `minis.config.json` so `dev.clientKey` matches the same value exactly.
4. Replace `domain.trustedDomains` with your real backend API origins before you call remote APIs from the Mini.

## Commands

- `pnpm --dir apps/tiktok dev` starts the local web app on `http://localhost:3004`.
- `pnpm --dir apps/tiktok minis:debug` starts TikTok Minis local debugging with the `ttdx` CLI.
- `pnpm --dir apps/tiktok minis:build` builds the static app and then generates TikTok Minis packaging artifacts in `dist/`.

## Notes

- Keep the TikTok account on your test phone in the app's Developer Portal test-user list before using local debugging.
- TikTok's docs require the `clientKey` used by `TTMinis.init` to match the one used by local debug configuration.
- Avoid adding extra external scripts or stylesheets. This starter only loads the required TikTok Minis SDK script.
