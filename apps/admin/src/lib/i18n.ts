import type { RequestEvent } from "@sveltejs/kit"
import { zhCNMessages } from "./i18n-zh-CN"

export type Locale = "en" | "zh-CN"

export type Messages = {
  common: {
    appName: string
    signIn: string
    signOut: string
    email: string
    password: string
    adminLabel: string
    navAdmin: string
    navFinance: string
    navSecurity: string
    totpCode: string
    prev: string
    next: string
  }
  login: {
    title: string
    eyebrow: string
    heading: string
    description: string
    emailPlaceholder: string
    totpPlaceholder: string
    breakGlassCode: string
    breakGlassPlaceholder: string
    submit: string
  }
  admin: {
    eyebrow: string
    heading: string
    description: string
    mfa: {
      title: string
      description: string
      enabled: string
      disabled: string
      start: string
      secret: string
      otpauthUrl: string
      codePlaceholder: string
      confirm: string
      enabledHint: string
      recoveryCodesTitle: string
      recoveryCodesHint: string
      recoveryCodesRemaining: string
      regenerateRecoveryCodes: string
      disable: string
      disableHint: string
      disableAfterRecovery: string
      disableRecoveryHint: string
      recoveryCodeSessionActive: string
      breakGlassRecoveryActive: string
      breakGlassConfigured: string
      breakGlassMissing: string
    }
    stepUp: {
      title: string
      description: string
      placeholder: string
      mfaRequired: string
    }
    config: {
      title: string
      description: string
      poolBalance: string
      drawCost: string
      weightJitterEnabled: string
      weightJitterPct: string
      bonusAutoReleaseEnabled: string
      bonusUnlockWagerRatio: string
      authFailureWindowMinutes: string
      authFailureFreezeThreshold: string
      adminFailureFreezeThreshold: string
      submit: string
    }
    bonus: {
      title: string
      description: string
      userId: string
      amount: string
      amountPlaceholder: string
      release: string
      autoReleaseHint: string
    }
    metrics: {
      totalDraws: string
      winRate: string
      poolBalance: string
    }
    create: {
      title: string
      description: string
      submit: string
    }
    edit: {
      title: string
      description: string
      empty: string
      save: string
      cancel: string
    }
    form: {
      name: string
      stock: string
      weight: string
      poolThreshold: string
      userPoolThreshold: string
      rewardAmount: string
      payoutBudget: string
      payoutPeriodDays: string
      isActive: string
    }
    table: {
      title: string
      description: string
      headers: {
        name: string
        stock: string
        weight: string
        threshold: string
        userThreshold: string
        reward: string
        budget: string
        period: string
        status: string
        actions: string
      }
      statusActive: string
      statusInactive: string
      actionEdit: string
      actionToggle: string
      actionDelete: string
      empty: string
    }
    topSpenders: {
      title: string
      userId: string
      spend: string
    }
    confirmDelete: string
  }
  finance: {
    title: string
    description: string
    stepUp: {
      title: string
      description: string
      placeholder: string
      processingChannel: string
      processingChannelPlaceholder: string
      settlementReference: string
      settlementReferencePlaceholder: string
      confirmations: string
      confirmationsPlaceholder: string
      operatorNote: string
      operatorNotePlaceholder: string
    }
    processing: {
      manual: string
      provider: string
      manualPending: string
      noActiveProvider: string
      manualReviewRequired: string
      providerNotImplemented: string
      manualReviewMode: string
      outsideGrayScope: string
      riskManualReviewRequired: string
    }
    capabilities: {
      title: string
      description: string
      manualOnly: string
      automatedRequested: string
      mode: string
      modeManualReview: string
      modeAutomated: string
      activeProviders: string
      configuredAdapters: string
      registeredAdapters: string
      implementedAdapters: string
      missingCapabilities: string
      governanceTitle: string
      governanceDescription: string
      editableFields: string
      secretReferenceFields: string
      secretReferenceContainer: string
      secretStorage: string
      secretStorageSecretManagerOrKms: string
      configIssueDetected: string
      noConfigIssues: string
      fieldIsActive: string
      fieldPriority: string
      fieldSupportedFlows: string
      fieldGrayCountryCodes: string
      fieldGrayCurrencies: string
      fieldGrayMinAmount: string
      fieldGrayMaxAmount: string
      fieldGrayRules: string
      fieldSingleTransactionLimit: string
      fieldDailyLimit: string
      fieldCurrency: string
      fieldCallbackWhitelist: string
      fieldRouteTags: string
      fieldRiskThresholds: string
      fieldApiKey: string
      fieldPrivateKey: string
      fieldCertificate: string
      fieldSigningKey: string
      none: string
      gapOutboundGatewayExecution: string
      gapWebhookEntrypoint: string
      gapWebhookSignature: string
      gapIdempotency: string
      gapReconciliation: string
      gapCompensation: string
    }
    channels: {
      fiat: string
      crypto: string
    }
    cryptoChannels: {
      title: string
      description: string
      createTitle: string
      createDescription: string
      providerId: string
      providerIdPlaceholder: string
      chain: string
      chainPlaceholder: string
      network: string
      networkPlaceholder: string
      token: string
      tokenPlaceholder: string
      receiveAddress: string
      receiveAddressPlaceholder: string
      qrCodeUrl: string
      qrCodeUrlPlaceholder: string
      memoRequired: string
      memoRequiredOnly: string
      memoValue: string
      memoValuePlaceholder: string
      minConfirmations: string
      isActive: string
      submit: string
      statusActive: string
      statusInactive: string
      empty: string
      headers: {
        id: string
        providerId: string
        asset: string
        receiveAddress: string
        memo: string
        confirmations: string
        status: string
        updatedAt: string
      }
    }
    deposits: {
      title: string
      description: string
      headers: {
        id: string
        userId: string
        amount: string
        status: string
        processing: string
        review: string
        createdAt: string
        actions: string
      }
      statusRequested: string
      statusProviderPending: string
      statusProviderSucceeded: string
      statusCredited: string
      statusProviderFailed: string
      statusReversed: string
      actionProviderPending: string
      actionProviderSucceeded: string
      actionCredit: string
      actionProviderFail: string
      actionCryptoConfirm: string
      actionCryptoReject: string
      actionReverse: string
      empty: string
    }
    withdrawals: {
      title: string
      description: string
      headers: {
        id: string
        userId: string
        amount: string
        status: string
        bankCardId: string
        processing: string
        review: string
        createdAt: string
        actions: string
      }
      statusRequested: string
      statusPendingSecondApproval: string
      statusApproved: string
      statusProviderSubmitted: string
      statusProviderProcessing: string
      statusProviderFailed: string
      statusRejected: string
      statusPaid: string
      statusReversed: string
      actionApprove: string
      actionSecondApprove: string
      actionProviderSubmit: string
      actionProviderProcessing: string
      actionProviderFail: string
      actionCryptoSubmit: string
      actionCryptoConfirm: string
      actionReject: string
      actionPay: string
      actionReverse: string
      riskSignals: string
      riskSignalNewCardFirstWithdrawal: string
      riskSignalSharedIpCluster: string
      riskSignalSharedDeviceCluster: string
      riskSignalSharedPayoutDestinationCluster: string
      empty: string
    }
  }
  security: {
    title: string
    description: string
    stepUp: {
      title: string
      description: string
      placeholder: string
    }
    filters: {
      title: string
      description: string
      email: string
      eventType: string
      from: string
      to: string
      limit: string
      sort: string
      sortNewest: string
      sortOldest: string
      apply: string
      export: string
    }
    authEvents: {
      title: string
      description: string
      headers: {
        id: string
        email: string
        userId: string
        eventType: string
        ip: string
        userAgent: string
        createdAt: string
      }
      empty: string
    }
    alerts: {
      title: string
      description: string
      empty: string
      signals: string
      previousIp: string
    }
    freeze: {
      title: string
      description: string
      createTitle: string
      createDescription: string
      userId: string
      reason: string
      reasonPlaceholder: string
      freeze: string
      limit: string
      sort: string
      sortNewest: string
      sortOldest: string
      headers: {
        id: string
        userId: string
        reason: string
        status: string
        createdAt: string
        actions: string
      }
      release: string
      empty: string
    }
    adminActions: {
      title: string
      description: string
      export: string
      filters: {
        adminId: string
        action: string
        from: string
        to: string
        limit: string
        sort: string
        sortNewest: string
        sortOldest: string
        apply: string
      }
      headers: {
        id: string
        adminId: string
        action: string
        targetType: string
        targetId: string
        ip: string
        sessionId: string
        userAgent: string
        createdAt: string
      }
      empty: string
    }
  }
}

