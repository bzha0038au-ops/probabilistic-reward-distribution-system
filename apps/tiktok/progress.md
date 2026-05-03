Original prompt: 把 Fate Ticket 改成真正的“刮开”交互，不只是点亮翻牌

- Added a dedicated canvas-based scratch overlay component in `src/scratch-card.ts`.
- Switched the ticket flow from click-to-flip to `ticket -> decision -> ticket-final`, so the last outcome now requires a real scratch gesture after `CONTINUE`.
- Updated the Fate Ticket layout to a real scratch-ticket style with a single horizontal row of 3 panels instead of the earlier 2x2 grid.
- Reduced the slot count from 4 placeholders to the 3 actual ticket panels used by gameplay.
- Restyled the ticket into a paper-lottery composition: green printed ticket face, silver scratch coating, top scenic vignette, and a brown prize-odds sidebar.
- Changed the opening interaction from per-cell scratch to one shared horizontal scratch strip that reveals the first two results together.
- Left the third panel locked during the opening strip, then reuses a single final-panel scratch after `CONTINUE`.
- Fixed the skip-on-click bug in the scratch handlers: `pointerdown` no longer reveals anything by itself, and reveal now requires actual drag distance before coverage thresholds can complete.
- Tightened the opening strip gate so the shared membrane now tracks three independent slot regions; the ticket only advances after all 3 windows have been scratched through enough to count.
- Added hash-based route paging so tabs and play stages now live on separate URLs:
  `#/story`, `#/wallet`, `#/profile`, plus `#/play/<stage>` such as `#/play/intro`, `#/play/ticket`, `#/play/decision`, `#/play/ticket-final`, `#/play/ticket-win`, `#/play/rex`, and `#/play/rex-win`.
- Route changes are now state-synced in both directions: button actions push the URL, and direct hash loads / back-forward navigation rebuild the corresponding page state.
- Split the old monolithic `main.ts` into shared modules:
  `src/routes/index.ts` for route parsing/building,
  `src/views/layout.ts` for shell chrome,
  `src/views/play-view.ts`, `story-view.ts`, `wallet-view.ts`, `profile-view.ts` for page renderers,
  plus shared `src/app-types.ts`, `src/game-utils.ts`, and `src/views/icons.ts`.
- `main.ts` now acts as the composition root only: state, actions, router sync, scratch hydration, and testing hooks.
- Split state and mutation logic one layer further:
  `src/state/app-state.ts` now owns progress persistence, initial app state, play-state factories, route-stage reconstruction, and display/scratch selectors.
  `src/actions/play-actions.ts` now owns run start, shared-strip reveal, final scratch resolution, continue/cash-out, Rex table transitions, and play-again reset.
- `main.ts` is now mostly wiring: event delegation, route sync, TikTok bootstrap, scratch canvas hydration, and test hooks.
- Pulled the remaining wiring into `src/app-controller.ts`:
  router sync, event delegation, TikTok bootstrap, render loop, scratch hydration, and testing hooks now live there.
- `main.ts` is now reduced to bootstrapping only: style import, `#app` lookup, `clientKey` read, and `startAppController(...)`.
- Added `window.render_game_to_text` and `window.advanceTime` hooks for deterministic browser validation.
- Verified with `pnpm check`, `pnpm build`, and `pnpm minis:build`.
- Verified both branches with Playwright screenshots in `.artifacts/scratch-flow/`:
  `scratch-active.png`, `decision.png`, `ticket-final.png`, `bust.png`, `ticket-win.png`, `rex.png`, `rex-win.png`.
- Re-verified the row-of-3 ticket layout in `.artifacts/scratch-flow-row3/`:
  `scratch-active.png`, `decision.png`, `ticket-final.png`, `bust.png`, `ticket-win.png`.
- Verified the paper-ticket pass in `.artifacts/scratch-flow-paper/`:
  `scratch-active.png`, `decision.png`, `ticket-final.png`, `ticket-win.png`.
