import type {
  RewardMission,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import type { MobileFairnessLocale } from "./fairness";

const mobileCopy = {
  en: {
    appHero: {
      kicker: "Reward System Native",
      title: "Production session lifecycle for mobile.",
      subtitle:
        "Secure storage, cold-start restore, backend-backed logout, session self-service, and native game routes.",
      authSubtitle:
        "Secure storage, cold-start restore, backend-backed logout, session self-service, and native password-recovery/email-verification flows.",
      endpointLabel: "API",
    },
    restoringSession: {
      title: "Restoring secure session...",
      subtitle:
        "Checking the saved token with the backend before showing the app.",
    },
    auth: {
      email: "Email",
      emailPlaceholder: "user@example.com",
      password: "Password",
      loginTitle: "Sign in",
      registerTitle: "Create account",
      loginSubtitle:
        "Uses the backend session lifecycle: create, persist, restore, revoke.",
      tabs: {
        login: "Login",
        register: "Register",
      },
      submit: {
        busy: "Submitting...",
        login: "Sign in",
        register: "Create account",
      },
      forgotPasswordLink: "Forgot password?",
      verifyEmailLink: "Open verification link",
      backToApp: "Back to app",
      backToSignIn: "Back to sign in",
      forgotPassword: {
        title: "Reset password",
        subtitle:
          "Request a recovery link, then open it in the app or paste it below.",
        submit: "Send recovery link",
        submitting: "Sending...",
        resetLinkReady: "I already have a reset link",
      },
      resetPassword: {
        title: "Choose a new password",
        subtitle: "Paste the recovery link or just the token from the email.",
        tokenLabel: "Recovery link or token",
        tokenPlaceholder: "reward-mobile://reset-password?token=...",
        passwordLabel: "New password",
        submit: "Reset password",
        submitting: "Updating...",
        requestAnotherLink: "Request another link",
      },
      verifyEmail: {
        title: "Verify email",
        subtitle:
          "Open the verification message on this device or paste the verification link.",
        tokenLabel: "Verification link or token",
        tokenPlaceholder: "reward-mobile://verify-email?token=...",
        submit: "Verify email",
        submitting: "Verifying...",
        resend: "Send another verification email",
        resending: "Sending verification email...",
      },
    },
    verificationCallout: {
      title: "Finish email verification",
      subtitle:
        "Gameplay routes stay read-only until the account email is verified.",
      send: "Send verification email",
      sending: "Sending verification...",
      open: "Open verification",
    },
    signedIn: {
      title: (email: string) => `Signed in as ${email}`,
      subtitle: (platform: string, role: string) =>
        `Platform: ${platform} · Role: ${role}`,
      unknownUser: "Unknown user",
      unknownRole: "unknown",
      emailVerified: "Email verified",
      emailNotVerified: "Email not verified",
      sessionActive: "Session active",
      sessionLoading: "Session loading",
      balance: (value: string) => `Balance ${value}`,
      refreshBalance: "Refresh balance",
      refreshSessions: "Refresh sessions",
      refreshing: "Refreshing...",
      signOut: "Sign out",
      signingOut: "Signing out...",
    },
    wallet: {
      title: "Wallet",
      subtitle: "Same `/wallet` endpoint as the web app.",
      currentBalance: "Current balance",
    },
    rewardCenter: {
      title: "Reward center",
      subtitle:
        "Same `/rewards/center` and `/rewards/claim` endpoints as the web app.",
      summary: {
        bonusBalance: "Bonus balance",
        checkInStreak: "Check-in streak",
        readyToClaim: "Ready to claim",
      },
      refresh: "Refresh rewards",
      refreshing: "Refreshing...",
      todayCheckInGranted: "Today's check-in granted",
      loading: "Loading reward missions...",
      empty: "No reward missions are configured yet.",
      statusLabels: {
        disabled: "Disabled",
        in_progress: "In progress",
        ready: "Ready",
        claimed: "Claimed",
      } satisfies Record<RewardMission["status"], string>,
      missionCopy: {
        daily_checkin: {
          title: "Daily check-in",
          description:
            "Sign in each day to keep the streak active and receive the daily auto bonus.",
        },
        profile_security: {
          title: "Security setup",
          description:
            "Verify email and phone to unlock finance tools and earn a profile setup bonus.",
        },
        first_draw: {
          title: "First draw",
          description:
            "Complete your first draw to start the engagement ladder.",
        },
        draw_streak_daily: {
          title: "Draw sprint",
          description:
            "Finish 3 draws in one day to unlock the daily sprint payout.",
        },
        top_up_starter: {
          title: "Top-up starter",
          description:
            "Create your first deposit request to unlock a starter economy reward.",
        },
      } satisfies Record<
        RewardMissionId,
        { title: string; description: string }
      >,
      autoAwardedBadge: "Auto",
      rewardAmount: "Bonus",
      progress: (current: number, target: number) =>
        `Progress ${current}/${target}`,
      claimedAt: (value: string) => `Claimed ${value}`,
      resetsAt: (value: string) => `Resets ${value}`,
      claimWhenReady: "Claim when progress is full.",
      autoAwardedNote: "Granted automatically on check-in.",
      claim: "Claim reward",
      claiming: "Claiming...",
    },
    sessionSecurity: {
      title: "Session security",
      subtitle:
        "List active sessions, revoke a single session, or sign out everywhere.",
      currentSessionId: (value: string) => `Current session ID: ${value}`,
      expiresSummary: (value: string) => `Expires: ${value}`,
      refresh: "Refresh list",
      refreshing: "Refreshing...",
      resetPassword: "Reset password",
      signOutEverywhere: "Sign out everywhere",
      loading: "Loading active sessions...",
      empty: "No active sessions found.",
      currentDevice: "Current device",
      activeSession: "Active session",
      currentBadge: "Current",
      id: (value: string) => `ID: ${value}`,
      ip: (value: string) => `IP: ${value}`,
      unavailable: "Unavailable",
      userAgent: (value: string) => `User-Agent: ${value}`,
      createdAt: (value: string) => `Created: ${value}`,
      lastSeenAt: (value: string) => `Last seen: ${value}`,
      expiresAt: (value: string) => `Expires: ${value}`,
      signOutDevice: "Sign out this device",
      revokeSession: "Revoke session",
    },
  },
  "zh-CN": {
    appHero: {
      kicker: "Reward System Native",
      title: "移动端生产级会话生命周期。",
      subtitle:
        "统一覆盖安全存储、冷启动恢复、后端驱动登出、会话自助管理和原生玩法路由。",
      authSubtitle:
        "统一覆盖安全存储、冷启动恢复、后端驱动登出、会话自助管理，以及原生找回密码和邮箱验证流程。",
      endpointLabel: "接口",
    },
    restoringSession: {
      title: "正在恢复安全会话...",
      subtitle: "先用已保存 token 向后端确认会话，再决定是否展示应用内容。",
    },
    auth: {
      email: "邮箱",
      emailPlaceholder: "user@example.com",
      password: "密码",
      loginTitle: "登录",
      registerTitle: "创建账户",
      loginSubtitle: "走后端真实会话生命周期：创建、持久化、恢复、撤销。",
      tabs: {
        login: "登录",
        register: "注册",
      },
      submit: {
        busy: "提交中...",
        login: "登录",
        register: "创建账户",
      },
      forgotPasswordLink: "忘记密码？",
      verifyEmailLink: "打开验证链接",
      backToApp: "返回应用",
      backToSignIn: "返回登录",
      forgotPassword: {
        title: "重置密码",
        subtitle: "先申请找回链接，然后在应用内打开，或者直接粘贴到下面。",
        submit: "发送找回链接",
        submitting: "发送中...",
        resetLinkReady: "我已经有重置链接了",
      },
      resetPassword: {
        title: "设置新密码",
        subtitle: "把找回链接整体贴进来，或者只贴邮件里的 token。",
        tokenLabel: "找回链接或 Token",
        tokenPlaceholder: "reward-mobile://reset-password?token=...",
        passwordLabel: "新密码",
        submit: "重置密码",
        submitting: "更新中...",
        requestAnotherLink: "重新申请链接",
      },
      verifyEmail: {
        title: "验证邮箱",
        subtitle: "直接在这台设备上打开验证邮件，或者把验证链接粘贴到这里。",
        tokenLabel: "验证链接或 Token",
        tokenPlaceholder: "reward-mobile://verify-email?token=...",
        submit: "验证邮箱",
        submitting: "验证中...",
        resend: "重新发送验证邮件",
        resending: "验证邮件发送中...",
      },
    },
    verificationCallout: {
      title: "完成邮箱验证",
      subtitle: "邮箱未验证前，玩法路由保持只读，不允许进入真实交互。",
      send: "发送验证邮件",
      sending: "发送验证中...",
      open: "打开验证页",
    },
    signedIn: {
      title: (email: string) => `当前登录：${email}`,
      subtitle: (platform: string, role: string) =>
        `平台：${platform} · 角色：${role}`,
      unknownUser: "未知用户",
      unknownRole: "未知",
      emailVerified: "邮箱已验证",
      emailNotVerified: "邮箱未验证",
      sessionActive: "会话有效",
      sessionLoading: "会话加载中",
      balance: (value: string) => `余额 ${value}`,
      refreshBalance: "刷新余额",
      refreshSessions: "刷新会话",
      refreshing: "刷新中...",
      signOut: "退出登录",
      signingOut: "退出中...",
    },
    wallet: {
      title: "钱包",
      subtitle: "直接复用与 Web 相同的 `/wallet` 接口。",
      currentBalance: "当前余额",
    },
    rewardCenter: {
      title: "奖励中心",
      subtitle:
        "直接复用与 Web 相同的 `/rewards/center` 和 `/rewards/claim` 接口。",
      summary: {
        bonusBalance: "奖励余额",
        checkInStreak: "签到连击",
        readyToClaim: "可领取",
      },
      refresh: "刷新奖励",
      refreshing: "刷新中...",
      todayCheckInGranted: "今日签到奖励已发放",
      loading: "正在加载奖励任务...",
      empty: "当前还没有配置奖励任务。",
      statusLabels: {
        disabled: "已停用",
        in_progress: "进行中",
        ready: "可领取",
        claimed: "已领取",
      } satisfies Record<RewardMission["status"], string>,
      missionCopy: {
        daily_checkin: {
          title: "每日签到",
          description: "每天签到以保持连续天数，并自动获得当日奖励。",
        },
        profile_security: {
          title: "安全设置",
          description: "完成邮箱和手机号验证，解锁资金工具并领取资料安全奖励。",
        },
        first_draw: {
          title: "首次抽奖",
          description: "完成第一次抽奖，启动你的活跃成长阶梯。",
        },
        draw_streak_daily: {
          title: "当日连抽",
          description: "单日完成 3 次抽奖，解锁每日冲刺奖励。",
        },
        top_up_starter: {
          title: "首充启动",
          description: "创建第一笔充值申请，解锁经济系统新手奖励。",
        },
      } satisfies Record<
        RewardMissionId,
        { title: string; description: string }
      >,
      autoAwardedBadge: "自动",
      rewardAmount: "奖励",
      progress: (current: number, target: number) =>
        `进度 ${current}/${target}`,
      claimedAt: (value: string) => `领取时间 ${value}`,
      resetsAt: (value: string) => `重置时间 ${value}`,
      claimWhenReady: "进度满后即可领取。",
      autoAwardedNote: "签到后自动发放。",
      claim: "领取奖励",
      claiming: "领取中...",
    },
    sessionSecurity: {
      title: "会话安全",
      subtitle: "查看活跃会话、撤销单个设备，或一键退出全部设备。",
      currentSessionId: (value: string) => `当前会话 ID：${value}`,
      expiresSummary: (value: string) => `过期时间：${value}`,
      refresh: "刷新列表",
      refreshing: "刷新中...",
      resetPassword: "重置密码",
      signOutEverywhere: "全部退出",
      loading: "正在加载活跃会话...",
      empty: "当前没有活跃会话。",
      currentDevice: "当前设备",
      activeSession: "活跃会话",
      currentBadge: "当前",
      id: (value: string) => `ID：${value}`,
      ip: (value: string) => `IP：${value}`,
      unavailable: "不可用",
      userAgent: (value: string) => `设备指纹：${value}`,
      createdAt: (value: string) => `创建时间：${value}`,
      lastSeenAt: (value: string) => `最后活跃：${value}`,
      expiresAt: (value: string) => `过期时间：${value}`,
      signOutDevice: "退出当前设备",
      revokeSession: "撤销会话",
    },
  },
} as const;

export function getMobileAppCopy(locale: MobileFairnessLocale) {
  return mobileCopy[locale];
}

export type MobileAppCopy = ReturnType<typeof getMobileAppCopy>;
export type MobileAuthCopy = MobileAppCopy["auth"];
export type MobileVerificationCalloutCopy =
  MobileAppCopy["verificationCallout"];
export type MobileSignedInCopy = MobileAppCopy["signedIn"];
export type MobileWalletCopy = MobileAppCopy["wallet"];
export type MobileRewardCenterCopy = MobileAppCopy["rewardCenter"];
export type MobileSessionSecurityCopy = MobileAppCopy["sessionSecurity"];
