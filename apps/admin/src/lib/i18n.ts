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
    navEngine: string
    navPermissions: string
    navFinance: string
    navForum: string
    navTables: string
    navSecurity: string
    navRisk: string
    navSaas: string
    navAudit: string
    totpCode: string
    prev: string
    next: string
  }
  workspace: {
    label: string
    groups: {
      engine: string
      consumer: string
      business: string
      security: string
    }
    items: {
      config: string
      legal: string
      providers: string
      prizes: string
      changeRequests: string
      permissions: string
      economy: string
      markets: string
      finance: string
      kyc: string
      forum: string
      users: string
      missions: string
      saas: string
      reconciliation: string
      security: string
      audit: string
      collusion: string
    }
    scopes: {
      financeOps: {
        title: string
        description: string
      }
      saasOps: {
        title: string
        description: string
      }
      engineerOnCall: {
        title: string
        description: string
      }
      controlCenter: {
        title: string
        description: string
      }
      mixedAccess: {
        title: string
        description: string
      }
      restricted: {
        title: string
        description: string
      }
    }
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
    legal: {
      title: string
      description: string
      slug: string
      version: string
      effectiveAt: string
      html: string
      publish: string
      preview: string
      status: string
      current: string
      inactive: string
      empty: string
      stepUpHint: string
    }
    metrics: {
      totalDraws: string
      winRate: string
      poolBalance: string
      reconciliationAlerts: string
      reconciliationStreak: string
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
    mission: {
      createTitle: string
      createDescription: string
      createSubmit: string
      editTitle: string
      editDescription: string
      editEmpty: string
      editSave: string
      editCancel: string
      useExample: string
      empty: string
      confirmDelete: string
      form: {
        id: string
        type: string
        reward: string
        isActive: string
        params: string
        paramsHint: string
      }
      types: {
        dailyCheckIn: string
        metricThreshold: string
      }
      tableTitle: string
      tableDescription: string
      table: {
        updatedAt: string
      }
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
    errors: {
      loadData: string
      unexpectedResponse: string
      missingCryptoChannelFields: string
      operatorNoteRequired: string
      settlementReferenceRequired: string
      processingChannelRequired: string
      createCryptoDepositChannel: string
      missingDepositId: string
      sendDepositToProvider: string
      markDepositProviderSucceeded: string
      creditDeposit: string
      markDepositProviderFailed: string
      reverseDeposit: string
      confirmCryptoDeposit: string
      rejectCryptoDeposit: string
      missingWithdrawalId: string
      approveWithdrawal: string
      rejectWithdrawal: string
      markWithdrawalProviderSubmitted: string
      markWithdrawalProviderProcessing: string
      markWithdrawalProviderFailed: string
      payWithdrawal: string
      reverseWithdrawal: string
      submitCryptoWithdrawal: string
      confirmCryptoWithdrawal: string
    }
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
  saas: {
    title: string
    eyebrow: string
    description: string
    errors: {
      loadOverview: string
      acceptInvite: string
      createTenant: string
      strategyParamsObject: string
      strategyParamsInvalidJson: string
      createProject: string
      saveMembership: string
      deleteMembership: string
      createInvite: string
      revokeInvite: string
      saveTenantLink: string
      deleteTenantLink: string
      saveAgentControl: string
      deleteAgentControl: string
      issueApiKey: string
      rotateApiKey: string
      revokeApiKey: string
      saveRiskEnvelope: string
      saveBillingAccount: string
      openBillingPortal: string
      openBillingSetup: string
      createPrize: string
      createOutboundWebhook: string
      updateOutboundWebhook: string
      deleteOutboundWebhook: string
      updatePrize: string
      deletePrize: string
      createBillingRun: string
      syncBillingRun: string
      refreshBillingRun: string
      settleBillingRun: string
      createBillingTopUp: string
      syncBillingTopUp: string
    }
    notices: {
      billingSetupSuccess: string
      billingSetupCancelled: string
      inviteDetectedTitle: string
      inviteDetectedDescription: string
      acceptInvite: string
      issuedKeyTitle: string
      issuedKeyExpires: string
      rotatedKeyTitle: string
      rotatedKeyOldValidUntil: string
      rotatedKeyNewKey: string
      rotatedKeyExpires: string
      inviteCreatedTitle: string
      riskEnvelopeRequestCreatedTitle: string
      tenantProvisionedTitle: string
      seededPrizes: string
      billingBillable: string
      sandboxQuickstartTitle: string
      sandboxQuickstartExpires: string
      sandboxQuickstartPendingTitle: string
      sandboxQuickstartPendingDescription: string
    }
    summary: {
      tenants: string
      projects: string
      keys: string
      players: string
      draws30d: string
      billable: string
    }
    tenantForm: {
      title: string
      namePlaceholder: string
      slugPlaceholder: string
      billingEmailPlaceholder: string
      submit: string
    }
    projectForm: {
      title: string
      namePlaceholder: string
      slugPlaceholder: string
      currencyLabel: string
      drawCostLabel: string
      prizePoolBalanceLabel: string
      missWeightLabel: string
      fairnessEpochSecondsLabel: string
      maxDrawCountLabel: string
      apiRateLimitBurstLabel: string
      apiRateLimitHourlyLabel: string
      apiRateLimitDailyLabel: string
      quotaHint: string
      submit: string
    }
    membership: {
      title: string
      adminEmailPlaceholder: string
      save: string
      inviteEmailPlaceholder: string
      createInvite: string
    }
    agentTree: {
      title: string
      description: string
      parentSuffix: string
      childSuffix: string
      submit: string
    }
    issueKeyForm: {
      title: string
      labelPlaceholder: string
      submit: string
    }
    billingOps: {
      title: string
      finalizeInvoice: string
      sendInvoice: string
      createBillingRun: string
      notePlaceholder: string
      createManualTopUp: string
    }
    quickstart: {
      title: string
      description: string
      autoIssueHint: string
      submit: string
    }
    tenantsSection: {
      title: string
      noBillingEmail: string
      projectsCount: string
      draws30d: string
      unbilled: string
      baseFee: string
      drawFee: string
      autoBilling: string
      autoOn: string
      autoOff: string
      autoMonthClose: string
      billable: string
      saveBilling: string
      bindCard: string
      openPortal: string
      recentRun: string
      total: string
      agentTreeTitle: string
      unlink: string
      usageAlerts: string
      baseMonthlyPlaceholder: string
      drawFeePlaceholder: string
      decisionRejectPlaceholder: string
      decisionMutePlaceholder: string
      decisionPayoutPlaceholder: string
      portalConfigurationPlaceholder: string
      stripeCustomerPlaceholder: string
    }
    riskEnvelope: {
      title: string
      description: string
      dailyBudgetPlaceholder: string
      maxSinglePayoutPlaceholder: string
      varianceCapPlaceholder: string
      emergencyStop: string
      reasonPlaceholder: string
      submit: string
    }
    agentControls: {
      title: string
      activeCountSuffix: string
      empty: string
      budgetMultiplier: string
      updated: string
      remove: string
      addTitle: string
      agentIdPlaceholder: string
      budgetMultiplierPlaceholder: string
      reasonPlaceholder: string
      modeDescription: string
      save: string
      modes: {
        blocked: string
        throttled: string
      }
    }
    prizeForm: {
      title: string
      namePlaceholder: string
      active: string
      submit: string
    }
    projectsSection: {
      title: string
      description: string
      drawCost: string
      pool: string
      strategy: string
      perKeyQuota: string
      burst: string
      hourly: string
      daily: string
      reset: string
      activeKeys: string
    }
    membershipsSection: {
      title: string
      remove: string
    }
    invitesSection: {
      title: string
      expires: string
      revoke: string
    }
    apiKeysSection: {
      title: string
      expires: string
      rotatedTo: string
      rotatedFrom: string
      lastUsed: string
      burst: string
      hour: string
      day: string
      overlapSecondsPlaceholder: string
      rotationReasonPlaceholder: string
      revokeReasonPlaceholder: string
      rotate: string
      revoke: string
    }
    projectPrizesSection: {
      title: string
      active: string
      save: string
      delete: string
    }
    billingRunsSection: {
      title: string
      draws: string
      finalize: string
      send: string
      sync: string
      refresh: string
      paidOutOfBand: string
      settle: string
    }
    webhookQueueSection: {
      title: string
      event: string
      tenant: string
      billingRun: string
      attempts: string
      next: string
      processed: string
    }
    topUpsSection: {
      title: string
      noNote: string
      sync: string
    }
    recentUsageSection: {
      title: string
      units: string
      amount: string
    }
    outboundWebhookForm: {
      title: string
      description: string
      urlPlaceholder: string
      secretPlaceholder: string
      activeImmediately: string
      submit: string
    }
    outboundWebhooksSection: {
      title: string
      empty: string
      lastDelivered: string
      active: string
      paused: string
      leaveSecretPlaceholder: string
      save: string
      delete: string
    }
    outboundDeliveriesSection: {
      title: string
      empty: string
      event: string
      webhook: string
      draw: string
      attempts: string
      next: string
      delivered: string
      http: string
    }
    observabilitySection: {
      title: string
      lastDays: string
      baseline: string
      draws: string
      players: string
      hitRate: string
      payoutRate: string
      rewardCost: string
      expected: string
      actual: string
      reward: string
    }
    confirmDialog: {
      title: string
      description: string
      confirm: string
      cancel: string
      stepUpHint: string
      mfaRequired: string
      breakGlassRequired: string
    }
    enums: {
      tenantStatus: {
        active: string
        suspended: string
        archived: string
      }
      projectEnvironment: {
        sandbox: string
        live: string
      }
      role: {
        tenant_owner: string
        tenant_operator: string
        agent_manager: string
        agent_viewer: string
      }
      tenantLinkType: {
        agent_client: string
      }
      billingPlan: {
        starter: string
        growth: string
        enterprise: string
      }
      collectionMethod: {
        send_invoice: string
        charge_automatically: string
      }
      boolean: {
        on: string
        off: string
        yes: string
        no: string
      }
      inviteStatus: {
        pending: string
        accepted: string
        revoked: string
        expired: string
      }
    }
  }
  engine: {
    title: string
    description: string
    summary: {
      unresolved: string
      overdue: string
      zeroDriftStreak: string
      slaTarget: string
      open: string
      acknowledged: string
      requireEngineering: string
      resolved: string
    }
    stepUp: {
      title: string
      description: string
      placeholder: string
      operatorNote: string
      operatorNotePlaceholder: string
    }
    actions: {
      acknowledge: string
      requireEngineering: string
      resolve: string
      export: string
      viewQueue: string
    }
    table: {
      empty: string
      headers: {
        user: string
        status: string
        delta: string
        sla: string
        ledgerSnapshot: string
        walletSnapshot: string
        lastDetectedAt: string
        updatedAt: string
        actions: string
      }
    }
    status: {
      open: string
      acknowledged: string
      requireEngineering: string
      resolved: string
    }
    snapshot: {
      withdrawable: string
      bonus: string
      locked: string
      wagered: string
      total: string
      capturedAt: string
      latestLedgerEntryId: string
      details: string
    }
    sla: {
      dueAt: string
      firstDetectedAt: string
      breached: string
      healthy: string
      escalatedAt: string
    }
  }
  permissions: {
    title: string
    description: string
    noticeTitle: string
    noticeBody: string
    success: string
    summary: {
      adminCount: string
      activeCount: string
      scopeCount: string
    }
    directory: {
      title: string
      description: string
      empty: string
      mfaEnabled: string
      mfaDisabled: string
      noScopes: string
      legacyCount: string
    }
    groups: {
      engine: string
      consumer: string
      business: string
    }
    editor: {
      title: string
      empty: string
      none: string
      legacyTitle: string
      legacyDescription: string
      confirmationLabel: string
      confirmationHint: string
      stepUpPlaceholder: string
      stepUpDescription: string
      save: string
    }
  }
  reconciliation: {
    title: string
    description: string
    run: {
      title: string
      description: string
      providerId: string
      providerIdPlaceholder: string
      totpCode: string
      runAll: string
      runOne: string
      readOnly: string
    }
    summary: {
      openIssues: string
      criticalIssues: string
      manualQueue: string
      latestRun: string
      latestRunNone: string
    }
    issues: {
      title: string
      description: string
      empty: string
      headers: {
        severity: string
        issueType: string
        flow: string
        orderId: string
        providerId: string
        localStatus: string
        remoteStatus: string
        detectedAt: string
      }
    }
    runs: {
      title: string
      description: string
      empty: string
      headers: {
        provider: string
        trigger: string
        status: string
        startedAt: string
        completedAt: string
        summary: string
      }
      summaryFallback: string
    }
    alerts: {
      completed: string
    }
  }
  users: {
    title: string
    description: string
    backToSearch: string
    search: {
      title: string
      description: string
      label: string
      placeholder: string
      submit: string
      resultsTitle: string
      resultsDescription: string
      resultsEmptyHint: string
      noResults: string
      idle: string
    }
    table: {
      user: string
      kyc: string
      freeze: string
      createdAt: string
      actions: string
      view: string
    }
    detail: {
      title: string
      description: string
    }
    profile: {
      createdAt: string
      updatedAt: string
      emailStatus: string
      phoneStatus: string
      age: string
      birthDate: string
      registrationCountry: string
      countryTier: string
      countryResolvedAt: string
      jurisdiction: string
      userPoolBalance: string
      pityStreak: string
    }
    wallet: {
      title: string
      description: string
      withdrawable: string
      bonus: string
      locked: string
      wagered: string
      updatedAt: string
    }
    freeze: {
      title: string
      description: string
      stepUpPlaceholder: string
      category: string
      reason: string
      scope: string
      activeScopes: string
      activeScopesDescription: string
      noActiveScope: string
      scopeReleaseHint: string
      recordsTitle: string
      recordsDescription: string
      status: string
      createdAt: string
      releasedAt: string
    }
    actions: {
      freeze: string
      unfreeze: string
      forceLogout: string
      forceLogoutDescription: string
      resetPassword: string
      resetPasswordDescription: string
      openKycProfile: string
      freezeSuccess: string
      unfreezeSuccess: string
      forceLogoutSuccess: string
      resetPasswordSuccess: string
    }
    activity: {
      drawsTitle: string
      drawsDescription: string
      paymentsTitle: string
      paymentsDescription: string
      loginsTitle: string
      loginsDescription: string
      empty: string
      noPrize: string
      drawCost: string
      rewardAmount: string
      deposit: string
      withdrawal: string
    }
    status: {
      noFreeze: string
      unverified: string
      emailVerified: string
      phoneVerified: string
    }
    kyc: {
      tier0: string
      tier1: string
      tier2: string
    }
    scope: {
      account: string
      gameplay: string
      topup: string
      withdrawal: string
    }
    category: {
      risk: string
      community: string
      compliance: string
      security: string
      support: string
      operations: string
    }
    reason: {
      accountLock: string
      withdrawalLock: string
      gameplayLock: string
      pendingKyc: string
      amlReview: string
      authFailure: string
      manualAdmin: string
      forumModeration: string
      jurisdictionRestriction: string
      underageRestriction: string
    }
    errors: {
      loadSearch: string
      loadDetail: string
      unexpectedData: string
      invalidUserId: string
      freezeFields: string
      scopeRequired: string
      freezeFailed: string
      unfreezeFailed: string
      forceLogoutFailed: string
      resetPasswordFailed: string
    }
  }
  security: {
    title: string
    description: string
    errors: {
      loadData: string
      unexpectedResponse: string
      missingFreezeRecordId: string
      releaseFreeze: string
      missingUserId: string
      freezeAccount: string
      jurisdictionFields: string
      saveJurisdictionRule: string
    }
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
    jurisdiction: {
      title: string
      description: string
      countryCode: string
      minimumAge: string
      allowedFeatures: string
      notes: string
      notesPlaceholder: string
      save: string
      saveSuccess: string
      empty: string
      noFeatures: string
      tiers: {
        blocked: string
        restricted: string
        full: string
      }
      features: {
        realMoneyGameplay: string
        topup: string
        withdrawal: string
      }
      headers: {
        countryCode: string
        countryTier: string
        minimumAge: string
        allowedFeatures: string
        updatedAt: string
      }
    }
    freeze: {
      title: string
      description: string
      createTitle: string
      createDescription: string
      userId: string
      reason: string
      scope: string
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
        scope: string
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
  tables: {
    title: string
    description: string
    stepUp: {
      title: string
      description: string
      placeholder: string
    }
    connection: {
      connected: string
      connecting: string
      disconnected: string
    }
    summary: {
      liveTables: string
      occupiedSeats: string
      timedOutSeats: string
    }
    labels: {
      user: string
      participantId: string
      userId: string
      roundId: string
      updatedAt: string
      timeBank: string
      currentActor: string
      none: string
      noTables: string
    }
    actions: {
      reason: string
      forceTimeout: string
      closeTable: string
      kickSeat: string
      timeoutReasonPlaceholder: string
      closeReasonPlaceholder: string
      kickReasonPlaceholder: string
    }
    state: {
      active: string
      overdue: string
      closing: string
      closed: string
    }
    phase: {
      waiting: string
      betting: string
      playerTurn: string
      dealerTurn: string
      marketOpen: string
      marketLocked: string
      settling: string
      resolved: string
      closed: string
    }
    source: {
      blackjack: string
      holdem: string
      liveDealer: string
      predictionMarket: string
    }
    seatRole: {
      dealer: string
      player: string
      observer: string
      marketMaker: string
    }
    seatStatus: {
      empty: string
      occupied: string
      acting: string
      waiting: string
      timedOut: string
      removed: string
    }
    errors: {
      loadData: string
      unexpectedResponse: string
      missingTable: string
      missingSeat: string
      missingReason: string
      missingTotp: string
    }
  }
  markets: {
    title: string
    description: string
    stepUp: {
      title: string
      description: string
      placeholder: string
    }
    summary: {
      draft: string
      open: string
      locked: string
      resolved: string
      cancelled: string
    }
    create: {
      title: string
      description: string
      submit: string
      slug: string
      roundKey: string
      marketTitle: string
      descriptionLabel: string
      descriptionPlaceholder: string
      resolutionRules: string
      resolutionRulesPlaceholder: string
      sourceOfTruth: string
      oracleProvider: string
      oracleBindingName: string
      oracleBindingConfig: string
      oracleBindingConfigPlaceholder: string
      oracleBindingConfigHint: string
      category: string
      vigPercent: string
      vigHint: string
      tags: string
      tagsPlaceholder: string
      invalidPolicy: string
      opensAt: string
      locksAt: string
      resolvesAt: string
      timestampHint: string
      outcomes: string
      outcomesPlaceholder: string
      outcomesHint: string
    }
    list: {
      title: string
      description: string
      empty: string
    }
    appeals: {
      title: string
      description: string
      open: string
      acknowledged: string
      totalActive: string
      empty: string
      activeBadge: string
      marketStatus: string
      firstDetectedAt: string
      lastDetectedAt: string
      details: string
      metadata: string
      binding: string
      bindingStatus: string
      lastResolvedOutcomeKey: string
      noBinding: string
      acknowledgeNote: string
      acknowledgeNotePlaceholder: string
      acknowledgedHint: string
      actions: {
        acknowledge: string
      }
    }
    labels: {
      none: string
      roundKey: string
      rules: string
      category: string
      tags: string
      vig: string
      invalidPolicy: string
      sourceOfTruth: string
      resolutionRules: string
      outcomePools: string
      totalPool: string
      positionCount: string
      oracle: string
      noOracle: string
      opensAt: string
      locksAt: string
      resolvesAt: string
      resolvedAt: string
      createdAt: string
      updatedAt: string
      winningOutcome: string
    }
    status: {
      draft: string
      open: string
      locked: string
      resolved: string
      cancelled: string
    }
    actions: {
      settleTitle: string
      settleDescription: string
      settleAppealUnlocked: string
      settleLockedOnly: string
      cancelTitle: string
      cancelDescription: string
      winningOutcome: string
      oracleSource: string
      oracleExternalRef: string
      oracleReportedAt: string
      oraclePayloadHash: string
      oraclePayload: string
      cancelReason: string
      cancelReasonPlaceholder: string
      cancellationMetadata: string
      submitSettle: string
      submitCancel: string
    }
    success: {
      create: string
      settle: string
      cancel: string
      acknowledgeAppeal: string
    }
    enums: {
      category: {
        crypto: string
        finance: string
        sports: string
        politics: string
        technology: string
        culture: string
        other: string
      }
      invalidPolicy: {
        refundAll: string
        manualReview: string
      }
      appealStatus: {
        open: string
        acknowledged: string
        resolved: string
      }
      appealReason: {
        oracle_fetch_failed: string
        oracle_response_invalid: string
        oracle_value_unmapped: string
        oracle_value_stale: string
        oracle_resolution_failed: string
        oracle_dispute_pending_too_long: string
        manual_intervention_required: string
      }
      oracleBindingStatus: {
        active: string
        pending: string
        resolved: string
        appealed: string
        manual_only: string
        cancelled: string
      }
    }
    errors: {
      loadData: string
      loadAppeals: string
      unexpectedResponse: string
      unexpectedAppealsResponse: string
      invalidOutcomes: string
      invalidTags: string
      invalidVigPercent: string
      invalidJson: string
      oracleProviderRequired: string
      invalidOracleBinding: string
      missingTotp: string
      missingMarketId: string
      missingAppealId: string
      winningOutcomeRequired: string
      oracleSourceRequired: string
      cancelReasonRequired: string
      createFailed: string
      settleFailed: string
      cancelFailed: string
      acknowledgeAppealFailed: string
    }
  }
  forum: {
    moderation: {
      eyebrow: string
      title: string
      description: string
      notice: string
      stepUp: {
        title: string
        description: string
        placeholder: string
        releaseReason: string
        releaseReasonPlaceholder: string
      }
      queue: {
        title: string
        description: string
        empty: string
        bulkReason: string
        bulkReasonPlaceholder: string
        bulkDelete: string
        muteAuthor: string
        muted: string
        autoHidden: string
        headers: {
          select: string
          post: string
          author: string
          thread: string
          reports: string
          source: string
          latestReason: string
          status: string
          reportedAt: string
          actions: string
        }
      }
      activeMutes: {
        title: string
        description: string
        empty: string
        release: string
        headers: {
          user: string
          reason: string
          createdAt: string
          actions: string
        }
      }
      feedback: {
        bulkDeleteSuccess: string
        muteSuccess: string
        releaseSuccess: string
      }
      errors: {
        loadData: string
        unexpectedResponse: string
        invalidBulkSelection: string
        invalidUserId: string
        invalidFreezeRecordId: string
        stepUpRequired: string
        bulkDeleteFailed: string
        muteFailed: string
        releaseFailed: string
      }
    }
  }
  aml: {
    eyebrow: string
    title: string
    description: string
    warnings: {
      overduePrefix: string
      overdueMiddle: string
      overdueSuffix: string
    }
    summary: {
      pendingHits: string
      overdue: string
      sla: string
      oldestPending: string
    }
    stepUp: {
      title: string
      description: string
      placeholder: string
    }
    filters: {
      limit: string
      sort: string
      sortNewest: string
      sortOldest: string
      apply: string
    }
    queue: {
      title: string
      description: string
      empty: string
    }
    caseItem: {
      caseLabel: string
      userLabel: string
      created: string
      due: string
      freeze: string
      none: string
      statusWithinSla: string
      statusOverdue: string
      providerPayload: string
      screeningContext: string
      note: string
      notePlaceholder: string
    }
    checkpoint: {
      registration: string
      firstDeposit: string
      withdrawalRequest: string
    }
    riskLevel: {
      low: string
      medium: string
      high: string
    }
    feedback: {
      clearSuccess: string
      confirmSuccess: string
      escalateSuccess: string
    }
    actions: {
      clear: string
      confirm: string
      escalate: string
    }
    errors: {
      loadQueue: string
      unexpectedResponse: string
      missingCheckId: string
      mfaRequired: string
      clearFailed: string
      confirmFailed: string
      escalateFailed: string
    }
  }
  risk: {
    collusion: {
      eyebrow: string
      title: string
      description: string
      filters: {
        title: string
        description: string
        days: string
        days7: string
        days14: string
        days30: string
        apply: string
      }
      stepUp: {
        title: string
        description: string
        placeholder: string
        reason: string
        reasonPlaceholder: string
      }
      summary: {
        userLeaders: string
        deviceLeaders: string
        sharedIpClusters: string
        frequentPairs: string
      }
      chart: {
        title: string
        description: string
        userView: string
        deviceView: string
        empty: string
      }
      users: {
        title: string
        description: string
        headers: {
          user: string
          score: string
          events: string
          flag: string
          freeze: string
          lastSeen: string
          actions: string
        }
        empty: string
        mark: string
        clearMark: string
        freezeGame: string
        flagManual: string
        flagOpen: string
        flagNone: string
        freezeActive: string
        freezeNone: string
      }
      clusters: {
        sharedIpTitle: string
        sharedIpDescription: string
        sharedDeviceTitle: string
        sharedDeviceDescription: string
        headers: {
          fingerprint: string
          score: string
          events: string
          users: string
          lastSeen: string
        }
        empty: string
      }
      pairs: {
        title: string
        description: string
        headers: {
          table: string
          users: string
          interactions: string
          sharedIp: string
          sharedDevice: string
          score: string
          lastSeen: string
        }
        empty: string
      }
    }
  }
  audit: {
    title: string
    description: string
    export: string
    filters: {
      adminId: string
      userId: string
      action: string
      from: string
      to: string
      limit: string
      sort: string
      sortNewest: string
      sortOldest: string
      apply: string
      reset: string
    }
    summary: {
      total: string
      byAdmin: string
      byAction: string
      byUser: string
      byDay: string
      empty: string
      allAdmins: string
      allUsers: string
    }
    table: {
      title: string
      description: string
      empty: string
      headers: {
        id: string
        createdAt: string
        admin: string
        action: string
        user: string
        target: string
        request: string
        context: string
      }
      unknownAdmin: string
      unknownUser: string
      noTarget: string
      session: string
      agent: string
      metadata: string
      noMetadata: string
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
      navEngine: "Engine",
      navPermissions: "Permissions",
      navFinance: "Finance",
      navForum: "Forum",
      navTables: "Tables",
      navSecurity: "Security",
      navRisk: "Risk",
      navSaas: "SaaS",
      navAudit: "Audit",
      totpCode: "MFA Code",
      prev: "Prev",
      next: "Next",
    },
    workspace: {
      label: "Current Workspace",
      groups: {
        engine: "(engine) Reliability",
        consumer: "(c) Consumer Product",
        business: "(b) SaaS Engine",
        security: "Security",
      },
      items: {
        config: "Config",
        legal: "Legal",
        providers: "Providers",
        prizes: "Prizes",
        changeRequests: "Change Requests",
        permissions: "Permissions",
        economy: "Economy",
        markets: "Markets",
        finance: "Finance",
        kyc: "KYC Queue",
        forum: "Forum Moderation",
        users: "Users",
        missions: "Missions",
        saas: "SaaS Control Plane",
        reconciliation: "Reconciliation",
        security: "Security Monitor",
        audit: "Audit Trail",
        collusion: "Collusion",
      },
      scopes: {
        financeOps: {
          title: "Finance Ops",
          description: "Default to the finance review and payout queue.",
        },
        saasOps: {
          title: "SaaS Ops",
          description: "Default to tenants, projects, and billing controls.",
        },
        engineerOnCall: {
          title: "Engineer On-Call",
          description: "Default to reconciliation and security workflows.",
        },
        controlCenter: {
          title: "Control Center",
          description: "This admin can land in the main prize-pool console.",
        },
        mixedAccess: {
          title: "Mixed Access",
          description: "This admin spans multiple work areas.",
        },
        restricted: {
          title: "Restricted",
          description: "No admin workspaces are currently available.",
        },
      },
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
        title: "Legacy Bonus Release",
        description:
          "Retired legacy path. B luck is non-withdrawable and can no longer be released into withdrawable balance.",
        userId: "User ID",
        amount: "Amount",
        amountPlaceholder: "Leave empty to release all",
        release: "Release Disabled",
        autoReleaseHint:
          "This legacy release flow is disabled under the B luck economy model.",
      },
      legal: {
        title: "Legal Documents",
        description:
          "Publish versioned legal HTML documents. A newly effective version forces users onto a re-acceptance flow.",
        slug: "Slug",
        version: "Version",
        effectiveAt: "Effective At",
        html: "HTML",
        publish: "Publish Document",
        preview: "Preview",
        status: "Status",
        current: "Current",
        inactive: "Historical / Scheduled",
        empty: "No legal documents published yet.",
        stepUpHint:
          "Publishing a new version uses the current step-up MFA code.",
      },
      metrics: {
        totalDraws: "Total Draws",
        winRate: "Win Rate",
        poolBalance: "Pool Balance",
        reconciliationAlerts: "Reconciliation Alerts",
        reconciliationStreak: "Zero-Drift Streak",
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
      mission: {
        createTitle: "Create Mission",
        createDescription:
          "Define reward missions in the database so new tasks ship without a code release.",
        createSubmit: "Create Mission",
        editTitle: "Edit Mission",
        editDescription: "Select a mission from the table to edit its config.",
        editEmpty: "Select a mission to edit its configuration.",
        editSave: "Save Mission",
        editCancel: "Cancel",
        useExample: "Load example params",
        empty: "No missions yet.",
        confirmDelete: "Delete this mission?",
        form: {
          id: "Mission ID",
          type: "Type",
          reward: "Reward",
          isActive: "Active",
          params: "Params JSON",
          paramsHint:
            'Use a JSON object. `daily_checkin` expects title/description/sortOrder. `metric_threshold` expects title/description/metric/target/cadence, and optionally awardMode/bonusUnlockWagerRatio/sortOrder. Add `experiment: { "expKey": "your_key" }` to gray-roll params through the experiments module.',
        },
        types: {
          dailyCheckIn: "Daily Check-In",
          metricThreshold: "Metric Threshold",
        },
        tableTitle: "Mission Catalog",
        tableDescription:
          "These rows drive the user reward center and can be added or removed without redeploying clients.",
        table: {
          updatedAt: "Updated",
        },
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
      errors: {
        loadData: "Failed to load finance data.",
        unexpectedResponse: "Finance API returned an unexpected response.",
        missingCryptoChannelFields:
          "Chain, network, token, and receive address are required.",
        operatorNoteRequired: "Operator note is required.",
        settlementReferenceRequired: "Settlement reference is required.",
        processingChannelRequired: "Processing channel is required.",
        createCryptoDepositChannel: "Failed to create crypto deposit channel.",
        missingDepositId: "Missing deposit id.",
        sendDepositToProvider: "Failed to send deposit to provider.",
        markDepositProviderSucceeded:
          "Failed to mark deposit as provider succeeded.",
        creditDeposit: "Failed to credit deposit.",
        markDepositProviderFailed: "Failed to mark deposit as provider failed.",
        reverseDeposit: "Failed to reverse deposit.",
        confirmCryptoDeposit: "Failed to confirm crypto deposit.",
        rejectCryptoDeposit: "Failed to reject crypto deposit.",
        missingWithdrawalId: "Missing withdrawal id.",
        approveWithdrawal: "Failed to approve withdrawal.",
        rejectWithdrawal: "Failed to reject withdrawal.",
        markWithdrawalProviderSubmitted:
          "Failed to mark withdrawal as provider submitted.",
        markWithdrawalProviderProcessing:
          "Failed to mark withdrawal as provider processing.",
        markWithdrawalProviderFailed:
          "Failed to mark withdrawal as provider failed.",
        payWithdrawal: "Failed to pay withdrawal.",
        reverseWithdrawal: "Failed to reverse withdrawal.",
        submitCryptoWithdrawal: "Failed to submit crypto withdrawal.",
        confirmCryptoWithdrawal: "Failed to confirm crypto withdrawal.",
      },
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
        description:
          "Move withdrawals through approval, provider, and payout stages.",
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
    saas: {
      title: "SaaS Control Plane",
      eyebrow: "B2B Prize Engine",
      description:
        "Month-end billing, Stripe webhook recovery, customer self-serve card binding and portal access, memberships, and agent-client tenancy all stay on the isolated saas_* data plane without touching the ToC user, prize pool, or payments core path.",
      errors: {
        loadOverview: "Failed to load SaaS overview.",
        acceptInvite: "Failed to accept tenant invite.",
        createTenant: "Failed to create tenant.",
        strategyParamsObject: "Strategy params must be a JSON object.",
        strategyParamsInvalidJson: "Strategy params must be valid JSON.",
        createProject: "Failed to create project.",
        saveMembership: "Failed to save membership.",
        deleteMembership: "Failed to delete membership.",
        createInvite: "Failed to create invite.",
        revokeInvite: "Failed to revoke invite.",
        saveTenantLink: "Failed to save tenant link.",
        deleteTenantLink: "Failed to delete tenant link.",
        saveAgentControl: "Failed to save agent control.",
        deleteAgentControl: "Failed to delete agent control.",
        issueApiKey: "Failed to issue API key.",
        rotateApiKey: "Failed to rotate API key.",
        revokeApiKey: "Failed to revoke API key.",
        saveRiskEnvelope:
          "Failed to create tenant risk envelope change request.",
        saveBillingAccount: "Failed to save billing account.",
        openBillingPortal: "Failed to open billing portal.",
        openBillingSetup: "Failed to open billing setup.",
        createPrize: "Failed to create prize.",
        createOutboundWebhook: "Failed to create outbound webhook.",
        updateOutboundWebhook: "Failed to update outbound webhook.",
        deleteOutboundWebhook: "Failed to delete outbound webhook.",
        updatePrize: "Failed to update prize.",
        deletePrize: "Failed to delete prize.",
        createBillingRun: "Failed to create billing run.",
        syncBillingRun: "Failed to sync billing run.",
        refreshBillingRun: "Failed to refresh billing run.",
        settleBillingRun: "Failed to settle billing run.",
        createBillingTopUp: "Failed to create billing top-up.",
        syncBillingTopUp: "Failed to sync billing top-up.",
      },
      notices: {
        billingSetupSuccess:
          "Stripe card setup finished. Automatic charges will use the customer's default payment method.",
        billingSetupCancelled: "Stripe card setup was cancelled.",
        inviteDetectedTitle: "Pending Tenant Invite",
        inviteDetectedDescription:
          "An invitation token is present on this page. Sign in with the matching admin account to accept it directly.",
        acceptInvite: "Accept Invite",
        issuedKeyTitle: "New API Key Issued",
        issuedKeyExpires: "expires",
        rotatedKeyTitle: "API Key Rotated",
        rotatedKeyOldValidUntil: "old key valid until",
        rotatedKeyNewKey: "new key",
        rotatedKeyExpires: "expires",
        inviteCreatedTitle: "Invite Created",
        riskEnvelopeRequestCreatedTitle: "Risk envelope change request created",
        tenantProvisionedTitle: "Sandbox tenant provisioned",
        seededPrizes: "seeded prizes",
        billingBillable: "billing billable",
        sandboxQuickstartTitle: "hello-reward quickstart",
        sandboxQuickstartExpires: "expires",
        sandboxQuickstartPendingTitle: "Sandbox quickstart pending",
        sandboxQuickstartPendingDescription:
          "Tenant created, but the sandbox hello-reward key could not be issued automatically.",
      },
      summary: {
        tenants: "Tenants",
        projects: "Projects",
        keys: "Keys",
        players: "Players",
        draws30d: "Draws 30d",
        billable: "Billable",
      },
      tenantForm: {
        title: "Create Tenant",
        namePlaceholder: "Acme Rewards",
        slugPlaceholder: "acme-rewards",
        billingEmailPlaceholder: "billing@acme.com",
        submit: "Create Tenant",
      },
      projectForm: {
        title: "Create Project",
        namePlaceholder: "Spring Launch",
        slugPlaceholder: "spring-launch",
        currencyLabel: "Currency",
        drawCostLabel: "Draw Cost",
        prizePoolBalanceLabel: "Prize Pool Balance",
        missWeightLabel: "Miss Weight",
        fairnessEpochSecondsLabel: "Fairness Epoch Seconds",
        maxDrawCountLabel: "Max Draw Count",
        apiRateLimitBurstLabel: "Burst Limit",
        apiRateLimitHourlyLabel: "Hourly Limit",
        apiRateLimitDailyLabel: "Daily Limit",
        quotaHint:
          "API quota is tracked per key: burst/minute, hourly/hour, daily/day.",
        submit: "Create Project",
      },
      membership: {
        title: "Members & Invites",
        adminEmailPlaceholder: "operator@client.com",
        save: "Save Membership",
        inviteEmailPlaceholder: "new-owner@client.com",
        createInvite: "Create Invite",
      },
      agentTree: {
        title: "Agent Client Tree",
        description:
          "Attach agency tenants to customer tenants to build the agent-client tree.",
        parentSuffix: "parent",
        childSuffix: "child",
        submit: "Link Tenants",
      },
      issueKeyForm: {
        title: "Issue API Key",
        labelPlaceholder: "Production server key",
        submit: "Issue Key",
      },
      billingOps: {
        title: "Billing Ops",
        finalizeInvoice: "Finalize invoice",
        sendInvoice: "Send invoice",
        createBillingRun: "Create Billing Run",
        notePlaceholder: "Manual customer balance credit",
        createManualTopUp: "Create Manual Top-up",
      },
      quickstart: {
        title: "hello-reward",
        description:
          "Reissue a quickstart key for a sandbox project that can be used directly with the SDK.",
        autoIssueHint:
          "Provisioning also issues an onboarding key automatically.",
        submit: "Generate Quickstart",
      },
      tenantsSection: {
        title: "Tenants",
        noBillingEmail: "no billing email",
        projectsCount: "projects",
        draws30d: "draws 30d",
        unbilled: "unbilled",
        baseFee: "base",
        drawFee: "draw",
        autoBilling: "auto",
        autoOn: "on",
        autoOff: "off",
        autoMonthClose: "Auto month close",
        billable: "Billable",
        saveBilling: "Save Billing",
        bindCard: "Bind Card",
        openPortal: "Open Portal",
        recentRun: "Recent run",
        total: "total",
        agentTreeTitle: "Agent Client Tree",
        unlink: "unlink",
        usageAlerts: "Usage & Alerts",
        baseMonthlyPlaceholder: "base monthly",
        drawFeePlaceholder: "legacy / fallback",
        decisionRejectPlaceholder: "reject",
        decisionMutePlaceholder: "mute",
        decisionPayoutPlaceholder: "payout",
        portalConfigurationPlaceholder: "bpc_...",
        stripeCustomerPlaceholder: "cus_...",
      },
      riskEnvelope: {
        title: "risk_envelope",
        description:
          "Operational hard limits. When a tenant requests looser budget, payout, or variance settings, the backend converges them back to this envelope; emergency stop forces all payouts to miss.",
        dailyBudgetPlaceholder: "Daily budget (UTC)",
        maxSinglePayoutPlaceholder: "Max single payout",
        varianceCapPlaceholder: "Variance cap (reward - drawCost)",
        emergencyStop: "Emergency stop payouts",
        reasonPlaceholder: "Reason for change request",
        submit: "Create Risk Envelope Change Request",
      },
      agentControls: {
        title: "Agent Controls",
        activeCountSuffix: "active",
        empty: "No agent blocklist or rollout controls are configured.",
        budgetMultiplier: "budget ×",
        updated: "updated",
        remove: "remove",
        addTitle: "Add or update control",
        agentIdPlaceholder: "agent-42",
        budgetMultiplierPlaceholder: "0.25",
        reasonPlaceholder: "runaway retries / suspicious spend",
        modeDescription:
          "`blocked` rejects the agent immediately; `throttled` shrinks draw reward budget by the configured multiplier.",
        save: "Save Control",
        modes: {
          blocked: "blocked",
          throttled: "throttled",
        },
      },
      prizeForm: {
        title: "Create Prize",
        namePlaceholder: "10 USD coupon",
        active: "Active",
        submit: "Create Prize",
      },
      projectsSection: {
        title: "Projects",
        description:
          "Usage in this window is aggregated by active API key, while throttling still executes per key.",
        drawCost: "draw cost",
        pool: "pool",
        strategy: "Strategy",
        perKeyQuota: "Per-key quota:",
        burst: "Burst",
        hourly: "Hourly",
        daily: "Daily",
        reset: "reset",
        activeKeys: "keys",
      },
      membershipsSection: {
        title: "Memberships",
        remove: "remove",
      },
      invitesSection: {
        title: "Invites",
        expires: "expires",
        revoke: "revoke",
      },
      apiKeysSection: {
        title: "API Keys",
        expires: "expires",
        rotatedTo: "rotated to key",
        rotatedFrom: "rotated from key",
        lastUsed: "last used",
        burst: "burst",
        hour: "hour",
        day: "day",
        overlapSecondsPlaceholder: "3600",
        rotationReasonPlaceholder: "scheduled rotation",
        revokeReasonPlaceholder: "revoke reason",
        rotate: "rotate",
        revoke: "revoke",
      },
      projectPrizesSection: {
        title: "Project Prizes",
        active: "Active",
        save: "Save",
        delete: "Delete",
      },
      billingRunsSection: {
        title: "Billing Runs",
        draws: "draws",
        finalize: "finalize",
        send: "send",
        sync: "sync",
        refresh: "refresh",
        paidOutOfBand: "OOB",
        settle: "settle",
      },
      webhookQueueSection: {
        title: "Webhook Queue",
        event: "event",
        tenant: "tenant",
        billingRun: "billing run",
        attempts: "attempts",
        next: "next",
        processed: "processed",
      },
      topUpsSection: {
        title: "Manual Top-ups",
        noNote: "no note",
        sync: "sync",
      },
      recentUsageSection: {
        title: "Recent Usage",
        units: "units",
        amount: "amount",
      },
      outboundWebhookForm: {
        title: "Create Outbound Webhook",
        description:
          "Push reward decisions asynchronously into the customer event bus. The current event type is fixed to reward.completed.",
        urlPlaceholder: "https://events.customer.com/reward",
        secretPlaceholder: "whsec_...",
        activeImmediately: "Active immediately",
        submit: "Create Webhook",
      },
      outboundWebhooksSection: {
        title: "Outbound Webhooks",
        empty: "No outbound webhooks configured.",
        lastDelivered: "last delivered",
        active: "active",
        paused: "paused",
        leaveSecretPlaceholder: "Leave blank to keep current secret",
        save: "Save",
        delete: "Delete",
      },
      outboundDeliveriesSection: {
        title: "Outbound Deliveries",
        empty: "No outbound deliveries yet.",
        event: "event",
        webhook: "webhook",
        draw: "draw",
        attempts: "attempts",
        next: "next",
        delivered: "delivered",
        http: "http",
      },
      observabilitySection: {
        title: "Distribution Observability",
        lastDays: "Last",
        baseline: "baseline",
        draws: "draws",
        players: "players",
        hitRate: "Hit Rate",
        payoutRate: "Payout Rate",
        rewardCost: "Reward / Cost",
        expected: "expected",
        actual: "actual",
        reward: "reward",
      },
      confirmDialog: {
        title: "Confirm action",
        description: "This action requires break-glass confirmation.",
        confirm: "Confirm",
        cancel: "Cancel",
        stepUpHint:
          "Enter the admin MFA code in the step-up panel before confirming this action.",
        mfaRequired: "Admin MFA code is required.",
        breakGlassRequired: "Admin break-glass code is required.",
      },
      enums: {
        tenantStatus: {
          active: "active",
          suspended: "suspended",
          archived: "archived",
        },
        projectEnvironment: {
          sandbox: "sandbox",
          live: "live",
        },
        role: {
          tenant_owner: "tenant_owner",
          tenant_operator: "tenant_operator",
          agent_manager: "agent_manager",
          agent_viewer: "agent_viewer",
        },
        tenantLinkType: {
          agent_client: "agent_client",
        },
        billingPlan: {
          starter: "starter",
          growth: "growth",
          enterprise: "enterprise",
        },
        collectionMethod: {
          send_invoice: "send_invoice",
          charge_automatically: "charge_automatically",
        },
        boolean: {
          on: "on",
          off: "off",
          yes: "yes",
          no: "no",
        },
        inviteStatus: {
          pending: "pending",
          accepted: "accepted",
          revoked: "revoked",
          expired: "expired",
        },
      },
    },
    engine: {
      title: "Engine Reconciliation",
      description:
        "Review wallet-vs-ledger reconciliation alerts emitted by the engine job and drive them through operational triage.",
      summary: {
        unresolved: "Unresolved",
        overdue: "Over SLA",
        zeroDriftStreak: "Zero-Drift Streak",
        slaTarget: "SLA Target",
        open: "Open",
        acknowledged: "Acknowledged",
        requireEngineering: "Needs Engineering",
        resolved: "Resolved",
      },
      stepUp: {
        title: "Reconciliation Step-Up",
        description:
          "Status changes require a fresh MFA code plus an operator note so the alert queue stays auditable.",
        placeholder: "Enter an MFA code before changing alert status",
        operatorNote: "Operator Note",
        operatorNotePlaceholder:
          "Document why the alert was acknowledged, resolved, or escalated.",
      },
      actions: {
        acknowledge: "Acknowledge",
        requireEngineering: "Escalate",
        resolve: "Resolve",
        export: "Export CSV",
        viewQueue: "Open Queue",
      },
      table: {
        empty: "No reconciliation alerts yet.",
        headers: {
          user: "User",
          status: "Status",
          delta: "Delta",
          sla: "SLA",
          ledgerSnapshot: "Ledger Snapshot",
          walletSnapshot: "Wallet Snapshot",
          lastDetectedAt: "Last Detected",
          updatedAt: "Updated",
          actions: "Actions",
        },
      },
      status: {
        open: "Open",
        acknowledged: "Acknowledged",
        requireEngineering: "Needs Engineering",
        resolved: "Resolved",
      },
      snapshot: {
        withdrawable: "Withdrawable",
        bonus: "Bonus",
        locked: "Locked",
        wagered: "Wagered",
        total: "Total",
        capturedAt: "Captured",
        latestLedgerEntryId: "Latest Ledger Entry",
        details: "Details",
      },
      sla: {
        dueAt: "Due",
        firstDetectedAt: "First Detected",
        breached: "Breached",
        healthy: "Healthy",
        escalatedAt: "Escalated",
      },
    },
    permissions: {
      title: "Engine Scopes",
      description:
        "Manage the engine-specific scope subset stored in admin_permissions while keeping legacy admin dot-permissions intact.",
      noticeTitle: "Managed-scope mode",
      noticeBody:
        "Saving here only changes the engine scope pool for the selected admin. Existing admin console permissions are preserved and shown read-only below.",
      success: "Updated scopes for",
      summary: {
        adminCount: "Admin accounts",
        activeCount: "Admins with engine scopes",
        scopeCount: "Assignable scopes",
      },
      directory: {
        title: "Admin directory",
        description: "Pick an admin account before editing engine scopes.",
        empty: "No active admin accounts found.",
        mfaEnabled: "MFA on",
        mfaDisabled: "MFA off",
        noScopes: "No engine scopes",
        legacyCount: "Legacy permissions preserved:",
      },
      groups: {
        engine: "Engine umbrella",
        consumer: "C-side operations",
        business: "B-side operations",
      },
      editor: {
        title: "Scope assignment",
        empty: "Choose an admin account to edit engine scopes.",
        none: "None",
        legacyTitle: "Legacy admin permissions",
        legacyDescription:
          "These dot-permissions stay read-only here and are preserved on save.",
        confirmationLabel: "Second confirmation",
        confirmationHint: "Type the exact phrase before saving:",
        stepUpPlaceholder: "Enter a fresh MFA code",
        stepUpDescription:
          "Saving scope changes reuses the CONFIG_UPDATE step-up requirement.",
        save: "Save scopes",
      },
    },
    reconciliation: {
      title: "Reconciliation Desk",
      description:
        "Review the latest reconciliation runs, open mismatches, and trigger a manual sweep when needed.",
      run: {
        title: "Manual Reconciliation",
        description: "Manual reconciliation requires a fresh admin MFA code.",
        providerId: "Provider ID",
        providerIdPlaceholder: "Leave blank to scan every active provider",
        totpCode: "MFA Code",
        runAll: "Scan All Providers",
        runOne: "Scan One Provider",
        readOnly:
          "This account is read-only here. Manual runs require `finance.reconcile`.",
      },
      summary: {
        openIssues: "Open issues",
        criticalIssues: "Critical issues",
        manualQueue: "Needs manual review",
        latestRun: "Latest run",
        latestRunNone: "No runs yet",
      },
      issues: {
        title: "Open Issues",
        description: "Prioritize findings that are still in the open queue.",
        empty: "There are no open reconciliation issues.",
        headers: {
          severity: "Severity",
          issueType: "Issue type",
          flow: "Flow",
          orderId: "Order ID",
          providerId: "Provider",
          localStatus: "Local status",
          remoteStatus: "Remote status",
          detectedAt: "Last detected",
        },
      },
      runs: {
        title: "Recent Runs",
        description: "Recent provider reconciliation runs and summaries.",
        empty: "No reconciliation runs yet.",
        headers: {
          provider: "Provider",
          trigger: "Trigger",
          status: "Status",
          startedAt: "Started",
          completedAt: "Completed",
          summary: "Summary",
        },
        summaryFallback: "No summary",
      },
      alerts: {
        completed: "Reconciliation request submitted.",
      },
    },
    users: {
      title: "Users",
      description:
        "Search by email, phone, or user ID, then inspect status and apply scoped freezes.",
      backToSearch: "Back to search",
      search: {
        title: "User search",
        description:
          "Find a consumer account by email, phone number, or user ID.",
        label: "Search term",
        placeholder: "Email, phone, or user ID",
        submit: "Search",
        resultsTitle: "Results",
        resultsDescription: "Matched user accounts ready for review.",
        resultsEmptyHint: "Enter a user identifier to start searching.",
        noResults: "No matching users found.",
        idle: "Search results will appear here.",
      },
      table: {
        user: "User",
        kyc: "KYC Tier",
        freeze: "Freeze Status",
        createdAt: "Created",
        actions: "Actions",
        view: "View details",
      },
      detail: {
        title: "User detail",
        description:
          "Review identity, wallet, freezes, and recent activity before taking action.",
      },
      profile: {
        createdAt: "Created At",
        updatedAt: "Updated At",
        emailStatus: "Email status",
        phoneStatus: "Phone status",
        age: "Age",
        birthDate: "Birth date",
        registrationCountry: "Registration country",
        countryTier: "Country tier",
        countryResolvedAt: "Country resolved at",
        jurisdiction: "Jurisdiction policy",
        userPoolBalance: "User pool balance",
        pityStreak: "Pity streak",
      },
      wallet: {
        title: "Wallet snapshot",
        description: "Current operational balances from the user wallet.",
        withdrawable: "Withdrawable",
        bonus: "Bonus",
        locked: "Locked",
        wagered: "Wagered",
        updatedAt: "Updated",
      },
      freeze: {
        title: "Freeze controls",
        description:
          "Apply or release freezes by category and scope. Account scope revokes active sessions immediately.",
        stepUpPlaceholder: "Enter an MFA code before high-risk actions",
        category: "Category",
        reason: "Reason",
        scope: "Scope",
        activeScopes: "Active scoped freezes",
        activeScopesDescription:
          "Release one scope at a time when review clears.",
        noActiveScope: "No active scoped freezes.",
        scopeReleaseHint:
          "This releases the active freeze for the selected scope.",
        recordsTitle: "Freeze records",
        recordsDescription:
          "Latest freeze history grouped by reason and scope.",
        status: "Status",
        createdAt: "Created",
        releasedAt: "Released",
      },
      actions: {
        freeze: "Freeze scope",
        unfreeze: "Unfreeze scope",
        forceLogout: "Force logout",
        forceLogoutDescription:
          "Revoke all active user sessions without changing the password.",
        resetPassword: "Reset password",
        resetPasswordDescription:
          "Queue a password-reset email through the backend operator flow.",
        openKycProfile: "Open KYC profile",
        freezeSuccess: "Scoped freeze applied.",
        unfreezeSuccess: "Scoped freeze released.",
        forceLogoutSuccess: "User sessions revoked.",
        resetPasswordSuccess: "Password reset email queued.",
      },
      activity: {
        drawsTitle: "Recent draws",
        drawsDescription: "Latest draw outcomes and prize results.",
        paymentsTitle: "Recent payments",
        paymentsDescription: "Latest deposits and withdrawals across channels.",
        loginsTitle: "Recent login IPs",
        loginsDescription: "Recent login-related events and source IPs.",
        empty: "No recent activity.",
        noPrize: "No prize",
        drawCost: "Draw cost",
        rewardAmount: "Reward amount",
        deposit: "Deposit",
        withdrawal: "Withdrawal",
      },
      status: {
        noFreeze: "No active freeze",
        unverified: "Unverified",
        emailVerified: "Email verified",
        phoneVerified: "Phone verified",
      },
      kyc: {
        tier0: "Tier 0",
        tier1: "Tier 1",
        tier2: "Tier 2",
      },
      scope: {
        account: "Account",
        gameplay: "Gameplay",
        topup: "Top-up",
        withdrawal: "Withdrawal",
      },
      category: {
        risk: "Risk",
        community: "Community",
        compliance: "Compliance",
        security: "Security",
        support: "Support",
        operations: "Operations",
      },
      reason: {
        accountLock: "Account lock",
        withdrawalLock: "Withdrawal lock",
        gameplayLock: "Gameplay lock",
        pendingKyc: "Pending KYC",
        amlReview: "AML review",
        authFailure: "Auth failure",
        manualAdmin: "Manual admin action",
        forumModeration: "Forum moderation",
        jurisdictionRestriction: "Jurisdiction restriction",
        underageRestriction: "Underage restriction",
      },
      errors: {
        loadSearch: "Failed to load user search results.",
        loadDetail: "Failed to load user detail.",
        unexpectedData: "User API returned an unexpected response.",
        invalidUserId: "Invalid user id.",
        freezeFields: "Category, reason, and scope are required.",
        scopeRequired: "Scope is required.",
        freezeFailed: "Failed to freeze user scope.",
        unfreezeFailed: "Failed to unfreeze user scope.",
        forceLogoutFailed: "Failed to revoke user sessions.",
        resetPasswordFailed: "Failed to queue password reset.",
      },
    },
    security: {
      title: "Security Monitor",
      description: "Recent authentication failures and security events.",
      errors: {
        loadData: "Failed to load security data.",
        unexpectedResponse: "Security API returned an unexpected response.",
        missingFreezeRecordId: "Missing freeze record id.",
        releaseFreeze: "Failed to release freeze.",
        missingUserId: "Missing user id.",
        freezeAccount: "Failed to freeze account.",
        jurisdictionFields: "Country code and minimum age are required.",
        saveJurisdictionRule: "Failed to save jurisdiction rule.",
      },
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
      jurisdiction: {
        title: "Jurisdiction Rules",
        description:
          "Configure country-level age and feature gates that map into scoped freezes.",
        countryCode: "Country code",
        minimumAge: "Minimum age",
        allowedFeatures: "Allowed features",
        notes: "Operator notes",
        notesPlaceholder: "Optional context for this country rule",
        save: "Save rule",
        saveSuccess: "Jurisdiction rule saved.",
        empty: "No country-specific jurisdiction rules have been configured yet.",
        noFeatures: "No money features allowed",
        tiers: {
          blocked: "Blocked",
          restricted: "Restricted",
          full: "Full",
        },
        features: {
          realMoneyGameplay: "Real-money gameplay",
          topup: "Top-up",
          withdrawal: "Withdrawal",
        },
        headers: {
          countryCode: "Country",
          countryTier: "Tier",
          minimumAge: "Min age",
          allowedFeatures: "Allowed features",
          updatedAt: "Updated",
        },
      },
      freeze: {
        title: "Frozen Accounts",
        description: "Accounts locked by the risk engine.",
        createTitle: "Freeze Account",
        createDescription: "Manually freeze a user account if needed.",
        userId: "User ID",
        reason: "Reason",
        scope: "Scope",
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
          scope: "Scope",
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
    tables: {
      title: "Live Table Monitor",
      description:
        "Track active tables, seats, current round phase, and expired actions in one place.",
      stepUp: {
        title: "Operations Step-Up",
        description:
          "Force timeout, close table, and kick seat actions require a fresh MFA or recovery code.",
        placeholder: "Enter an MFA code before table interventions",
      },
      connection: {
        connected: "Realtime connected",
        connecting: "Connecting realtime channel",
        disconnected: "Realtime disconnected",
      },
      summary: {
        liveTables: "Live Tables",
        occupiedSeats: "Occupied Seats",
        timedOutSeats: "Timed-Out Seats",
      },
      labels: {
        user: "User",
        participantId: "Participant",
        userId: "User ID",
        roundId: "Round ID",
        updatedAt: "Updated",
        timeBank: "Time Bank",
        currentActor: "Current Actor",
        none: "None",
        noTables: "No active tables right now.",
      },
      actions: {
        reason: "Reason",
        forceTimeout: "Force Timeout",
        closeTable: "Close Table",
        kickSeat: "Kick Seat",
        timeoutReasonPlaceholder: "Optional timeout note for audit",
        closeReasonPlaceholder: "Required reason for closing this table",
        kickReasonPlaceholder: "Required reason for kicking this seat",
      },
      state: {
        active: "Active",
        overdue: "Overdue",
        closing: "Closing",
        closed: "Closed",
      },
      phase: {
        waiting: "Waiting",
        betting: "Betting",
        playerTurn: "Player Turn",
        dealerTurn: "Dealer Turn",
        marketOpen: "Market Open",
        marketLocked: "Market Locked",
        settling: "Settling",
        resolved: "Resolved",
        closed: "Closed",
      },
      source: {
        blackjack: "Blackjack",
        holdem: "Hold'em",
        liveDealer: "Live Dealer",
        predictionMarket: "Prediction Market",
      },
      seatRole: {
        dealer: "Dealer",
        player: "Player",
        observer: "Observer",
        marketMaker: "Market Maker",
      },
      seatStatus: {
        empty: "Empty",
        occupied: "Occupied",
        acting: "Acting",
        waiting: "Waiting",
        timedOut: "Timed Out",
        removed: "Removed",
      },
      errors: {
        loadData: "Failed to load live table data.",
        unexpectedResponse:
          "Table monitoring API returned an unexpected response.",
        missingTable: "Missing table identifier.",
        missingSeat: "Missing seat identifier.",
        missingReason: "Reason is required.",
        missingTotp: "Admin MFA code is required.",
      },
    },
    markets: {
      title: "Prediction Markets",
      description:
        "Create, review, settle, and cancel prediction markets without dropping to raw admin APIs.",
      stepUp: {
        title: "Market Step-Up",
        description:
          "Market lifecycle mutations require a fresh admin MFA code so creation, settlement, and cancellation stay auditable.",
        placeholder: "Enter an MFA code before market mutations",
      },
      summary: {
        draft: "Draft",
        open: "Open",
        locked: "Locked",
        resolved: "Resolved",
        cancelled: "Cancelled",
      },
      create: {
        title: "Create Market",
        description:
          "Define the market question, resolution policy, timing, and outcomes in one flow.",
        submit: "Create market",
        slug: "Slug",
        roundKey: "Round Key",
        marketTitle: "Market Title",
        descriptionLabel: "Description",
        descriptionPlaceholder:
          "Optional operator-facing context for this market listing.",
        resolutionRules: "Resolution Rules",
        resolutionRulesPlaceholder:
          "Describe the exact settlement rule, edge cases, and how invalidation is handled.",
        sourceOfTruth: "Source of Truth",
        oracleProvider: "Oracle Provider",
        oracleBindingName: "Oracle Binding Name",
        oracleBindingConfig: "Oracle Config JSON",
        oracleBindingConfigPlaceholder:
          '{"url":"https://api.example.com/market","valuePath":"result","comparison":{"operator":"gte","threshold":"100000","outcomeKeyIfTrue":"yes","outcomeKeyIfFalse":"no"}}',
        oracleBindingConfigHint:
          "Provide provider-specific JSON. api_pull reads an HTTP API, chainlink reads an RPC feed, uma_oracle reads an assertion, and manual_admin keeps manual fallback only.",
        category: "Category",
        vigPercent: "Vig (%)",
        vigHint:
          "Applied to the total pool on resolved markets before winner payouts are distributed.",
        tags: "Tags",
        tagsPlaceholder: "btc, macro, daily-close",
        invalidPolicy: "Invalid Policy",
        opensAt: "Opens At (UTC ISO)",
        locksAt: "Locks At (UTC ISO)",
        resolvesAt: "Resolves At (UTC ISO)",
        timestampHint:
          "Use ISO-8601 UTC timestamps, for example 2026-04-29T12:00:00Z.",
        outcomes: "Outcomes",
        outcomesPlaceholder: "yes|Yes\nno|No",
        outcomesHint: "One outcome per line using key|label.",
      },
      list: {
        title: "Market Lifecycle",
        description:
          "Review pool state, rules, oracle evidence, and finalize markets from the same workspace.",
        empty: "No prediction markets have been created yet.",
      },
      appeals: {
        title: "Appeal Queue",
        description:
          "Review oracle exceptions that blocked automatic settlement, acknowledge operator ownership, and then settle or cancel from the market workbench.",
        open: "Open appeals",
        acknowledged: "Acknowledged",
        totalActive: "Active queue",
        empty: "No active prediction market appeals are waiting for review.",
        activeBadge: "Appeals",
        marketStatus: "Market status",
        firstDetectedAt: "First detected",
        lastDetectedAt: "Last detected",
        details: "Appeal details",
        metadata: "Appeal metadata",
        binding: "Oracle binding snapshot",
        bindingStatus: "Binding status",
        lastResolvedOutcomeKey: "Last resolved outcome",
        noBinding: "No oracle binding snapshot is available for this appeal.",
        acknowledgeNote: "Acknowledge note",
        acknowledgeNotePlaceholder:
          "Optional operator note, for example who is taking ownership or what data source is being checked.",
        acknowledgedHint:
          "This appeal has been acknowledged. Complete settlement or cancellation on the market card to resolve it.",
        actions: {
          acknowledge: "Acknowledge appeal",
        },
      },
      labels: {
        none: "None",
        roundKey: "Round key",
        rules: "Rules",
        category: "Category",
        tags: "Tags",
        vig: "Vig",
        invalidPolicy: "Invalid policy",
        sourceOfTruth: "Source of truth",
        resolutionRules: "Resolution rules",
        outcomePools: "Outcome pools",
        totalPool: "Total staked",
        positionCount: "Positions",
        oracle: "Oracle",
        noOracle: "No oracle data recorded yet.",
        opensAt: "Opens",
        locksAt: "Locks",
        resolvesAt: "Resolves",
        resolvedAt: "Finalized",
        createdAt: "Created",
        updatedAt: "Updated",
        winningOutcome: "Winning",
      },
      status: {
        draft: "Draft",
        open: "Open",
        locked: "Locked",
        resolved: "Resolved",
        cancelled: "Cancelled",
      },
      actions: {
        settleTitle: "Settle Market",
        settleDescription:
          "Provide the winning outcome and the oracle evidence used to finalize this market.",
        settleAppealUnlocked:
          "An active appeal is open for this market, so manual settlement is currently unlocked for operator fallback.",
        settleLockedOnly:
          "Settlement is only available once the market is locked.",
        cancelTitle: "Cancel Market",
        cancelDescription:
          "Cancel the market and refund open positions when the market must be invalidated or withdrawn.",
        winningOutcome: "Winning Outcome",
        oracleSource: "Oracle Source",
        oracleExternalRef: "Oracle External Ref",
        oracleReportedAt: "Oracle Reported At (UTC ISO)",
        oraclePayloadHash: "Oracle Payload Hash",
        oraclePayload: "Oracle Payload JSON",
        cancelReason: "Cancellation Reason",
        cancelReasonPlaceholder:
          "Explain why this market is being cancelled and what operators should know.",
        cancellationMetadata: "Cancellation Metadata JSON",
        submitSettle: "Settle market",
        submitCancel: "Cancel market",
      },
      success: {
        create: "Market created.",
        settle: "Market settled.",
        cancel: "Market cancelled.",
        acknowledgeAppeal: "Appeal acknowledged.",
      },
      enums: {
        category: {
          crypto: "Crypto",
          finance: "Finance",
          sports: "Sports",
          politics: "Politics",
          technology: "Technology",
          culture: "Culture",
          other: "Other",
        },
        invalidPolicy: {
          refundAll: "Refund all",
          manualReview: "Manual review",
        },
        appealStatus: {
          open: "Open",
          acknowledged: "Acknowledged",
          resolved: "Resolved",
        },
        appealReason: {
          oracle_fetch_failed: "Oracle fetch failed",
          oracle_response_invalid: "Invalid oracle response",
          oracle_value_unmapped: "Oracle value unmapped",
          oracle_value_stale: "Oracle value stale",
          oracle_resolution_failed: "Oracle resolution failed",
          oracle_dispute_pending_too_long: "Oracle dispute pending too long",
          manual_intervention_required: "Manual intervention required",
        },
        oracleBindingStatus: {
          active: "Active",
          pending: "Pending",
          resolved: "Resolved",
          appealed: "Appealed",
          manual_only: "Manual only",
          cancelled: "Cancelled",
        },
      },
      errors: {
        loadData: "Failed to load prediction markets.",
        loadAppeals: "Failed to load prediction market appeals.",
        unexpectedResponse:
          "Prediction market API returned an unexpected response.",
        unexpectedAppealsResponse:
          "Prediction market appeal API returned an unexpected response.",
        invalidOutcomes:
          "Enter at least two outcomes using one key|label pair per line.",
        invalidTags: "Enter at least one tag separated by commas.",
        invalidVigPercent:
          "Enter a vig percentage between 0.00 and 100.00.",
        invalidJson: "Enter valid JSON object data.",
        oracleProviderRequired: "Oracle provider is required.",
        invalidOracleBinding:
          "Oracle binding is invalid. Check the provider and config JSON.",
        missingTotp: "Admin MFA code is required.",
        missingMarketId: "Missing market id.",
        missingAppealId: "Missing appeal id.",
        winningOutcomeRequired: "Winning outcome is required.",
        oracleSourceRequired:
          "Oracle source is required when submitting oracle details.",
        cancelReasonRequired: "Cancellation reason is required.",
        createFailed: "Failed to create prediction market.",
        settleFailed: "Failed to settle prediction market.",
        cancelFailed: "Failed to cancel prediction market.",
        acknowledgeAppealFailed:
          "Failed to acknowledge prediction market appeal.",
      },
    },
    forum: {
      moderation: {
        eyebrow: "Forum",
        title: "Moderation Queue",
        description:
          "Review reported or automatically flagged community posts, remove violating content in bulk, and apply gameplay-only mutes to repeat offenders.",
        notice:
          "Forum mutes create a community freeze with gameplay_lock scope. Wallet, top-up, and withdrawal flows remain available.",
        stepUp: {
          title: "Mute Step-Up",
          description:
            "Muting or releasing a forum mute requires a fresh admin MFA code. Bulk post deletion does not require the step-up code.",
          placeholder: "Enter an MFA code before muting or releasing a user",
          releaseReason: "Release note",
          releaseReasonPlaceholder:
            "Optional note recorded when a gameplay mute is released",
        },
        queue: {
          title: "Flagged Posts",
          description:
            "Each row groups open user reports and automated anti-spam signals by post so operators can clear violating content without leaving the forum workbench.",
          empty: "No open moderation signals in the queue.",
          bulkReason: "Bulk delete reason",
          bulkReasonPlaceholder:
            "Explain why the selected posts are being removed",
          bulkDelete: "Delete selected posts",
          muteAuthor: "Mute author",
          muted: "Muted",
          autoHidden: "Auto-hidden",
          headers: {
            select: "Select",
            post: "Post",
            author: "Author",
            thread: "Thread",
            reports: "Signals",
            source: "Source",
            latestReason: "Latest signal",
            status: "Status",
            reportedAt: "Latest flagged",
            actions: "Actions",
          },
        },
        activeMutes: {
          title: "Active Gameplay Mutes",
          description:
            "Only community gameplay freezes appear here. Financial controls are managed elsewhere.",
          empty: "No active forum gameplay mutes.",
          release: "Release mute",
          headers: {
            user: "User",
            reason: "Reason",
            createdAt: "Created",
            actions: "Actions",
          },
        },
        feedback: {
          bulkDeleteSuccess: "Flagged posts deleted and moderation signals resolved.",
          muteSuccess: "Gameplay mute applied.",
          releaseSuccess: "Gameplay mute released.",
        },
        errors: {
          loadData: "Failed to load forum moderation data.",
          unexpectedResponse:
            "Forum moderation API returned an unexpected response.",
          invalidBulkSelection:
            "Select at least one reported post and provide a reason.",
          invalidUserId: "Invalid user id.",
          invalidFreezeRecordId: "Invalid freeze record id.",
          stepUpRequired: "Admin MFA code is required.",
          bulkDeleteFailed: "Failed to delete reported posts.",
          muteFailed: "Failed to mute user.",
          releaseFailed: "Failed to release mute.",
        },
      },
    },
    aml: {
      eyebrow: "AML Review Queue",
      title: "AML hit handling",
      description:
        "Matched hits stay here until an operator clears, confirms, or escalates them.",
      warnings: {
        overduePrefix: "There are",
        overdueMiddle: "AML hits beyond the SLA window of",
        overdueSuffix:
          "minutes. Prometheus alerts will continue to track them.",
      },
      summary: {
        pendingHits: "Pending hits",
        overdue: "Overdue",
        sla: "SLA",
        oldestPending: "Oldest pending",
      },
      stepUp: {
        title: "Step-up",
        description:
          "Clear, confirm, and escalate actions require a fresh admin MFA code.",
        placeholder: "Enter a 6-digit MFA code before taking action",
      },
      filters: {
        limit: "Limit",
        sort: "Sort",
        sortNewest: "Newest first",
        sortOldest: "Oldest first",
        apply: "Apply",
      },
      queue: {
        title: "Pending AML hits",
        description:
          "Review the provider payload, screening context, and current freeze state before deciding.",
        empty: "No pending AML hits.",
      },
      caseItem: {
        caseLabel: "Case",
        userLabel: "User",
        created: "Created",
        due: "Due",
        freeze: "Freeze",
        none: "None",
        statusWithinSla: "Within SLA",
        statusOverdue: "Overdue",
        providerPayload: "Provider raw payload",
        screeningContext: "Screening context",
        note: "Review note",
        notePlaceholder:
          "Optional: record the operator rationale for clear, confirm, or escalate.",
      },
      checkpoint: {
        registration: "Registration",
        firstDeposit: "First deposit",
        withdrawalRequest: "Withdrawal request",
      },
      riskLevel: {
        low: "Low",
        medium: "Medium",
        high: "High",
      },
      feedback: {
        clearSuccess: "AML hit cleared.",
        confirmSuccess: "AML hit confirmed and account lock preserved.",
        escalateSuccess: "AML hit escalated for follow-up review.",
      },
      actions: {
        clear: "Clear",
        confirm: "Confirm to account lock",
        escalate: "Escalate",
      },
      errors: {
        loadQueue: "Failed to load the AML review queue.",
        unexpectedResponse: "AML review API returned an unexpected response.",
        missingCheckId: "Missing AML check id.",
        mfaRequired: "Admin MFA code is required.",
        clearFailed: "Failed to clear the AML review case.",
        confirmFailed: "Failed to confirm the AML review case.",
        escalateFailed: "Failed to escalate the AML review case.",
      },
    },
    risk: {
      collusion: {
        eyebrow: "Risk",
        title: "Anti-Collusion Monitor",
        description:
          "Visualize suspicious table interaction patterns by user, device, shared IP, and frequent pairings.",
        filters: {
          title: "Window",
          description: "Change the analysis window for timeline aggregation.",
          days: "Time range",
          days7: "Last 7 days",
          days14: "Last 14 days",
          days30: "Last 30 days",
          apply: "Apply",
        },
        stepUp: {
          title: "Risk Step-Up",
          description:
            "Manual flags and gameplay freezes require a fresh MFA or recovery code.",
          placeholder: "Enter an MFA code before taking risk actions",
          reason: "Operator note",
          reasonPlaceholder: "Optional note for mark or freeze actions",
        },
        summary: {
          userLeaders: "User leaders",
          deviceLeaders: "Device leaders",
          sharedIpClusters: "Shared IP clusters",
          frequentPairs: "Frequent table pairs",
        },
        chart: {
          title: "Suspicion Score Timeline",
          description:
            "Cumulative suspicion deltas from recorded table interactions.",
          userView: "User",
          deviceView: "Device",
          empty: "No collusion signals in the selected window.",
        },
        users: {
          title: "User Risk Leaders",
          description:
            "Review the highest-scoring user entities and apply manual actions.",
          headers: {
            user: "User",
            score: "Score",
            events: "Signals",
            flag: "Risk flag",
            freeze: "Freeze",
            lastSeen: "Last seen",
            actions: "Actions",
          },
          empty: "No risky users found.",
          mark: "Mark",
          clearMark: "Clear mark",
          freezeGame: "Freeze gameplay",
          flagManual: "Manual mark",
          flagOpen: "Open risk flag",
          flagNone: "No mark",
          freezeActive: "Frozen",
          freezeNone: "Active",
        },
        clusters: {
          sharedIpTitle: "Shared IP Clusters",
          sharedIpDescription:
            "Pairs that repeatedly shared the same IP fingerprint in the selected window.",
          sharedDeviceTitle: "Shared Device Clusters",
          sharedDeviceDescription:
            "Pairs that repeatedly shared the same device fingerprint in the selected window.",
          headers: {
            fingerprint: "Fingerprint",
            score: "Score",
            events: "Pair events",
            users: "Users",
            lastSeen: "Last seen",
          },
          empty: "No shared clusters found.",
        },
        pairs: {
          title: "Frequent Same-Table Pairs",
          description:
            "Pairs with the highest repeated table interaction counts across tracked tables.",
          headers: {
            table: "Table",
            users: "Users",
            interactions: "Interactions",
            sharedIp: "Shared IP",
            sharedDevice: "Shared device",
            score: "Score",
            lastSeen: "Last seen",
          },
          empty: "No repeated table pairs found.",
        },
      },
    },
    audit: {
      title: "CMS Audit",
      description:
        "Review administrative operations across control, finance, security, and SaaS workflows from one searchable audit view.",
      export: "Export CSV",
      filters: {
        adminId: "Admin ID",
        userId: "User ID",
        action: "Action",
        from: "From",
        to: "To",
        limit: "Limit",
        sort: "Sort",
        sortNewest: "Newest first",
        sortOldest: "Oldest first",
        apply: "Apply",
        reset: "Reset",
      },
      summary: {
        total: "Matched actions",
        byAdmin: "Top admins",
        byAction: "Top actions",
        byUser: "Top users",
        byDay: "Activity by day",
        empty: "No aggregate data for the current filters.",
        allAdmins: "All admins",
        allUsers: "All users",
      },
      table: {
        title: "Audit log",
        description:
          "Every row captures who acted, what changed, and which user or resource was affected.",
        empty: "No audit actions found.",
        headers: {
          id: "ID",
          createdAt: "Created",
          admin: "Admin",
          action: "Action",
          user: "User",
          target: "Target",
          request: "Request",
          context: "Context",
        },
        unknownAdmin: "Unassigned admin",
        unknownUser: "No linked user",
        noTarget: "No target",
        session: "Session",
        agent: "User Agent",
        metadata: "Metadata",
        noMetadata: "No metadata",
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