- Verified the shared-strip correction in `.artifacts/scratch-flow-shared/`:
  `scratch-active.png`, `decision.png`, `ticket-final.png`, `ticket-win.png`.
- Re-verified the stricter 3-window gate in `.artifacts/scratch-flow-3gate/`:
  `partial-two-slots.png/json` stays on `stage: "ticket"` after scratching only slots 0-1, while `full-three-slots.png/json` reaches `stage: "decision"` only after scratching across slots 0-2.
- Verified route paging in `.artifacts/routes/`:
  `route-report.json` confirms tab routes and stage routes map correctly, while screenshots cover `tab-story.png`, `play-ticket.png`, `play-decision.png`, `play-ticket-final.png`, `play-ticket-win.png`, `play-rex.png`, and `play-rex-win.png`.
- Re-verified the modularized route/view split in `.artifacts/routes-modular/`:
  `report.json` confirms direct loads of `#/story`, `#/wallet`, `#/profile`, `#/play/intro`, `#/play/ticket`, and `#/play/rex` still map to the correct page state after the file split.
- Re-verified the 3-window scratch gate after modularization in `.artifacts/scratch-flow-3gate-modular/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Re-verified the route/state/actions split in `.artifacts/routes-state-actions/`:
  `report.json` confirms direct loads of `#/story`, `#/wallet`, `#/profile`, `#/play/intro`, `#/play/ticket`, and `#/play/rex` still land on the correct page state after moving logic into `state/` and `actions/`.
- Re-verified the 3-window scratch gate after the `state/` + `actions/` split in `.artifacts/scratch-flow-state-actions/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Re-verified the `app-controller` extraction in `.artifacts/routes-app-controller/`:
  `report.json` confirms direct loads of `#/story`, `#/wallet`, `#/profile`, `#/play/intro`, `#/play/ticket`, and `#/play/rex` still land on the correct page state after moving router/wiring out of `main.ts`.
- Re-verified the 3-window scratch gate after the `app-controller` extraction in `.artifacts/scratch-flow-app-controller/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Split `src/app-controller.ts` again into focused controllers:
  `src/router-controller.ts` now owns hash parsing, URL sync, replace/push behavior, and initial-route normalization.
  `src/scratch-controller.ts` now owns scratch-canvas hydration for both the shared opening strip and the per-slot final panel.
- `src/app-controller.ts` now stays on orchestration only:
  state boot, click delegation, TikTok bootstrap, render scheduling, persistence hooks, and testing hooks.
- Re-verified the controller split in `.artifacts/routes-router-scratch-controller/`:
  `report.json` confirms direct loads of `#/story`, `#/wallet`, `#/profile`, `#/play/intro`, `#/play/ticket`, and `#/play/rex` still land on the correct page state after pulling routing into `router-controller.ts`.
- Re-verified the 3-window scratch gate after the `router-controller` + `scratch-controller` split in `.artifacts/scratch-flow-router-scratch-controller/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Split `src/app-controller.ts` one layer further into:
  `src/interaction-controller.ts` for `[data-action]` click delegation and route/tab dispatch,
  `src/runtime-controller.ts` for TikTok Minis bootstrap and nav-bar setup,
  `src/testing-controller.ts` for `window.render_game_to_text` and `window.advanceTime`.
- `src/app-controller.ts` is now a thin composition root:
  state creation, router creation, persistence helpers, render wiring, and controller composition only.
- Re-verified the final controller split in `.artifacts/routes-controller-final/`:
  `report.json` confirms `#/story`, `#/play/ticket`, and `#/play/rex` still reconstruct the correct page state after moving interaction/runtime/testing concerns out of `app-controller.ts`.
- Re-verified the 3-window scratch gate after the final controller split in `.artifacts/scratch-flow-controller-final/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Split the remaining session concerns out of `src/app-controller.ts` into `src/session-controller.ts`:
  it now owns initial progress load, initial `AppState` creation, progress persistence, event log stamping, and `PlayActionContext` creation.
- `src/app-controller.ts` now only wires together:
  `session-controller`, `router-controller`, `interaction-controller`, `runtime-controller`, `testing-controller`, and `scratch-controller`.
- Re-verified the session split in `.artifacts/routes-session-controller/`:
  `report.json` confirms `#/story`, `#/play/ticket`, and `#/play/rex` still reconstruct the correct page state after moving persistence/event-log context out of `app-controller.ts`.
