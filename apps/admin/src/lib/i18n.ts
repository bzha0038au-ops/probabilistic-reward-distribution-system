import type { RequestEvent } from '@sveltejs/kit';

export type Locale = 'en' | 'zh-CN';

export type Messages = {
  common: {
    appName: string;
    signIn: string;
    signOut: string;
    email: string;
    password: string;
    adminLabel: string;
    navAdmin: string;
    navFinance: string;
    navSecurity: string;
    prev: string;
    next: string;
  };
  login: {
    title: string;
    eyebrow: string;
    heading: string;
    description: string;
    emailPlaceholder: string;
    submit: string;
  };
  admin: {
    eyebrow: string;
    heading: string;
    description: string;
    config: {
      title: string;
      description: string;
      poolBalance: string;
      drawCost: string;
      weightJitterEnabled: string;
      weightJitterPct: string;
      bonusAutoReleaseEnabled: string;
      bonusUnlockWagerRatio: string;
      authFailureWindowMinutes: string;
      authFailureFreezeThreshold: string;
      adminFailureFreezeThreshold: string;
      submit: string;
    };
    bonus: {
      title: string;
      description: string;
      userId: string;
      amount: string;
      amountPlaceholder: string;
      release: string;
      autoReleaseHint: string;
    };
    metrics: {
      totalDraws: string;
      winRate: string;
      poolBalance: string;
    };
    create: {
      title: string;
      description: string;
      submit: string;
    };
    edit: {
      title: string;
      description: string;
      empty: string;
      save: string;
      cancel: string;
    };
    form: {
      name: string;
      stock: string;
      weight: string;
      poolThreshold: string;
      userPoolThreshold: string;
      rewardAmount: string;
      payoutBudget: string;
      payoutPeriodDays: string;
      isActive: string;
    };
    table: {
      title: string;
      description: string;
      headers: {
        name: string;
        stock: string;
        weight: string;
        threshold: string;
        userThreshold: string;
        reward: string;
        budget: string;
        period: string;
        status: string;
        actions: string;
      };
      statusActive: string;
      statusInactive: string;
      actionEdit: string;
      actionToggle: string;
      actionDelete: string;
      empty: string;
    };
    topSpenders: {
      title: string;
      userId: string;
      spend: string;
    };
    confirmDelete: string;
  };
  finance: {
    title: string;
    description: string;
    deposits: {
      title: string;
      description: string;
      headers: {
        id: string;
        userId: string;
        amount: string;
        status: string;
        createdAt: string;
        actions: string;
      };
      statusPending: string;
      statusSuccess: string;
      statusFailed: string;
      actionApprove: string;
      actionFail: string;
      empty: string;
    };
    withdrawals: {
      title: string;
      description: string;
      headers: {
        id: string;
        userId: string;
        amount: string;
        status: string;
        bankCardId: string;
        createdAt: string;
        actions: string;
      };
      statusPending: string;
      statusApproved: string;
      statusRejected: string;
      statusPaid: string;
      actionApprove: string;
      actionReject: string;
      actionPay: string;
      empty: string;
    };
  };
  security: {
    title: string;
    description: string;
    filters: {
      title: string;
      description: string;
      email: string;
      eventType: string;
      from: string;
      to: string;
      limit: string;
      sort: string;
      sortNewest: string;
      sortOldest: string;
      apply: string;
      export: string;
    };
    authEvents: {
      title: string;
      description: string;
      headers: {
        id: string;
        email: string;
        userId: string;
        eventType: string;
        ip: string;
        userAgent: string;
        createdAt: string;
      };
      empty: string;
    };
    freeze: {
      title: string;
      description: string;
      createTitle: string;
      createDescription: string;
      userId: string;
      reason: string;
      reasonPlaceholder: string;
      freeze: string;
      limit: string;
      sort: string;
      sortNewest: string;
      sortOldest: string;
      headers: {
        id: string;
        userId: string;
        reason: string;
        status: string;
        createdAt: string;
        actions: string;
      };
      release: string;
      empty: string;
    };
    adminActions: {
      title: string;
      description: string;
      export: string;
      filters: {
        adminId: string;
        action: string;
        from: string;
        to: string;
        limit: string;
        sort: string;
        sortNewest: string;
        sortOldest: string;
        apply: string;
      };
      headers: {
        id: string;
        adminId: string;
        action: string;
        targetType: string;
        targetId: string;
        ip: string;
        createdAt: string;
      };
      empty: string;
    };
  };
};

export const LOCALE_COOKIE = 'reward_locale';
export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: Locale[] = ['en', 'zh-CN'];

