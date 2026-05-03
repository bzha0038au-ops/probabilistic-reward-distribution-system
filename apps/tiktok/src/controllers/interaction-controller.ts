import type { AppRoute, AppState, NotificationFilter } from "../app-types";
import type { PlayActionContext } from "../actions";
import {
  cashOut,
  continueTicket,
  faceRex,
  leaveTheTable,
  letRexHit,
  resetToIntro,
  startRun,
} from "../actions";
import type { LiveDataController } from "./live-data-controller";
import { getPlayRoute, isAppTab } from "../routes";
import {
  notificationChannelValues,
  notificationKindValues,
  type NotificationChannel,
  type NotificationKind,
} from "@reward/shared-types/notification";

interface InteractionControllerOptions {
  appRoot: HTMLDivElement;
  state: AppState;
  getActionContext: () => PlayActionContext;
  liveDataController: LiveDataController;
  navigateToRoute: (route: AppRoute) => void;
  render: () => void;
}

function isNotificationKind(value: string | undefined): value is NotificationKind {
  return typeof value === "string" && notificationKindValues.includes(value as NotificationKind);
}

function isNotificationChannel(value: string | undefined): value is NotificationChannel {
  return typeof value === "string" && notificationChannelValues.includes(value as NotificationChannel);
}

function isNotificationFilter(value: string | undefined): value is NotificationFilter {
  return (
    value === "all" ||
    value === "rewards" ||
    value === "games" ||
    value === "market" ||
    value === "security"
  );
}

export function bindInteractionController(options: InteractionControllerOptions): void {
  options.appRoot.addEventListener("submit", (event) => {
    const target = event.target as HTMLElement | null;

    const loginForm = target?.closest<HTMLFormElement>('[data-auth-form="login"]');
    if (loginForm) {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get("email") ?? "");
      const password = String(formData.get("password") ?? "");
      void options.liveDataController.submitLogin(email, password);
      return;
    }

    const phoneRequestForm = target?.closest<HTMLFormElement>('[data-phone-form="request"]');
    if (phoneRequestForm) {
      event.preventDefault();
      const formData = new FormData(phoneRequestForm);
      const phone = String(formData.get("phone") ?? "");
      void options.liveDataController.sendPhoneVerificationCode(phone);
      return;
    }

    const phoneConfirmForm = target?.closest<HTMLFormElement>('[data-phone-form="confirm"]');
    if (phoneConfirmForm) {
      event.preventDefault();
      const formData = new FormData(phoneConfirmForm);
      const code = String(formData.get("code") ?? "");
      void options.liveDataController.confirmPhoneVerification(code);
      return;
    }

    const mfaVerifyForm = target?.closest<HTMLFormElement>('[data-mfa-form="verify"]');
    if (mfaVerifyForm) {
      event.preventDefault();
      const formData = new FormData(mfaVerifyForm);
      const code = String(formData.get("totpCode") ?? "");
      void options.liveDataController.verifyMfaEnrollment(code);
      return;
    }

    const mfaDisableForm = target?.closest<HTMLFormElement>('[data-mfa-form="disable"]');
    if (mfaDisableForm) {
      event.preventDefault();
      const formData = new FormData(mfaDisableForm);
      const code = String(formData.get("totpCode") ?? "");
      void options.liveDataController.disableMfa(code);
    }
  });

  options.appRoot.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
    const action = target?.dataset.action;

    if (!action) {
      return;
    }

    if (action === "switch-tab") {
      const nextTab = target.dataset.tab;
      if (isAppTab(nextTab)) {
        options.navigateToRoute(nextTab === "play" ? getPlayRoute(options.state.play.stage) : { tab: nextTab });
      }
      return;
    }

    const actionContext = options.getActionContext();

    switch (action) {
      case "start-run":
        startRun(actionContext);
        return;
      case "continue-ticket":
        continueTicket(actionContext);
        return;
      case "cash-out":
        cashOut(actionContext);
        return;
      case "face-rex":
        faceRex(actionContext);
        return;
      case "rex-stand":
        leaveTheTable(actionContext);
        return;
      case "rex-hit":
        letRexHit(actionContext);
        return;
      case "play-again":
        resetToIntro(actionContext);
        return;
      case "refresh-live":
        void options.liveDataController.refreshDashboard();
        return;
      case "logout-live":
        void options.liveDataController.logout();
        return;
      case "revoke-live-session": {
        const sessionId = target.dataset.sessionId;
        if (sessionId) {
          void options.liveDataController.revokeSession(
            sessionId,
            target.dataset.sessionCurrent === "true",
          );
        }
        return;
      }
      case "revoke-all-live-sessions":
        void options.liveDataController.revokeAllSessions();
        return;
      case "send-email-verification":
        void options.liveDataController.sendVerificationEmail();
        return;
      case "begin-mfa-enrollment":
        void options.liveDataController.beginMfaEnrollment();
        return;
      case "refresh-notifications":
        void options.liveDataController.refreshNotifications();
        return;
      case "mark-all-notifications-read":
        void options.liveDataController.markAllNotificationsRead();
        return;
      case "mark-notification-read": {
        const rawNotificationId = target.dataset.notificationId;
        const notificationId = rawNotificationId ? Number.parseInt(rawNotificationId, 10) : Number.NaN;
        if (Number.isFinite(notificationId)) {
          void options.liveDataController.markNotificationRead(notificationId);
        }
        return;
      }
      case "toggle-notification-preference": {
        const kind = target.dataset.kind;
        const channel = target.dataset.channel;
        const enabled = target.dataset.enabled === "true";
        if (isNotificationKind(kind) && isNotificationChannel(channel)) {
          void options.liveDataController.updateNotificationPreference(kind, channel, !enabled);
        }
        return;
      }
      case "set-notification-filter": {
        const filter = target.dataset.filter;
        if (isNotificationFilter(filter)) {
          options.state.live.notificationFilter = filter;
          options.render();
        }
        return;
      }
      case "toggle-notification-unread-only":
        options.state.live.notificationUnreadOnly = !options.state.live.notificationUnreadOnly;
        options.render();
        return;
      case "claim-reward-mission": {
        const missionId = target.dataset.missionId;
        if (missionId) {
          void options.liveDataController.claimRewardMission(missionId);
        }
        return;
      }
      case "play-live-draw":
        void options.liveDataController.playLiveDraw();
        return;
      default:
        return;
    }
  });
}