- Re-verified the 3-window scratch gate after the session split in `.artifacts/scratch-flow-session-controller/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Split the remaining route/state mapping out of `src/app-controller.ts` into `src/play-state-controller.ts`:
  it now owns fallback-stage lookup, current-route derivation, and route-to-play-state reconstruction.
- `src/app-controller.ts` now delegates route/state concerns through `play-state-controller` instead of directly mutating `activeTab` and `play.stage`.
- Re-verified the play-state split in `.artifacts/routes-play-state-controller/`:
  `report.json` confirms `#/story`, `#/play/ticket`, and `#/play/rex` still reconstruct the correct page state after moving route-state mapping out of `app-controller.ts`.
- Re-verified the 3-window scratch gate after the play-state split in `.artifacts/scratch-flow-play-state-controller/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Split the remaining render orchestration out of `src/app-controller.ts` into `src/render-controller.ts`:
  it now owns `renderApp(...)`, testing-hook sync, and post-render scratch hydration scheduling.
- `src/app-controller.ts` now only composes the controller graph and startup order:
  session, play-state, render, router, interaction, and runtime controllers.
- Re-verified the render split in `.artifacts/routes-render-controller/`:
  `report.json` confirms `#/story`, `#/play/ticket`, and `#/play/rex` still reconstruct the correct page state after moving render/testing/scratch post-processing out of `app-controller.ts`.
- Re-verified the 3-window scratch gate after the render split in `.artifacts/scratch-flow-render-controller/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Moved all controller files into `src/controllers/` and added `src/controllers/index.ts` as the barrel export used by `src/main.ts`.
- The controller directory now contains:
  `app-controller`, `interaction-controller`, `play-state-controller`, `render-controller`, `router-controller`, `runtime-controller`, `scratch-controller`, `session-controller`, and `testing-controller`.
- Re-verified the controller-directory move in `.artifacts/routes-controllers-dir/`:
  `report.json` confirms `#/story`, `#/play/ticket`, and `#/play/rex` still reconstruct the correct page state after moving the controller layer under `src/controllers/`.
- Re-verified the 3-window scratch gate after the controller-directory move in `.artifacts/scratch-flow-controllers-dir/`:
  `partial-two-slots.json` still stays on `#/play/ticket`, while `full-three-slots.json` advances to `#/play/decision`.
- Added local test infrastructure for the TikTok app:
  `vitest.config.ts`, a `test` / `test:watch` script in `package.json`, and local `vitest` + `jsdom` devDependencies.
- Added controller-level tests in `tests/controllers/`:
  `play-state-controller.test.ts` covers route derivation, play-stage reconstruction, and non-play tab switching;
  `scratch-controller.test.ts` covers the 3-region opening gate and final scratch-slot completion wiring.
- Verified the new automated test layer with `pnpm --dir apps/tiktok test`:
  2 test files, 5 tests passing.
- Re-verified that test tooling changes did not affect production output with:
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Ran the bundled `develop-web-game` client successfully against a direct route in `.artifacts/routes/client-story/` using `#/story` plus a no-input frame step.
- Ran the bundled `develop-web-game` client again after modularization in `.artifacts/routes-modular/client-story/` against `#/story`.
- Ran the bundled `develop-web-game` client again after the `state/` + `actions/` split in `.artifacts/routes-state-actions/client-story/` against `#/story`.
- Ran the bundled `develop-web-game` client again after the `app-controller` extraction in `.artifacts/routes-app-controller/client-story/` against `#/story`.
- Re-ran the bundled `develop-web-game` client after the controller split, but it timed out again during its screenshot step on `#/story`; final validation for this pass used the same custom Playwright + CDP fallback as the earlier route and scratch regressions.
- Re-ran the bundled `develop-web-game` client after the final controller split in `.artifacts/routes-controller-final/client-story/`:
  it completed and captured the correct `state-0.json`, but `shot-0.png` still showed an empty shell while the custom Playwright screenshots rendered the full page correctly. Treat the bundled client screenshot as a tooling timing issue, not a product regression.