const translations: Record<Locale, Messages> = {
  en: {
    common: {
      appName: 'Prize Pool Admin',
      signIn: 'Sign In',
      signOut: 'Sign Out',
      email: 'Email',
      password: 'Password',
      adminLabel: 'Admin',
      navAdmin: 'Control',
      navFinance: 'Finance',
      navSecurity: 'Security',
      prev: 'Prev',
      next: 'Next',
    },
    login: {
      title: 'Admin Sign In',
      eyebrow: 'Admin Portal',
      heading: 'Sign in to manage the prize pool',
      description: 'Use your admin credentials to access analytics and prize controls.',
      emailPlaceholder: 'admin@reward.dev',
      submit: 'Sign In',
    },
    admin: {
      eyebrow: 'Admin Console',
      heading: 'Prize Pool Control Center',
      description: 'Configure prizes, tune weights, and monitor draw performance.',
      config: {
        title: 'System Controls',
        description: 'Adjust pool balance, draw cost, and randomization.',
        poolBalance: 'Pool Balance',
        drawCost: 'Draw Cost',
        weightJitterEnabled: 'Enable Weight Jitter',
        weightJitterPct: 'Weight Jitter %',
        bonusAutoReleaseEnabled: 'Auto Release Bonus',
        bonusUnlockWagerRatio: 'Bonus Unlock Wager Ratio',
        authFailureWindowMinutes: 'Auth Failure Window (min)',
        authFailureFreezeThreshold: 'User Freeze Threshold',
        adminFailureFreezeThreshold: 'Admin Freeze Threshold',
        submit: 'Update Settings',
      },
      bonus: {
        title: 'Bonus Release',
        description: 'Manually unlock bonus balance when auto release is disabled.',
        userId: 'User ID',
        amount: 'Amount',
        amountPlaceholder: 'Leave empty to release all',
        release: 'Release Bonus',
        autoReleaseHint: 'Auto release is enabled. Disable it to release manually.',
      },
      metrics: {
        totalDraws: 'Total Draws',
        winRate: 'Win Rate',
        poolBalance: 'Pool Balance',
      },
      create: {
        title: 'Create Prize',
        description: 'Set stock, weight, and reward values.',
        submit: 'Create Prize',
      },
      edit: {
        title: 'Edit Prize',
        description: 'Select a prize from the table to edit.',
        empty: 'Select a prize to edit its configuration.',
        save: 'Save Changes',
        cancel: 'Cancel',
      },
      form: {
        name: 'Name',
        stock: 'Stock',
        weight: 'Weight',
        poolThreshold: 'Pool Threshold',
        userPoolThreshold: 'User Pool Threshold',
        rewardAmount: 'Reward Amount',
        payoutBudget: 'Payout Budget',
        payoutPeriodDays: 'Payout Period (Days)',
        isActive: 'Active',
      },
      table: {
        title: 'Prize Pool',
        description: 'Active prizes and stock levels.',
        headers: {
          name: 'Name',
          stock: 'Stock',
          weight: 'Weight',
          threshold: 'Threshold',
          userThreshold: 'User Threshold',
          reward: 'Reward',
          budget: 'Budget',
          period: 'Period',
          status: 'Status',
          actions: 'Actions',
        },
        statusActive: 'Active',
        statusInactive: 'Inactive',
        actionEdit: 'Edit',
        actionToggle: 'Toggle',
        actionDelete: 'Delete',
        empty: 'No prizes yet.',
      },
      topSpenders: {
        title: 'Top Spenders',
        userId: 'User ID',
        spend: 'Spend',
      },
      confirmDelete: 'Soft delete this prize?',
    },
    finance: {
      title: 'Finance Operations',
      description: 'Approve deposits and manage withdrawals.',
      deposits: {
        title: 'Deposits',
        description: 'Pending and completed top-ups.',
        headers: {
          id: 'ID',
          userId: 'User ID',
          amount: 'Amount',
          status: 'Status',
          createdAt: 'Created',
          actions: 'Actions',
        },
        statusPending: 'Pending',
        statusSuccess: 'Success',
        statusFailed: 'Failed',
        actionApprove: 'Approve',
        actionFail: 'Fail',
        empty: 'No deposits found.',
      },
      withdrawals: {
        title: 'Withdrawals',
        description: 'Review and settle withdrawal requests.',
        headers: {
          id: 'ID',
          userId: 'User ID',
          amount: 'Amount',
          status: 'Status',
          bankCardId: 'Bank Card',
          createdAt: 'Created',
          actions: 'Actions',
        },
        statusPending: 'Pending',
        statusApproved: 'Approved',
        statusRejected: 'Rejected',
        statusPaid: 'Paid',
        actionApprove: 'Approve',
        actionReject: 'Reject',
        actionPay: 'Pay',
        empty: 'No withdrawals found.',
      },
    },
    security: {
      title: 'Security Monitor',
      description: 'Recent authentication failures and security events.',
      filters: {
        title: 'Filters',
        description: 'Filter by email, event type, or time range.',
        email: 'Email',
        eventType: 'Event Type',
        from: 'From',
        to: 'To',
        limit: 'Limit',
        sort: 'Sort',
        sortNewest: 'Newest first',
        sortOldest: 'Oldest first',
        apply: 'Apply',
        export: 'Export CSV',
      },
      authEvents: {
        title: 'Auth Events',
        description: 'Login failures, blocks, and related audit records.',
        headers: {
          id: 'ID',
          email: 'Email',
          userId: 'User ID',
          eventType: 'Event',
          ip: 'IP',
          userAgent: 'User Agent',
          createdAt: 'Created',
        },
        empty: 'No auth events found.',
      },
      freeze: {
        title: 'Frozen Accounts',
        description: 'Accounts locked by the risk engine.',
        createTitle: 'Freeze Account',
        createDescription: 'Manually freeze a user account if needed.',
        userId: 'User ID',
        reason: 'Reason',
        reasonPlaceholder: 'Optional reason',
        freeze: 'Freeze',
        limit: 'Limit',
        sort: 'Sort',
        sortNewest: 'Newest first',
        sortOldest: 'Oldest first',
        headers: {
          id: 'ID',
          userId: 'User ID',
          reason: 'Reason',
          status: 'Status',
          createdAt: 'Created',
          actions: 'Actions',
        },
        release: 'Release',
        empty: 'No frozen accounts.',
      },
      adminActions: {
        title: 'Admin Actions',
        description: 'Recent administrative operations.',
        export: 'Export CSV',
        filters: {
          adminId: 'Admin ID',
          action: 'Action',
          from: 'From',
          to: 'To',
          limit: 'Limit',
          sort: 'Sort',
          sortNewest: 'Newest first',
          sortOldest: 'Oldest first',
          apply: 'Apply',
        },
        headers: {
          id: 'ID',
          adminId: 'Admin ID',
          action: 'Action',
          targetType: 'Target Type',
          targetId: 'Target ID',
          ip: 'IP',
          createdAt: 'Created',
        },
        empty: 'No admin actions found.',
      },
    },
  },
  'zh-CN': {
    common: {
      appName: '奖池管理后台',
      signIn: '登录',
      signOut: '退出登录',
      email: '邮箱',
      password: '密码',
      adminLabel: '管理员',
      navAdmin: '控制台',
      navFinance: '财务',
      navSecurity: '安全',
      prev: '上一页',
      next: '下一页',
    },
    login: {
      title: '管理员登录',
      eyebrow: '管理入口',
      heading: '登录以管理奖池',
      description: '使用管理员账号访问分析与奖品配置。',
      emailPlaceholder: 'admin@reward.dev',
      submit: '登录',
    },
    admin: {
      eyebrow: '管理控制台',
      heading: '奖池控制中心',
      description: '配置奖品、调整权重，并监控抽奖表现。',
      config: {
        title: '系统控制',
        description: '调整奖池余额、抽奖成本与随机化参数。',
        poolBalance: '奖池余额',
        drawCost: '抽奖成本',
        weightJitterEnabled: '启用权重扰动',
        weightJitterPct: '权重扰动比例',
        bonusAutoReleaseEnabled: '自动释放奖励',
        bonusUnlockWagerRatio: '奖励解锁流水比例',
        authFailureWindowMinutes: '失败统计窗口（分钟）',
        authFailureFreezeThreshold: '用户冻结阈值',
        adminFailureFreezeThreshold: '管理员冻结阈值',
        submit: '更新设置',
      },
      bonus: {
        title: '奖励释放',
        description: '当自动释放关闭时，可手动释放奖励余额。',
        userId: '用户 ID',
        amount: '释放金额',
        amountPlaceholder: '留空则全部释放',
        release: '释放奖励',
        autoReleaseHint: '自动释放已开启，请关闭后再手动释放。',
      },
      metrics: {
        totalDraws: '抽奖总数',
        winRate: '中奖率',
        poolBalance: '奖池余额',
      },
      create: {
        title: '创建奖品',
        description: '设置库存、权重和奖励金额。',
        submit: '创建奖品',
      },
      edit: {
        title: '编辑奖品',
        description: '从表格中选择奖品进行编辑。',
        empty: '请选择一个奖品以编辑其配置。',
        save: '保存修改',
        cancel: '取消',
      },
      form: {
        name: '名称',
        stock: '库存',
        weight: '权重',
        poolThreshold: '奖池阈值',
        userPoolThreshold: '用户池阈值',
        rewardAmount: '奖励金额',
        payoutBudget: '派奖预算',
        payoutPeriodDays: '预算周期（天）',
        isActive: '启用',
      },
      table: {
        title: '奖池列表',
        description: '当前启用的奖品与库存。',
        headers: {
          name: '名称',
          stock: '库存',
          weight: '权重',
          threshold: '阈值',
          userThreshold: '用户阈值',
          reward: '奖励',
          budget: '预算',
          period: '周期',
          status: '状态',
          actions: '操作',
        },
        statusActive: '启用',
        statusInactive: '停用',
        actionEdit: '编辑',
        actionToggle: '切换',
        actionDelete: '删除',
        empty: '暂无奖品。',
      },
      topSpenders: {
        title: '消费排行',
        userId: '用户 ID',
        spend: '消费金额',
      },
      confirmDelete: '确定要软删除该奖品吗？',
    },
    finance: {
      title: '财务操作',
      description: '审批充值与处理提现请求。',
      deposits: {
        title: '充值记录',
        description: '待处理与已完成的充值。',
        headers: {
          id: '编号',
          userId: '用户 ID',
          amount: '金额',
          status: '状态',
          createdAt: '创建时间',
          actions: '操作',
        },
        statusPending: '待处理',
        statusSuccess: '成功',
        statusFailed: '失败',
        actionApprove: '通过',
        actionFail: '失败',
        empty: '暂无充值记录。',
      },
      withdrawals: {
        title: '提现记录',
        description: '审核并结算提现请求。',
        headers: {
          id: '编号',
          userId: '用户 ID',
          amount: '金额',
          status: '状态',
          bankCardId: '银行卡',
          createdAt: '创建时间',
          actions: '操作',
        },
        statusPending: '待处理',
        statusApproved: '已通过',
        statusRejected: '已拒绝',
        statusPaid: '已打款',
        actionApprove: '通过',
        actionReject: '拒绝',
        actionPay: '打款',
        empty: '暂无提现记录。',
      },
    },
    security: {
      title: '安全监控',
      description: '最近的登录失败与安全事件。',
      filters: {
        title: '筛选',
        description: '按邮箱、事件类型或时间范围筛选。',
        email: '邮箱',
        eventType: '事件类型',
        from: '开始时间',
        to: '结束时间',
        limit: '数量',
        sort: '排序',
        sortNewest: '最新优先',
        sortOldest: '最早优先',
        apply: '筛选',
        export: '导出 CSV',
      },
      authEvents: {
        title: '登录事件',
        description: '登录失败、拦截等审计记录。',
        headers: {
          id: '编号',
          email: '邮箱',
          userId: '用户 ID',
          eventType: '事件类型',
          ip: 'IP',
          userAgent: 'User Agent',
          createdAt: '创建时间',
        },
        empty: '暂无登录事件。',
      },
      freeze: {
        title: '冻结账号',
        description: '由风控引擎锁定的账户。',
        createTitle: '手动冻结',
        createDescription: '需要时手动冻结用户账号。',
        userId: '用户 ID',
        reason: '原因',
        reasonPlaceholder: '可选原因',
        freeze: '冻结',
        limit: '数量',
        sort: '排序',
        sortNewest: '最新优先',
        sortOldest: '最早优先',
        headers: {
          id: '编号',
          userId: '用户 ID',
          reason: '原因',
          status: '状态',
          createdAt: '创建时间',
          actions: '操作',
        },
        release: '解冻',
        empty: '暂无冻结账号。',
      },
      adminActions: {
        title: '管理员操作',
        description: '最近的后台操作记录。',
        export: '导出 CSV',
        filters: {
          adminId: '管理员 ID',
          action: '动作',
          from: '开始时间',
          to: '结束时间',
          limit: '数量',
          sort: '排序',
          sortNewest: '最新优先',
          sortOldest: '最早优先',
          apply: '筛选',
        },
        headers: {
          id: '编号',
          adminId: '管理员 ID',
          action: '动作',
          targetType: '目标类型',
          targetId: '目标 ID',
          ip: 'IP',
          createdAt: '创建时间',
        },
        empty: '暂无管理员操作记录。',
      },
    },
  },
};

const normalizeLocale = (value?: string | null): Locale => {
  if (!value) return DEFAULT_LOCALE;
  const lowered = value.toLowerCase();
  if (lowered.startsWith('zh')) return 'zh-CN';
  if (lowered.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
};

export const getMessages = (locale: Locale) =>
  translations[locale] ?? translations[DEFAULT_LOCALE];

export const resolveLocaleFromRequest = (event: RequestEvent): Locale => {
  const cookieLocale = event.cookies.get(LOCALE_COOKIE);
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  const acceptLanguage = event.request.headers.get('accept-language');
  if (acceptLanguage) {
    const first = acceptLanguage.split(',')[0]?.trim();
    return normalizeLocale(first);
  }

  return DEFAULT_LOCALE;
};

export const createTranslator = (messages: Messages) => {
  return (path: string) => {
    const value = path
      .split('.')
      .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], messages);

    return typeof value === 'string' ? value : path;
  };
};