export const LOCALE_COOKIE = "reward_locale"
export const DEFAULT_LOCALE: Locale = "en"
export const SUPPORTED_LOCALES: Locale[] = ["en", "zh-CN"]

const translations: Record<Locale, Messages> = {
  en: {
    common: {
      appName: "Prize Pool Admin",
      signIn: "Sign In",
      signOut: "Sign Out",
      email: "Email",
      password: "Password",
      adminLabel: "Admin",
      navAdmin: "Control",
      navFinance: "Finance",
      navSecurity: "Security",
      totpCode: "MFA Code",
      prev: "Prev",
      next: "Next",
    },
    login: {
      title: "Admin Sign In",
      eyebrow: "Admin Portal",
      heading: "Sign in to manage the prize pool",
      description:
        "Use your admin credentials to access analytics and prize controls.",
      emailPlaceholder: "admin@reward.dev",
      totpPlaceholder:
        "Use an authenticator code or a recovery code when MFA is enabled",
      breakGlassCode: "Emergency Code",
      breakGlassPlaceholder: "Only use for audited break-glass recovery",
      submit: "Sign In",
    },
    admin: {
      eyebrow: "Admin Console",
      heading: "Prize Pool Control Center",
      description:
        "Configure prizes, tune weights, and monitor draw performance.",
      mfa: {
        title: "Admin MFA",
        description:
          "Enroll a TOTP authenticator before using finance or config changes.",
        enabled: "Enabled",
        disabled: "Not enabled",
        start: "Start MFA Enrollment",
        secret: "Manual Secret",
        otpauthUrl: "OTPAuth URL",
        codePlaceholder: "Enter the 6-digit code from your authenticator",
        confirm: "Enable MFA",
        enabledHint: "MFA is active for this admin account.",
        recoveryCodesTitle: "Recovery Codes",
        recoveryCodesHint:
          "Store these codes offline now. Each code works once, and they will not be shown again.",
        recoveryCodesRemaining: "Recovery codes remaining",
        regenerateRecoveryCodes: "Regenerate Recovery Codes",
        disable: "Disable MFA",
        disableHint:
          "Disabling MFA requires a fresh MFA code and will revoke other admin sessions.",
        disableAfterRecovery: "Disable MFA and Re-Enroll",
        disableRecoveryHint:
          "Recovery mode is active. Disable MFA now, then start a fresh enrollment before doing sensitive work.",
        recoveryCodeSessionActive:
          "You signed in with a recovery code. Finish the recovery flow before using sensitive admin actions.",
        breakGlassRecoveryActive:
          "You signed in with the break-glass path. Re-enroll MFA before resuming normal admin work.",
        breakGlassConfigured:
          "Break-glass recovery is configured on the backend for emergency lockout handling.",
        breakGlassMissing:
          "Break-glass recovery is not configured. Set ADMIN_MFA_BREAK_GLASS_SECRET before relying on this environment.",
      },
      stepUp: {
        title: "High-Risk Step-Up",
        description:
          "Finance approvals, payouts, freezes, and config changes require a fresh MFA or recovery code.",
        placeholder: "Enter an MFA code before submitting high-risk actions",
        mfaRequired: "Enable MFA first to perform high-risk actions.",
      },
      config: {
        title: "System Controls",
        description: "Adjust pool balance, draw cost, and randomization.",
        poolBalance: "Pool Balance",
        drawCost: "Draw Cost",
        weightJitterEnabled: "Enable Weight Jitter",
        weightJitterPct: "Weight Jitter %",
        bonusAutoReleaseEnabled: "Auto Release Bonus",
        bonusUnlockWagerRatio: "Bonus Unlock Wager Ratio",
        authFailureWindowMinutes: "Auth Failure Window (min)",
        authFailureFreezeThreshold: "User Freeze Threshold",
        adminFailureFreezeThreshold: "Admin Freeze Threshold",
        submit: "Update Settings",
      },
      bonus: {
        title: "Bonus Release",
        description:
          "Manually unlock bonus balance when auto release is disabled.",
        userId: "User ID",
        amount: "Amount",
        amountPlaceholder: "Leave empty to release all",
        release: "Release Bonus",
        autoReleaseHint:
          "Auto release is enabled. Disable it to release manually.",
      },
      metrics: {
        totalDraws: "Total Draws",
        winRate: "Win Rate",
        poolBalance: "Pool Balance",
      },
      create: {
        title: "Create Prize",
        description: "Set stock, weight, and reward values.",
        submit: "Create Prize",
      },
      edit: {
        title: "Edit Prize",
        description: "Select a prize from the table to edit.",
        empty: "Select a prize to edit its configuration.",
        save: "Save Changes",
        cancel: "Cancel",
      },
      form: {
        name: "Name",
        stock: "Stock",
        weight: "Weight",
        poolThreshold: "Pool Threshold",
        userPoolThreshold: "User Pool Threshold",
        rewardAmount: "Reward Amount",
        payoutBudget: "Payout Budget",
        payoutPeriodDays: "Payout Period (Days)",
        isActive: "Active",
      },
      table: {
        title: "Prize Pool",
        description: "Active prizes and stock levels.",
        headers: {
          name: "Name",
          stock: "Stock",
          weight: "Weight",
          threshold: "Threshold",
          userThreshold: "User Threshold",
          reward: "Reward",
          budget: "Budget",
          period: "Period",
          status: "Status",
          actions: "Actions",
        },
        statusActive: "Active",
        statusInactive: "Inactive",
        actionEdit: "Edit",
        actionToggle: "Toggle",
        actionDelete: "Delete",
        empty: "No prizes yet.",
      },
      topSpenders: {
        title: "Top Spenders",
        userId: "User ID",
        spend: "Spend",
      },
      confirmDelete: "Soft delete this prize?",
    },
    finance: {
      title: "Finance Operations",
      description:
        "Approve deposits and manage withdrawals. Real-money movement remains manual-review only.",
      stepUp: {
        title: "Finance Step-Up",
        description: "Finance mutations require a fresh MFA or recovery code.",
        placeholder: "Enter an MFA code before approving or rejecting",
        processingChannel: "Processing Channel",
        processingChannelPlaceholder:
          "Manual bank transfer, wallet handoff, etc.",
        settlementReference: "Settlement Reference",
        settlementReferencePlaceholder:
          "Bank serial, payout ticket, receipt id",
        confirmations: "Confirmations",
        confirmationsPlaceholder: "Used for chain review only",
        operatorNote: "Operator Note",
        operatorNotePlaceholder:
          "Record why this request stayed manual or any verification notes.",
      },
      processing: {
        manual: "Manual",
        provider: "Provider",
        manualPending: "Awaiting manual handling",
        noActiveProvider: "No active payment provider configured",
        manualReviewRequired: "Configured for manual review",
        providerNotImplemented: "Gateway execution not implemented in backend",
        manualReviewMode: "Global payment mode is still manual review",
        outsideGrayScope: "Order stayed outside the current gray rollout scope",
        riskManualReviewRequired: "Risk hit, route through manual review",
      },
      capabilities: {
        title: "Payment Execution Status",
        description:
          "Configured providers can route orders into finance review. Scheduled reconciliation and a manual diff queue exist, but this stack still does not own outbound gateway execution, signed callbacks, retries, or recovery.",
        manualOnly:
          "This backend is restricted to manual-review payment operations. Do not enable automated real-money settlement.",
        automatedRequested:
          "Automated payment mode was requested, but startup and readiness stay blocked until the full money-movement loop exists.",
        mode: "Operating mode",
        modeManualReview: "Manual review only",
        modeAutomated: "Automated mode requested",
        activeProviders: "Active providers",
        configuredAdapters: "Configured provider adapters",
        registeredAdapters: "Registered code adapters",
        implementedAdapters: "Implemented automated adapters",
        missingCapabilities: "Missing automation capabilities",
        governanceTitle: "Provider Config Governance",
        governanceDescription:
          "Only operational routing fields belong in payment_providers.config. API keys, private keys, certificates, and signing keys must stay in a secret manager or KMS, with only reference ids stored here.",
        editableFields: "Admin-editable fields",
        secretReferenceFields: "Secret reference fields",
        secretReferenceContainer: "Reference container",
        secretStorage: "Secret storage requirement",
        secretStorageSecretManagerOrKms: "Secret manager / KMS",
        configIssueDetected:
          "Detected payment provider configs that still contain plaintext credentials.",
        noConfigIssues:
          "No plaintext payment credentials were detected in active provider configs.",
        fieldIsActive: "Channel switch",
        fieldPriority: "Priority",
        fieldSupportedFlows: "Supported flows",
        fieldGrayCountryCodes: "Gray country codes",
        fieldGrayCurrencies: "Gray currencies",
        fieldGrayMinAmount: "Gray min amount",
        fieldGrayMaxAmount: "Gray max amount",
        fieldGrayRules: "Gray rollout rules",
        fieldSingleTransactionLimit: "Single-transaction limit",
        fieldDailyLimit: "Daily limit",
        fieldCurrency: "Currency",
        fieldCallbackWhitelist: "Callback whitelist",
        fieldRouteTags: "Route tags",
        fieldRiskThresholds: "Risk thresholds",
        fieldApiKey: "API key",
        fieldPrivateKey: "Private key",
        fieldCertificate: "Certificate",
        fieldSigningKey: "Signing key",
        none: "None",
        gapOutboundGatewayExecution: "Outbound gateway execution",
        gapWebhookEntrypoint: "Payment webhook callback entrypoint",
        gapWebhookSignature: "Webhook signature verification",
        gapIdempotency: "Idempotent retries and replay protection",
        gapReconciliation: "Automated reconciliation",
        gapCompensation: "Compensation and recovery workflows",
      },
      channels: {
        fiat: "Fiat",
        crypto: "Crypto",
      },
      cryptoChannels: {
        title: "Crypto Deposit Channels",
        description:
          "Configure the receive addresses and chain rules shown to users before they submit a manual crypto deposit claim.",
        createTitle: "Add Receive Channel",
        createDescription:
          "Each channel represents one chain, network, token, and destination address used by the crypto manual-review flow.",
        providerId: "Provider ID",
        providerIdPlaceholder: "Optional payment provider id",
        chain: "Chain",
        chainPlaceholder: "Ethereum",
        network: "Network",
        networkPlaceholder: "ERC20, TRC20, BEP20",
        token: "Token",
        tokenPlaceholder: "USDT",
        receiveAddress: "Receive Address",
        receiveAddressPlaceholder:
          "Deposit address shown to users for manual transfer",
        qrCodeUrl: "QR Code URL",
        qrCodeUrlPlaceholder: "Optional hosted QR image",
        memoRequired: "Require memo / tag",
        memoRequiredOnly: "Required",
        memoValue: "Memo / Tag Value",
        memoValuePlaceholder: "Destination tag, memo, payment id",
        minConfirmations: "Min Confirmations",
        isActive: "Active",
        submit: "Create Channel",
        statusActive: "Active",
        statusInactive: "Inactive",
        empty: "No crypto deposit channels configured.",
        headers: {
          id: "ID",
          providerId: "Provider",
          asset: "Asset",
          receiveAddress: "Receive Address",
          memo: "Memo / Tag",
          confirmations: "Confirmations",
          status: "Status",
          updatedAt: "Updated",
        },
      },
      deposits: {
        title: "Deposits",
        description: "Track provider progress and wallet credit explicitly.",
        headers: {
          id: "ID",
          userId: "User ID",
          amount: "Amount",
          status: "Status",
          processing: "Processing",
          review: "Latest Review",
          createdAt: "Created",
          actions: "Actions",
        },
        statusRequested: "Requested",
        statusProviderPending: "Provider pending",
        statusProviderSucceeded: "Settled",
        statusCredited: "Credited",
        statusProviderFailed: "Failed",
        statusReversed: "Reversed",
        actionProviderPending: "Provider pending",
        actionProviderSucceeded: "Mark settled",
        actionCredit: "Credit wallet",
        actionProviderFail: "Mark failed",
        actionCryptoConfirm: "Confirm on-chain",
        actionCryptoReject: "Reject claim",
        actionReverse: "Reverse",
        empty: "No deposits found.",
      },
      withdrawals: {
        title: "Withdrawals",
        description: "Move withdrawals through approval, provider, and payout stages.",
        headers: {
          id: "ID",
          userId: "User ID",
          amount: "Amount",
          status: "Status",
          bankCardId: "Payout Method",
          processing: "Processing",
          review: "Latest Review",
          createdAt: "Created",
          actions: "Actions",
        },
        statusRequested: "Requested",
        statusPendingSecondApproval: "Pending second approval",
        statusApproved: "Approved",
        statusProviderSubmitted: "Paying",
        statusProviderProcessing: "Paying",
        statusProviderFailed: "Failed",
        statusRejected: "Rejected",
        statusPaid: "Paid",
        statusReversed: "Reversed",
        actionApprove: "Approve",
        actionSecondApprove: "Second approve",
        actionProviderSubmit: "Start paying",
        actionProviderProcessing: "Update paying",
        actionProviderFail: "Mark failed",
        actionCryptoSubmit: "Submit tx",
        actionCryptoConfirm: "Confirm on-chain",
        actionReject: "Reject",
        actionPay: "Pay",
        actionReverse: "Reverse",
        riskSignals: "Risk signals",
        riskSignalNewCardFirstWithdrawal: "First withdrawal on new payout card",
        riskSignalSharedIpCluster: "Shared IP cluster",
        riskSignalSharedDeviceCluster: "Shared device cluster",
        riskSignalSharedPayoutDestinationCluster:
          "Shared payout destination cluster",
        empty: "No withdrawals found.",
      },
    },
    security: {
      title: "Security Monitor",
      description: "Recent authentication failures and security events.",
      stepUp: {
        title: "Risk Step-Up",
        description:
          "Freeze and release actions require a fresh MFA or recovery code.",
        placeholder: "Enter an MFA code before security actions",
      },
      filters: {
        title: "Filters",
        description: "Filter by email, event type, or time range.",
        email: "Email",
        eventType: "Event Type",
        from: "From",
        to: "To",
        limit: "Limit",
        sort: "Sort",
        sortNewest: "Newest first",
        sortOldest: "Oldest first",
        apply: "Apply",
        export: "Export CSV",
      },
      authEvents: {
        title: "Auth Events",
        description: "Login failures, blocks, and related audit records.",
        headers: {
          id: "ID",
          email: "Email",
          userId: "User ID",
          eventType: "Event",
          ip: "IP",
          userAgent: "User Agent",
          createdAt: "Created",
        },
        empty: "No auth events found.",
      },
      alerts: {
        title: "Anomalous Login Alerts",
        description: "Recent login events flagged for a new IP or user agent.",
        empty: "No anomalous login alerts on this page.",
        signals: "Signals",
        previousIp: "Previous IP",
      },
      freeze: {
        title: "Frozen Accounts",
        description: "Accounts locked by the risk engine.",
        createTitle: "Freeze Account",
        createDescription: "Manually freeze a user account if needed.",
        userId: "User ID",
        reason: "Reason",
        reasonPlaceholder: "Optional reason",
        freeze: "Freeze",
        limit: "Limit",
        sort: "Sort",
        sortNewest: "Newest first",
        sortOldest: "Oldest first",
        headers: {
          id: "ID",
          userId: "User ID",
          reason: "Reason",
          status: "Status",
          createdAt: "Created",
          actions: "Actions",
        },
        release: "Release",
        empty: "No frozen accounts.",
      },
      adminActions: {
        title: "Admin Actions",
        description: "Recent administrative operations.",
        export: "Export CSV",
        filters: {
          adminId: "Admin ID",
          action: "Action",
          from: "From",
          to: "To",
          limit: "Limit",
          sort: "Sort",
          sortNewest: "Newest first",
          sortOldest: "Oldest first",
          apply: "Apply",
        },
        headers: {
          id: "ID",
          adminId: "Admin ID",
          action: "Action",
          targetType: "Target Type",
          targetId: "Target ID",
          ip: "IP",
          sessionId: "Session ID",
          userAgent: "User Agent",
          createdAt: "Created",
        },
        empty: "No admin actions found.",
      },
    },
  },
  "zh-CN": zhCNMessages,
}

const normalizeLocale = (value?: string | null): Locale => {
  if (!value) return DEFAULT_LOCALE
  const lowered = value.toLowerCase()
  if (lowered.startsWith("zh")) return "zh-CN"
  if (lowered.startsWith("en")) return "en"
  return DEFAULT_LOCALE
}

export const getMessages = (locale: Locale) =>
  translations[locale] ?? translations[DEFAULT_LOCALE]

export const resolveLocaleFromRequest = (event: RequestEvent): Locale => {
  const cookieLocale = event.cookies.get(LOCALE_COOKIE)
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale
  }

  const acceptLanguage = event.request.headers.get("accept-language")
  if (acceptLanguage) {
    const first = acceptLanguage.split(",")[0]?.trim()
    return normalizeLocale(first)
  }

  return DEFAULT_LOCALE
}

export const createTranslator = (messages: Messages) => {
  return (path: string) => {
    const value = path
      .split(".")
      .reduce<unknown>(
        (acc, key) => (acc as Record<string, unknown>)?.[key],
        messages,
      )

    return typeof value === "string" ? value : path
  }
}