- Re-ran the bundled `develop-web-game` client after the `session-controller` split in `.artifacts/routes-session-controller/client-story/`:
  it again captured the correct `state-0.json`, while `shot-0.png` still showed only the shell background. Keep treating that as a Playwright client screenshot timing issue rather than a UI regression, because the custom Playwright screenshots and route-state assertions remained correct.
- Re-ran the bundled `develop-web-game` client after the `play-state-controller` split in `.artifacts/routes-play-state-controller/client-story/`:
  it again captured the correct `state-0.json`, while `shot-0.png` still showed only the shell background. Keep treating that as a Playwright client screenshot timing issue rather than a UI regression, because the custom Playwright screenshots and route-state assertions remained correct.
- Re-ran the bundled `develop-web-game` client after the `render-controller` split in `.artifacts/routes-render-controller/client-story/`:
  it again produced the correct route/state data but `shot-0.png` still showed only the shell background. Keep treating that as the same Playwright client screenshot timing issue rather than a UI regression, because the custom Playwright screenshots and route-state assertions remained correct.
- Re-ran the bundled `develop-web-game` client after moving controllers into `src/controllers/` in `.artifacts/routes-controllers-dir/client-story/`:
  it again captured the correct `state-0.json`, while `shot-0.png` still showed only the shell background. Keep treating that as the same Playwright client screenshot timing issue rather than a UI regression, because the custom Playwright screenshots and route-state assertions remained correct.
- This test-infra pass did not change runtime behavior, so no new Playwright screenshot sweep was required beyond the earlier `.artifacts/routes-controllers-dir/` and `.artifacts/scratch-flow-controllers-dir/` baselines.
- Added live backend integration modeled after `apps/frontend` but adapted for the standalone TikTok app:
  `apps/tiktok` now depends on `@reward/user-core` and `@reward/shared-types`,
  defaults `VITE_USER_API_BASE_URL` to `/api/user`,
  and uses a Vite dev proxy from `/api/user/*` to `http://localhost:4000/*`.
- Added `src/api/user-client.ts` as the browser-side `@reward/user-core` wrapper and `src/controllers/live-data-controller.ts` for:
  direct bearer-token login via `/auth/user/session`,
  session restore from local storage,
  wallet + draw overview refresh,
  logout,
  and `playDraw({ count: 1 })`.
- Extended `AppState` with `live` data:
  auth token + remembered email,
  auth/dashboard/draw status messaging,
  current session,
  wallet snapshot,
  draw overview snapshot,
  and the latest live draw settlement.
- Wired the new live controller into `app-controller`, `session-controller`, and `interaction-controller`.
  `profile` now supports real login/logout/refresh,
  `wallet` shows live balances and pity/draw metadata when available,
  and `play` shows a live engine card plus a `Spin Live Draw` action when authenticated.
- Added `tests/controllers/live-data-controller.test.ts` to lock the new behavior:
  successful login persists the token/email and hydrates session + wallet + draw overview,
  and live draw play stores the latest settlement plus refreshed overview data.
- Verified the expanded test layer with `pnpm --dir apps/tiktok test`:
  3 test files, 7 tests passing.
- Re-verified production output after the live-data pass with:
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Ran the bundled `develop-web-game` client against `#/profile` in `.artifacts/live-data/profile-client/`:
  `state-0.json` correctly reflected the new live auth/dashboard state,
  but `shot-0.png` still captured only the empty shell background, consistent with the earlier screenshot-timing issue.
- Performed custom Playwright fallback screenshots for the new UI in `.artifacts/live-data/fallback-delayed/`:
  `profile.png` validates the login form and live status cards,
  `wallet.png` validates the logged-out wallet fallback,
  and `play.png` validates the new live-engine card on the intro route.
