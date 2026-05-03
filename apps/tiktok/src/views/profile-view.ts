import type { LiveDataState, RuntimeMode } from "../app-types";
import { PROFILE_FACTS } from "../game-content";
import { escapeHtml, formatApiMoney, formatTimestamp } from "../game-utils";
import { getNotificationCounts, getNotificationKindLabel } from "./notification-helpers";

interface ProfileViewOptions {
  live: LiveDataState;
  runtimeMode: RuntimeMode;
  runtimeMessage: string;
  runCount: number;
  eventLog: string[];
}

export function renderProfileView(options: ProfileViewOptions): string {
  return `
    <div class="view info-view">
      <div class="profile-hero">
        <div class="portrait portrait--yoyo portrait--small">
          <div class="portrait__glow"></div>
          <div class="portrait__animal">🐷</div>
        </div>
        <div>
          <div class="profile-hero__name">YOYO</div>
          <p>The kind of man who keeps calling greed a plan.</p>
        </div>
      </div>
      <section class="profile-facts">
        ${PROFILE_FACTS.map((fact) => `<article class="fact-chip">${fact}</article>`).join("")}
      </section>
      <section class="runtime-card">
        <div class="runtime-card__title">Live Account</div>
        <div class="status-line">
          <span class="status-pill status-pill--${options.live.authStatus}">${labelForStatus(options.live.authStatus)}</span>
          <span class="meta-pill">${escapeHtml(options.live.apiBaseUrl)}</span>
        </div>
        <p>${escapeHtml(options.live.authMessage)}</p>
        ${
          options.live.session
            ? `
              <div class="detail-list">
                <div class="detail-row"><span>Email</span><strong>${escapeHtml(options.live.session.user.email)}</strong></div>
                <div class="detail-row"><span>Session</span><strong>${escapeHtml(options.live.session.session.sessionId)}</strong></div>
                <div class="detail-row"><span>Email verified</span><strong>${options.live.session.user.emailVerifiedAt ? "Yes" : "No"}</strong></div>
                <div class="detail-row"><span>Expires</span><strong>${escapeHtml(formatTimestamp(options.live.session.session.expiresAt))}</strong></div>
              </div>
              ${
                options.live.session.user.emailVerifiedAt
                  ? ""
                  : `
                    <div class="verification-card">
                      <div class="verification-card__title">Email verification pending</div>
                      <p>Frontend uses the same endpoint to re-issue verification mail. This panel now does too.</p>
                      <button class="secondary-cta secondary-cta--small" data-action="send-email-verification">Resend Verification</button>
                    </div>
                  `
              }
              <div class="button-row">
                <button class="secondary-cta secondary-cta--small" data-action="refresh-live">Refresh Sync</button>
                <button class="secondary-cta secondary-cta--small secondary-cta--danger" data-action="logout-live">Log Out</button>
              </div>
            `
            : `
              <form class="auth-form" data-auth-form="login">
                <label class="auth-field">
                  <span>Email</span>
                  <input
                    autocomplete="username"
                    inputmode="email"
                    name="email"
                    placeholder="demo@reward.local"
                    type="email"
                    value="${escapeHtml(options.live.rememberedEmail)}"
                  />
                </label>
                <label class="auth-field">
                  <span>Password</span>
                  <input
                    autocomplete="current-password"
                    name="password"
                    placeholder="Enter your password"
                    type="password"
                  />
                </label>
                <button class="main-cta main-cta--compact" type="submit"${
                  options.live.authStatus === "loading" ? " disabled" : ""
                }>UNLOCK LIVE DATA</button>
              </form>
            `
        }
      </section>
      <section class="runtime-card">
        <div class="runtime-card__title">Wallet Sync</div>
        <div class="status-line">
          <span class="status-pill status-pill--${options.live.dashboardStatus}">${labelForStatus(options.live.dashboardStatus)}</span>
          <span class="meta-pill">${
            options.live.wallet ? "wallet ready" : "wallet offline"
          }</span>
        </div>
        <p>${escapeHtml(options.live.dashboardMessage)}</p>
      </section>
      ${renderPhoneVerificationPanel(options.live)}
      ${renderMfaPanel(options.live)}
      ${renderNotificationPreviewPanel(options.live)}
      ${renderSessionPanel(options.live)}
      ${renderRewardCenterPanel(options.live)}
      <section class="runtime-card">
        <div class="runtime-card__title">${options.runtimeMode === "tiktok" ? "TikTok runtime" : "Preview runtime"}</div>
        <p>${options.runtimeMessage}</p>
        <p>Runs played: ${options.runCount}</p>
      </section>
      <section class="log-card">
        <div class="runtime-card__title">Recent beats</div>
        <div class="log-list">
          ${
            options.eventLog.length
              ? options.eventLog.map((entry) => `<p>${entry}</p>`).join("")
              : "<p>No runs yet. Yoyo is still outside the bar.</p>"
          }
        </div>
      </section>
    </div>
  `;
}

