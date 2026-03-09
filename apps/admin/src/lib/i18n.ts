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
      rewardAmount: string;
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
        reward: string;
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
};

export const LOCALE_COOKIE = 'reward_locale';
export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: Locale[] = ['en', 'zh-CN'];

const translations: Record<Locale, Messages> = {
  en: {
    common: {
      appName: 'Prize Pool CMS',
      signIn: 'Sign In',
      signOut: 'Sign Out',
      email: 'Email',
      password: 'Password',
      adminLabel: 'Admin',
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
        rewardAmount: 'Reward Amount',
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
          reward: 'Reward',
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
  },
  'zh-CN': {
    common: {
      appName: '奖池 CMS',
      signIn: '登录',
      signOut: '退出登录',
      email: '邮箱',
      password: '密码',
      adminLabel: '管理员',
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
        rewardAmount: '奖励金额',
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
          reward: '奖励',
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