- Extended the live backend pass again using more of the same `frontend` data surfaces:
  `live-data-controller` now also fetches `getEconomyLedger({ limit: 8 })`,
  stores `activity` rows in `AppState.live`,
  and exposes `activityCount` through `render_game_to_text`.
- The wallet route now shows a real recent-activity feed from the shared economy ledger:
  entry type, asset code, timestamp, signed amount, and linked reference ids.
- The play intro route now renders a denser `frontend`-style live draw summary:
  fairness commit hash + epoch + cadence,
  pity progress bar and countdown,
  top featured prizes from `drawOverview.featuredPrizes`,
  and a last-live-settlement panel after `playDraw`.
- Re-verified after the ledger/fairness pass with:
  `pnpm --dir apps/tiktok test`,
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Added mocked authenticated browser QA in `.artifacts/live-data/auth-mock/` by intercepting `/api/user/*` calls:
  `profile-auth.png/json` validates the logged-in profile state,
  `wallet-auth.png/json` validates live balances plus ledger activity,
  `play-auth.png/json` validates fairness/pity/featured prizes,
  and `play-after-draw.png/json` validates the post-draw settlement card.
- Extended the profile route with more `frontend`-style account capability:
  `live-data-controller` now also fetches `listSessions()` and `getRewardCenter()`,
  and supports `requestEmailVerification({ resend: true })` plus `claimRewardMission(missionId)`.
- `AppState.live` now carries `sessions` and `rewardCenter`, and the testing hook now exposes
  `sessionCount` and `rewardMissionCount` alongside the earlier wallet/draw fields.
- The profile UI now renders:
  a resend-verification card when `emailVerifiedAt` is still null,
  an active-sessions list from `/auth/user/sessions`,
  and a reward-center section with mission progress plus claim buttons for claimable missions.
- Expanded `tests/controllers/live-data-controller.test.ts` again:
  existing login/live-draw tests now cover sessions + reward center hydration,
  and a new test verifies resend-email + claim-mission flows.
- Re-verified this pass with:
  `pnpm --dir apps/tiktok test`,
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Added another mocked authenticated browser regression set in `.artifacts/live-data/profile-missions/`:
  `profile-before-actions.png/json` validates verification card + sessions + missions,
  and `profile-after-actions.png/json` validates both resend-email and claim-mission state transitions.
- Extended the TikTok profile security panel again to match more of `frontend`'s session controls:
  `src/api/user-client.ts` now exposes `revokeSession()` and `revokeAllSessions()`,
  `live-data-controller` now supports single-session revoke and revoke-all flows,
  and the profile session cards now render `Sign Out Everywhere`, `Sign Out This Device`, and per-session `Revoke Session` actions.
- Added session-security regression coverage in `tests/controllers/live-data-controller.test.ts`:
  current-session revoke clears local auth state and storage,
  other-session revoke refreshes the backend-backed session list,
  and revoke-all clears the live connection entirely.
- Re-verified the session-security pass with:
  `pnpm --dir apps/tiktok test`,
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Ran the bundled `develop-web-game` client again against `#/profile` in `.artifacts/live-data/profile-sessions/client-profile/`:
  `state-0.json` correctly reflected the profile route and logged-out live state,
  while `shot-0.png` still captured only the shell background. Keep treating that as the same screenshot timing/tooling issue rather than a UI regression.
- Added mocked browser QA for the new session actions in `.artifacts/live-data/profile-sessions/`:
  `profile-before-actions.png/json` shows the authenticated profile with two sessions and all three security actions visible,
  `profile-after-revoke-other.png/json` shows the other session disappearing after revoke,
  and `profile-after-revoke-all.png/json` shows the profile returning to the login form after sign-out-everywhere.
- Extended the profile security flow again with frontend-style phone verification:
  `src/api/user-client.ts` now exposes `requestPhoneVerification()` and `confirmPhoneVerification()`,
  `LiveDataState` now tracks `phoneDraft`, `phoneCodeDraft`, `phoneStatus`, and per-submit loading flags,
  and `live-data-controller` now supports SMS-code request plus confirm-and-refresh behavior.