function labelForStatus(status: LiveDataState["authStatus"]): string {
  switch (status) {
    case "loading":
      return "Syncing";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function renderSessionPanel(live: LiveDataState): string {
  if (!live.session) {
    return "";
  }

  return `
    <section class="runtime-card">
      <div class="runtime-card__head">
        <div>
          <div class="runtime-card__title">Active Sessions</div>
          <p>${live.sessions.length} session${live.sessions.length === 1 ? "" : "s"} currently visible to the shared backend.</p>
        </div>
        <button class="secondary-cta secondary-cta--small secondary-cta--danger" data-action="revoke-all-live-sessions">Sign Out Everywhere</button>
      </div>
      <div class="session-list">
        ${live.sessions.length
          ? live.sessions
              .slice(0, 4)
              .map(
                (entry) => `
                  <article class="session-item${entry.current ? " session-item--current" : ""}">
                    <div class="session-item__top">
                      <strong>${entry.current ? "Current device" : "Other session"}</strong>
                      <span>${escapeHtml(entry.kind)}</span>
                    </div>
                    <p>${escapeHtml(entry.userAgent ?? "Unknown agent")}</p>
                    <div class="session-item__meta">
                      <span>${escapeHtml(entry.ip ?? "No IP")}</span>
                      <span>${escapeHtml(formatTimestamp(entry.lastSeenAt))}</span>
                    </div>
                    <div class="session-item__actions">
                      <button
                        class="secondary-cta secondary-cta--small${entry.current ? " secondary-cta--danger" : ""}"
                        data-action="revoke-live-session"
                        data-session-id="${escapeHtml(entry.sessionId)}"
                        data-session-current="${entry.current ? "true" : "false"}"
                      >${entry.current ? "Sign Out This Device" : "Revoke Session"}</button>
                    </div>
                  </article>
                `,
              )
              .join("")
          : "<p>No active sessions returned.</p>"}
      </div>
    </section>
  `;
}

function renderPhoneVerificationPanel(live: LiveDataState): string {
  if (!live.session) {
    return "";
  }

  const phoneVerified = Boolean(live.session.user.phoneVerifiedAt);

  return `
    <section class="runtime-card">
      <div class="runtime-card__head">
        <div>
          <div class="runtime-card__title">Phone Verification</div>
          <p>Frontend uses the same SMS verification endpoints. This panel now does too.</p>
        </div>
        <span class="meta-pill">${phoneVerified ? "phone verified" : "sms pending"}</span>
      </div>
      <div class="status-line">
        <span class="status-pill status-pill--${live.phoneStatus}">${labelForStatus(live.phoneStatus)}</span>
        <span class="meta-pill">${phoneVerified ? "trusted lane unlocked" : "higher-trust actions locked"}</span>
      </div>
      <p>${escapeHtml(live.phoneMessage)}</p>
      ${
        phoneVerified
          ? `
            <div class="verification-card">
              <div class="verification-card__title">Phone verified</div>
              <p>Verified at ${escapeHtml(formatTimestamp(live.session.user.phoneVerifiedAt))}. Finance and higher-trust account lanes can treat this profile as cleared.</p>
            </div>
          `
          : `
            <div class="security-form-grid">
              <form class="verification-card" data-phone-form="request">
                <div class="verification-card__title">1. Send SMS code</div>
                <label class="auth-field">
                  <span>Phone number</span>
                  <input
                    autocomplete="tel"
                    inputmode="tel"
                    name="phone"
                    placeholder="+61 4xx xxx xxx"
                    type="tel"
                    value="${escapeHtml(live.phoneDraft)}"
                  />
                </label>
                <button class="secondary-cta secondary-cta--small" type="submit"${
                  live.phoneRequestSubmitting ? " disabled" : ""
                }>${live.phoneRequestSubmitting ? "SENDING..." : "SEND CODE"}</button>
              </form>
              <form class="verification-card" data-phone-form="confirm">
                <div class="verification-card__title">2. Confirm code</div>
                <p>${escapeHtml(live.phoneDraft ? `Code destination: ${live.phoneDraft}` : "Request a code first, then enter the 6-digit SMS code here.")}</p>
                <label class="auth-field">
                  <span>SMS code</span>
                  <input
                    autocomplete="one-time-code"
                    inputmode="numeric"
                    name="code"
                    placeholder="123456"
                    type="text"
                    value="${escapeHtml(live.phoneCodeDraft)}"
                  />
                </label>
                <button class="main-cta main-cta--compact" type="submit"${
                  live.phoneConfirmSubmitting ? " disabled" : ""
                }>${live.phoneConfirmSubmitting ? "VERIFYING..." : "CONFIRM PHONE"}</button>
              </form>
            </div>
          `
      }
    </section>
  `;
}

function renderMfaPanel(live: LiveDataState): string {
  if (!live.session) {
    return "";
  }

  const mfaEnabled = Boolean(live.mfaSummary?.mfaEnabled);
  const thresholdLabel = live.mfaSummary
    ? formatApiMoney(live.mfaSummary.largeWithdrawalThreshold)
    : "loading";

  return `
    <section class="runtime-card">
      <div class="runtime-card__head">
        <div>
          <div class="runtime-card__title">MFA Guard</div>
          <p>The shared backend already exposes TOTP enrollment and disable endpoints. This panel now uses them.</p>
        </div>
        <span class="meta-pill">${mfaEnabled ? "mfa enabled" : "totp optional"}</span>
      </div>
      <div class="status-line">
        <span class="status-pill status-pill--${live.mfaStatus}">${labelForStatus(live.mfaStatus)}</span>
        <span class="meta-pill">threshold ${escapeHtml(thresholdLabel)}</span>
      </div>
      <p>${escapeHtml(live.mfaMessage)}</p>
      ${
        mfaEnabled
          ? `
            <div class="verification-card">
              <div class="verification-card__title">Disable MFA</div>
              <p>Enter the current TOTP code if you want to return this account to email + phone only.</p>
              <form data-mfa-form="disable" class="security-inline-form">
                <label class="auth-field">
                  <span>TOTP code</span>
                  <input
                    autocomplete="one-time-code"
                    inputmode="numeric"
                    name="totpCode"
                    placeholder="123456"
                    type="text"
                    value="${escapeHtml(live.mfaCodeDraft)}"
                  />
                </label>
                <button class="secondary-cta secondary-cta--small secondary-cta--danger" type="submit"${
                  live.mfaDisableSubmitting ? " disabled" : ""
                }>${live.mfaDisableSubmitting ? "DISABLING..." : "DISABLE MFA"}</button>
              </form>
            </div>
          `
          : live.mfaEnrollment
            ? `
              <div class="security-form-grid">
                <div class="verification-card">
                  <div class="verification-card__title">1. Save the authenticator secret</div>
                  <label class="auth-field">
                    <span>Shared secret</span>
                    <textarea class="runtime-textarea" readonly>${escapeHtml(live.mfaEnrollment.secret)}</textarea>
                  </label>
                  <label class="auth-field">
                    <span>OTPAuth URL</span>
                    <textarea class="runtime-textarea" readonly>${escapeHtml(live.mfaEnrollment.otpauthUrl)}</textarea>
                  </label>
                </div>
                <form class="verification-card" data-mfa-form="verify">
                  <div class="verification-card__title">2. Confirm TOTP</div>
                  <p>Paste the 6-digit code from your authenticator app to finish MFA setup.</p>
                  <label class="auth-field">
                    <span>TOTP code</span>
                    <input
                      autocomplete="one-time-code"
                      inputmode="numeric"
                      name="totpCode"
                      placeholder="123456"
                      type="text"
                      value="${escapeHtml(live.mfaCodeDraft)}"
                    />
                  </label>
                  <button class="main-cta main-cta--compact" type="submit"${
                    live.mfaVerifySubmitting ? " disabled" : ""
                  }>${live.mfaVerifySubmitting ? "VERIFYING..." : "ENABLE MFA"}</button>
                </form>
              </div>
            `
            : `
              <div class="verification-card">
                <div class="verification-card__title">Start TOTP setup</div>
                <p>Enable MFA before higher-trust wallet actions need it automatically.</p>
                <button class="secondary-cta secondary-cta--small" data-action="begin-mfa-enrollment"${
                  live.mfaEnrollSubmitting ? " disabled" : ""
                }>${live.mfaEnrollSubmitting ? "OPENING..." : "BEGIN MFA SETUP"}</button>
              </div>
            `
      }
    </section>
  `;
}

function renderNotificationPreviewPanel(live: LiveDataState): string {
  if (!live.session) {
    return "";
  }

  const categoryCounts = getNotificationCounts(live.notifications);
  const unreadCount =
    live.notificationSummary?.unreadCount ??
    live.notifications.filter((item) => !item.readAt).length;
  const headline = live.notifications.find((item) => !item.readAt) ?? live.notifications[0] ?? null;

  return `
    <section class="runtime-card">
      <div class="runtime-card__head">
        <div>
          <div class="runtime-card__title">Alert Queue</div>
          <p>Frontend-style notifications now have their own tab. This card stays as the account-level summary.</p>
        </div>
        <span class="meta-pill">${unreadCount} unread</span>
      </div>
      <div class="status-line">
        <span class="status-pill status-pill--${live.notificationStatus}">${labelForStatus(live.notificationStatus)}</span>
        <span class="meta-pill">${
          live.notificationSummary?.latestCreatedAt
            ? `latest ${escapeHtml(formatTimestamp(live.notificationSummary.latestCreatedAt))}`
            : "feed quiet"
        }</span>
      </div>
      <p>${escapeHtml(live.notificationMessage)}</p>
      <div class="detail-list">
        <div class="detail-row"><span>Security alerts</span><strong>${categoryCounts.security}</strong></div>
        <div class="detail-row"><span>Reward alerts</span><strong>${categoryCounts.rewards}</strong></div>
        <div class="detail-row"><span>Market alerts</span><strong>${categoryCounts.market}</strong></div>
        <div class="detail-row"><span>Game alerts</span><strong>${categoryCounts.games}</strong></div>
      </div>
      ${
        headline
          ? `
            <div class="verification-card">
              <div class="verification-card__title">${escapeHtml(headline.title)}</div>
              <p>${escapeHtml(headline.body)}</p>
              <small class="mission-card__hint">${escapeHtml(getNotificationKindLabel(headline.kind))}</small>
            </div>
          `
          : ""
      }
      <div class="button-row">
        <button class="secondary-cta secondary-cta--small" data-action="switch-tab" data-tab="notifications">Open Alerts</button>
        <button class="secondary-cta secondary-cta--small" data-action="refresh-notifications"${
          live.notificationMutating ? " disabled" : ""
        }>${live.notificationMutating ? "SYNCING..." : "Refresh Feed"}</button>
      </div>
    </section>
  `;
}

function renderRewardCenterPanel(live: LiveDataState): string {
  if (!live.session) {
    return "";
  }

  if (!live.rewardCenter) {
    return `
      <section class="runtime-card">
        <div class="runtime-card__title">Reward Center</div>
        <p>Reward center data has not loaded yet.</p>
      </section>
    `;
  }

  return `
    <section class="runtime-card">
      <div class="runtime-card__title">Reward Center</div>
      <div class="detail-list">
        <div class="detail-row"><span>Bonus balance</span><strong>${formatApiMoney(live.rewardCenter.summary.bonusBalance)}</strong></div>
        <div class="detail-row"><span>Streak days</span><strong>${live.rewardCenter.summary.streakDays}</strong></div>
        <div class="detail-row"><span>Available</span><strong>${live.rewardCenter.summary.availableMissionCount}</strong></div>
      </div>
      <div class="mission-list">
        ${live.rewardCenter.missions
          .slice(0, 4)
          .map(
            (mission) => `
              <article class="mission-card">
                <div class="mission-card__top">
                  <strong>${escapeHtml(mission.title)}</strong>
                  <span>${escapeHtml(mission.status)}</span>
                </div>
                <p>${escapeHtml(mission.description)}</p>
                <div class="mission-card__meta">
                  <span>${mission.progressCurrent}/${mission.progressTarget}</span>
                  <strong>${formatApiMoney(mission.rewardAmount)}</strong>
                </div>
                ${
                  mission.claimable
                    ? `<button class="secondary-cta secondary-cta--small" data-action="claim-reward-mission" data-mission-id="${escapeHtml(mission.id)}">Claim Mission</button>`
                    : `<small class="mission-card__hint">${mission.autoAwarded ? "Auto awarded" : "Keep playing to unlock this reward."}</small>`
                }
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}