- The profile UI now renders a dedicated `Phone Verification` runtime card:
  pending accounts get a two-step flow (`SEND CODE` + `CONFIRM PHONE`),
  while verified accounts get a read-only cleared state showing the verified timestamp and the unlocked trust lane.
- Added phone-verification regression coverage in `tests/controllers/live-data-controller.test.ts`:
  requesting a code stores the phone draft and records a beat,
  confirming a code refreshes the session from the backend and flips `phoneVerifiedAt` on.
- Re-verified the phone-verification pass with:
  `pnpm --dir apps/tiktok test`,
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Ran the bundled `develop-web-game` client again against `#/profile` in `.artifacts/live-data/profile-phone/client-profile/`:
  `state-0.json` now also includes `phoneVerified` and `phoneStatus`,
  while `shot-0.png` still showed only the shell background. Keep treating that as the same screenshot timing/tooling issue rather than a UI regression.
- Added mocked browser QA for the new phone flow in `.artifacts/live-data/profile-phone/`:
  `profile-phone-before-actions.png/json` shows the pending two-step form,
  `profile-phone-after-send-code.png/json` shows the code-sent state and remembered destination number,
  and `profile-phone-after-confirm.png/json` shows the verified state after backend refresh.
- Extended the profile security surface again with frontend-style MFA/TOTP management:
  `src/api/user-client.ts` now exposes `getUserMfaStatus()`, `createUserMfaEnrollment()`, `verifyUserMfa()`, and `disableUserMfa()`,
  `LiveDataState` now tracks MFA summary, enrollment payload, draft TOTP code, status copy, and submit flags,
  and `live-data-controller` now supports begin-enrollment, verify-enrollment, and disable-MFA flows.
- The profile UI now renders a dedicated `MFA Guard` card:
  disabled accounts can start TOTP setup,
  in-progress enrollment shows the shared secret and OTPAuth URL plus a confirm form,
  enabled accounts show the backend withdrawal threshold and a disable form that requires the current TOTP code.
- Added MFA regression coverage in `tests/controllers/live-data-controller.test.ts`:
  one test covers enrollment + verification and a second test covers disabling MFA.
- Re-verified the MFA pass with:
  `pnpm --dir apps/tiktok test`,
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Ran the bundled `develop-web-game` client again against `#/profile` in `.artifacts/live-data/profile-mfa/client-profile/`:
  `state-0.json` now also includes `mfaEnabled`, `hasMfaEnrollment`, and `mfaStatus`,
  while `shot-0.png` still showed only the shell background. Keep treating that as the same screenshot timing/tooling issue rather than a UI regression.
- Added mocked browser QA for the new MFA flow in `.artifacts/live-data/profile-mfa/`:
  `profile-mfa-before-actions.png/json` shows MFA disabled,
  `profile-mfa-after-enrollment.png/json` shows the live enrollment secret + OTPAuth URL,
  `profile-mfa-after-verify.png/json` shows MFA enabled,
  and `profile-mfa-after-disable.png/json` shows the account returning to the disabled state.
- Extended the profile surface again with frontend-style notifications parity:
  `src/api/user-client.ts` now exposes `listNotifications()`, `getNotificationSummary()`, `markNotificationRead()`, `markAllNotificationsRead()`, `listNotificationPreferences()`, and `updateNotificationPreferences()`,
  `LiveDataState` now tracks notification feed rows, unread summary, delivery rules, notification lane status copy, and a shared mutation flag,
  and `live-data-controller` now supports feed refresh, single read, bulk read, and per-channel delivery-rule toggles.
- The profile UI now renders two new runtime cards:
  `Command Center` shows unread count, category totals, the recent in-app notification feed, and read actions;
  `Delivery Rules` shows a condensed notification-preferences matrix with backend-backed toggles for email / SMS / in-app delivery.
- Added notifications regression coverage in `tests/controllers/live-data-controller.test.ts`:
  login hydration now asserts notifications + summary + preference rules are present,
  one test covers marking a single item as read,
  and a second test covers bulk-read plus preference-toggle flows.
- Re-verified the notifications pass with:
  `pnpm --dir apps/tiktok test`,
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Ran the bundled `develop-web-game` client again against `#/profile` in `.artifacts/live-data/profile-notifications/client-profile/`:
  `state-0.json` now also includes `notificationCount`, `notificationUnreadCount`, `notificationPreferenceCount`, and `notificationStatus`,
  while `shot-0.png` still showed only the shell background. Keep treating that as the same screenshot timing/tooling issue rather than a UI regression.
- Added mocked browser QA for the notification center and delivery-rule flow in `.artifacts/live-data/profile-notifications/`:
  `profile-notifications-before-actions.png/json` shows the synced command-center state with one unread alert,
  and `profile-notifications-after-actions.png/json` shows the unread queue cleared plus the `security_alert / sms` rule toggled on.
- Promoted notifications from a profile-only section into a dedicated app tab:
  `AppTab` and routing now support `#/notifications`,
  the bottom nav now has a fifth `Alerts` entry,
  `src/views/notifications-view.ts` renders the full command-center page,
  and `profile-view.ts` now keeps only a compact alert-summary card plus an `Open Alerts` jump-off button.
- Added local notification-view state in `LiveDataState` for:
  `notificationFilter` (`all`, `rewards`, `games`, `market`, `security`)
  and `notificationUnreadOnly`,
  then wired those UI-only controls through `interaction-controller` and exposed them through `render_game_to_text`.
- Added shared notification helper logic in `src/views/notification-helpers.ts`:
  category mapping,
  count aggregation,
  filtered-feed derivation,
  notification-kind labels,
  channel labels,
  and grouped delivery-rule sections.
- Re-verified the dedicated notifications-tab pass with:
  `pnpm --dir apps/tiktok check`,
  `pnpm --dir apps/tiktok test`,
  `pnpm --dir apps/tiktok build`,
  `pnpm --dir apps/tiktok minis:build`.
- Ran the bundled `develop-web-game` client against `#/notifications` in `.artifacts/live-data/notifications-tab/client-notifications/`:
  `state-0.json` confirms the direct route now reconstructs `activeTab: "notifications"` with the new `notificationFilter` and `notificationUnreadOnly` fields,
  while `shot-0.png` still showed only the shell background. Keep treating that as the same screenshot timing/tooling issue rather than a UI regression.
- Added mocked browser QA for the dedicated alerts tab in `.artifacts/live-data/notifications-tab/`:
  `notifications-tab-before-actions.png/json` shows the full feed with 3 mixed-category alerts and the `Alerts` nav item active,
  and `notifications-tab-after-actions.png/json` shows the `security` filter + `Unread only` state plus the `security_alert / sms` delivery rule toggled on.
- Browser/IAB verification was attempted first, but Chrome DevTools MCP was blocked by an existing profile lock, so visual QA used Playwright fallback.
- Note: the bundled `develop-web-game` client was still attempted, but its click step remained flaky on the animated intro screen; the final validation used a custom Playwright script plus CDP screenshot capture instead.
- TODO: Replace placeholder portrait emoji with actual character art once assets exist.
- TODO: Consider adding a small “scratch dust” sound or haptic pulse when TikTok runtime hooks are available.
- TODO: Decide whether the top cash pill on the `rex` route should keep showing `$20` or switch to the active stake; current route work preserved the old behavior.
- TODO: If a local backend + seeded user account is available, run a full end-to-end visual pass for the authenticated live states (logged-in profile, synced wallet, and successful `Spin Live Draw` path) instead of only the unit-test-backed mock coverage.
- TODO: Continue the `frontend` account parity pass with notification push-device registration / quiet hours, or move sideways into wallet/security unlock copy that reacts to `phoneVerified` + `mfaEnabled` + unread security alerts.
