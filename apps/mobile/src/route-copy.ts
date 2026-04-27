import type { MobileFairnessLocale } from './fairness';

export type MobileRouteKey =
  | 'home'
  | 'account'
  | 'wallet'
  | 'rewards'
  | 'security'
  | 'gacha'
  | 'quickEight'
  | 'blackjack'
  | 'fairness';

export type HomeMenuRouteKey = Exclude<MobileRouteKey, 'home'>;

type RouteCardKey = HomeMenuRouteKey;
type RouteHeroKey = HomeMenuRouteKey;
type RouteScreenKey = 'gacha' | 'quickEight' | 'blackjack';

export const homeMenuRouteOrder = [
  'account',
  'wallet',
  'rewards',
  'security',
  'gacha',
  'quickEight',
  'blackjack',
  'fairness',
] as const satisfies readonly HomeMenuRouteKey[];

const routeCopy = {
  en: {
    labels: {
      home: 'Home',
      account: 'Account',
      wallet: 'Wallet',
      rewards: 'Rewards',
      security: 'Security',
      gacha: 'Slot',
      quickEight: 'Quick Eight',
      blackjack: 'Blackjack',
      fairness: 'Fairness',
    } satisfies Record<MobileRouteKey, string>,
    homeSectionTitle: 'Route menu',
    homeSectionSubtitle:
      'Home is now a menu list. Account, wallet, rewards, security, and each game open on their own dedicated screens.',
    currentRouteTitle: (label: string) => `Route: ${label}`,
    currentRouteSubtitle:
      'This route owns its own workflow instead of rendering back into the home dashboard.',
    currentRouteHint:
      'Home is only a launcher now. Account, wallet, rewards, security, and every game stay on their own screens.',
    cards: {
      account: {
        title: 'Account',
        body:
          'Email status, current device session, balance refresh, and sign-out controls live on a dedicated account page.',
        open: 'Open account',
      },
      wallet: {
        title: 'Wallet',
        body:
          'Keep the current balance on a dedicated wallet page instead of mixing it into the route launcher.',
        open: 'Open wallet',
      },
      rewards: {
        title: 'Rewards',
        body:
          'Daily missions, bonus balance, and claim actions now sit on their own rewards page.',
        open: 'Open rewards',
      },
      security: {
        title: 'Security',
        body:
          'Password reset, active session review, and device revocation are split into a dedicated security page.',
        open: 'Open security',
      },
      gacha: {
        title: 'Slot machine',
        body:
          'Three-reel presentation, pity progress, and committed draw settlement now live on a standalone route.',
        open: 'Open slot machine',
      },
      quickEight: {
        title: 'Quick Eight',
        body:
          'Pick 8 numbers, confirm the stake, and watch the draw reveal in sequence on its own screen.',
        open: 'Open Quick Eight',
      },
      blackjack: {
        title: 'Blackjack',
        body:
          'Player-vs-dealer blackjack with hit, stand, double, split, and shared fairness controls.',
        open: 'Open Blackjack',
      },
      fairness: {
        title: 'Fairness verifier',
        body:
          'Reveal a closed epoch and prove locally that SHA-256(seed) matches the published commit hash.',
        open: 'Open fairness verifier',
      },
    } satisfies Record<RouteCardKey, { title: string; body: string; open: string }>,
    heroes: {
      account: {
        kicker: 'Account',
        title: 'Dedicated account route for session and identity controls.',
        subtitle:
          'Mobile keeps account status, session refresh, and sign-out actions on their own screen instead of in the route launcher.',
      },
      wallet: {
        kicker: 'Wallet',
        title: 'Dedicated wallet route for balance visibility.',
        subtitle:
          'Mobile gives the wallet its own screen so balance review stays separate from navigation and gameplay.',
      },
      rewards: {
        kicker: 'Rewards',
        title: 'Dedicated rewards route for missions and bonus balance.',
        subtitle:
          'Mobile keeps check-ins, mission progress, and reward claims on a standalone rewards screen.',
      },
      security: {
        kicker: 'Security',
        title: 'Dedicated security route for device and password controls.',
        subtitle:
          'Mobile keeps active-session review, password reset, and revoke flows on a dedicated security screen.',
      },
      gacha: {
        kicker: 'Slot',
        title: 'Dedicated slot route for the draw engine.',
        subtitle:
          'Mobile keeps the three-reel presentation and committed draw settlement on a standalone screen aligned with the web slot route.',
      },
      quickEight: {
        kicker: 'Quick Eight',
        title: 'Dedicated route for number-pick play.',
        subtitle:
          'Mobile keeps Quick Eight off the dashboard and runs the same `/quick-eight` flow as web on its own screen.',
      },
      blackjack: {
        kicker: 'Blackjack',
        title: 'Dedicated route for player-vs-dealer hands.',
        subtitle:
          'Mobile runs blackjack on its own route, using the same backend fairness, wallet settlement, and split flow as web.',
      },
      fairness: {
        kicker: 'Fairness',
        title: 'Dedicated route for commit-reveal verification.',
        subtitle:
          'Mobile keeps fairness validation off the home dashboard and lets you reveal a closed epoch on its own screen.',
      },
    } satisfies Record<RouteHeroKey, { kicker: string; title: string; subtitle: string }>,
    screens: {
      gacha: {
        routeTitle: 'Slot machine route',
        routeSubtitle:
          'Dedicated mobile screen for the draw flow, aligned with the web slot-machine route.',
        summaryBalance: 'Balance',
        summarySecondary: 'Live pool',
        summarySecondaryLoading: 'Loading',
        summarySecondaryValue: (featuredCount: number) => `${featuredCount} featured`,
        sectionTitle: 'Slot machine',
        sectionSubtitle:
          'Uses the same `/draw/overview`, `/draw`, and `/draw/play` flow as the web slot route.',
        metaCostPerPull: 'Cost per pull',
        metaPity: 'Pity',
        metaFairness: 'Fairness',
        pityBoostActive: 'Boost active',
        pityDisabled: 'Disabled',
        pityPullsToBoost: (draws: number) => `${draws} spins to boost`,
        slotRevealTitle: 'Slot reveal',
        slotToneSpinningBatch: (count: number) => `Spinning ${count} times...`,
        slotToneSpinningSingle: 'Spinning the reels...',
        slotToneWin: 'Winning line locked.',
        slotToneBlocked: 'Result blocked by inventory or payout control.',
        slotToneSettled: 'Finale settled. Review the spin summary below.',
        slotToneReady: 'Ready for the first spin.',
        slotHintAnimating: 'The mobile reel locks left to right, matching the web rhythm.',
        slotHintSettled:
          'Center line settles on the highlighted outcome after the spin finishes.',
        pullOnce: 'Spin once',
        pullMany: (count: number) => `Spin ${count}`,
        pulling: 'Spinning...',
        refreshBanner: 'Refresh slot board',
        disabledBySystem: 'Draws are currently disabled by system config.',
        multiLocked: (max: number) =>
          `Multi-spin is locked because \`draw_system.max_draw_per_request\` is currently ${max}.`,
        loadingBanner: 'Loading the live slot machine...',
        loadingPlay: (count: number) =>
          count > 1
            ? `Calling POST /draw/play (${count})...`
            : 'Calling POST /draw...',
        noActivePrizes: 'No active prizes are configured yet.',
        latestSinglePull: 'Latest single spin',
        latestBatchPull: (count: number) => `Latest ${count}-spin`,
        highlight: 'Highlight',
        noFeaturedReward: 'No featured reward',
        noPullYet: 'No spin yet. Use the controls above to reveal the first result.',
      },
      quickEight: {
        routeTitle: 'Quick Eight route',
        routeSubtitle: 'Dedicated mobile screen for number-pick gameplay.',
        summaryBalance: 'Balance',
        summarySelection: 'Selection',
        routeHint: (pickCount: number, boardSize: number, drawCount: number) =>
          `Pick exactly ${pickCount} numbers from 1 to ${boardSize}. The backend draws ${drawCount} numbers and settles immediately.`,
        sectionTitle: 'Quick Eight',
        sectionSubtitle: 'Same `/quick-eight` endpoint and payout table as the web app.',
        selectionTitle: 'Your numbers',
        selectionLocked: 'Selection locked',
        selectionLeft: (remaining: number) => `${remaining} left`,
        noSelection: 'No numbers selected yet.',
        clear: 'Clear',
        stakeAmount: 'Stake amount',
        stakeRange: (min: string, max: string) => `Min ${min} / Max ${max}`,
        play: 'Play Quick Eight',
        drawing: 'Drawing...',
        loadingRequest: 'Calling POST /quick-eight...',
        latestRound: 'Latest round',
        payout: 'Payout',
        drawnNumbers: (visible: number, total: number) => `Drawn numbers ${visible}/${total}`,
        matchedNumbers: 'Matched numbers',
        noMatches: 'No matches this round.',
        noRoundYet: 'No round yet. Pick numbers, set a stake, and start the draw.',
      },
      blackjack: {
        routeTitle: 'Blackjack route',
        routeSubtitle:
          'Blackjack with split support on the same wallet, fairness, and prize-pool backend.',
        summaryBalance: 'Balance',
        summaryFairnessEpoch: 'Fairness epoch',
        summaryLoading: 'Loading',
        sectionTitle: 'Blackjack',
        sectionSubtitle:
          'Same `GET /blackjack`, `POST /blackjack/start`, and `POST /blackjack/:id/action` endpoints as web.',
        metaStakeRange: 'Stake range',
        metaNaturalPayout: 'Natural payout',
        metaDealer: 'Dealer',
        metaDouble: 'Double',
        metaSplitAces: 'Split aces',
        metaHitSplitAces: 'Hit split aces',
        metaResplit: 'Re-split',
        metaMaxSplitHands: 'Max split hands',
        metaTenValueSplit: '10-value split',
        dealerHitsSoft17: 'Hit soft 17',
        dealerStandAll17: 'Stand on all 17s',
        doubleEnabled: 'Enabled',
        doubleDisabled: 'Disabled',
        stakeAmount: 'Stake amount',
        stakeHint: (min: string, max: string) =>
          `Enter a stake between ${min} and ${max}, then open one active hand at a time.`,
        startHand: 'Start hand',
        dealing: 'Dealing...',
        refreshHand: 'Refresh hand',
        refreshingHand: 'Refreshing...',
        noActiveHand: 'No active hand. The next start request will deal a fresh round.',
        dealerHand: 'Dealer',
        playerHand: 'Player',
        visible: 'Visible',
        total: 'Total',
        settling: 'Settling...',
        hit: 'Hit',
        stand: 'Stand',
        double: 'Double',
        split: 'Split',
        hand: 'Hand',
        currentBet: 'Bet',
        activeHand: 'Active',
        waitingHand: 'Waiting',
        stoodHand: 'Standing',
        bustHand: 'Bust',
        winHand: 'Win',
        loseHand: 'Lose',
        pushHand: 'Push',
        recentHands: 'Recent hands',
        noRecentHands: 'No completed blackjack hands yet.',
        loadingState: 'Refreshing blackjack state...',
      },
    } satisfies Record<RouteScreenKey, Record<string, unknown>>,
  },
  'zh-CN': {
    labels: {
      home: '首页',
      account: '账户',
      wallet: '钱包',
      rewards: '奖励',
      security: '安全',
      gacha: '老虎机',
      quickEight: '快八',
      blackjack: '二十一点',
      fairness: '公平性',
    } satisfies Record<MobileRouteKey, string>,
    homeSectionTitle: '页面入口',
    homeSectionSubtitle:
      '首页现在只做菜单列表，账户、钱包、奖励、安全和各个玩法都会跳到各自独立页面。',
    currentRouteTitle: (label: string) => `当前路由：${label}`,
    currentRouteSubtitle: '当前能力在自己的独立页面里运行，不再塞回首页仪表盘。',
    currentRouteHint:
      '首页现在只是入口页，账户、钱包、奖励、安全，以及各个玩法都走各自页面。',
    cards: {
      account: {
        title: '账户',
        body:
          '邮箱状态、当前设备会话、余额刷新和退出登录动作都放到独立账户页。',
        open: '打开账户页',
      },
      wallet: {
        title: '钱包',
        body:
          '当前余额单独放到钱包页里，不再和首页入口混在一起。',
        open: '打开钱包页',
      },
      rewards: {
        title: '奖励',
        body:
          '每日任务、奖励余额和领奖动作都拆到独立奖励页。',
        open: '打开奖励页',
      },
      security: {
        title: '安全',
        body:
          '重置密码、查看活跃会话和撤销设备会话都拆到独立安全页。',
        open: '打开安全页',
      },
      gacha: {
        title: '老虎机',
        body:
          '三轴演出、保底进度和真实抽奖结算都拆到独立路由里，不再放在首页。',
        open: '打开老虎机页面',
      },
      quickEight: {
        title: '快八',
        body:
          '选号、下注和逐步揭晓开奖号码全部放到独立页面中完成。',
        open: '打开快八页',
      },
      blackjack: {
        title: '二十一点',
        body:
          '支持分牌的经典庄闲二十一点，与共享 fairness 控制、钱包结算一起放到独立页面。',
        open: '打开二十一点页',
      },
      fairness: {
        title: '公平性验证器',
        body:
          'Reveal 已结束的 epoch，并在本地证明 `SHA-256(seed)` 与已公布的 commit 哈希一致。',
        open: '打开公平性验证页',
      },
    } satisfies Record<RouteCardKey, { title: string; body: string; open: string }>,
    heroes: {
      account: {
        kicker: '账户',
        title: '会话与身份操作的独立账户路由。',
        subtitle:
          '移动端把账户状态、会话刷新和退出登录动作拆到独立页面，不再放在入口页里。',
      },
      wallet: {
        kicker: '钱包',
        title: '余额查看的独立钱包路由。',
        subtitle:
          '移动端给钱包单独一页，让余额查看和导航入口、玩法页面彻底分开。',
      },
      rewards: {
        kicker: '奖励',
        title: '任务与奖励余额的独立奖励路由。',
        subtitle:
          '移动端把签到、任务进度和领奖动作集中到单独奖励页中。',
      },
      security: {
        kicker: '安全',
        title: '设备与密码操作的独立安全路由。',
        subtitle:
          '移动端把活跃会话审查、密码重置和会话撤销都放到专门的安全页里。',
      },
      gacha: {
        kicker: '老虎机',
        title: '抽奖引擎的独立老虎机路由。',
        subtitle:
          '移动端把三轴停轴演出和真实抽奖结算拆到单独页面里，与 Web 的 slot 路由保持一致。',
      },
      quickEight: {
        kicker: '快八',
        title: '独立的选号玩法路由。',
        subtitle:
          '移动端把快八从首页拆开，独立跑同一套 `/quick-eight` 流程和即时结算。',
      },
      blackjack: {
        kicker: '二十一点',
        title: '独立的庄闲牌局路由。',
        subtitle:
          '移动端把二十一点单独放到一个页面里，继续复用与 Web 相同的 fairness、钱包结算和分牌流程。',
      },
      fairness: {
        kicker: '公平性',
        title: '独立的 commit-reveal 验证路由。',
        subtitle:
          '移动端把公平性验证从首页拆开，单独放到一个页面里，专门用来 reveal 已结束的 epoch 并做本地校验。',
      },
    } satisfies Record<RouteHeroKey, { kicker: string; title: string; subtitle: string }>,
    screens: {
      gacha: {
        routeTitle: '老虎机路由',
        routeSubtitle: '抽奖流程拆成独立移动端页面，并和 Web 的老虎机路由保持对齐。',
        summaryBalance: '余额',
        summarySecondary: '当前奖池',
        summarySecondaryLoading: '加载中',
        summarySecondaryValue: (featuredCount: number) => `${featuredCount} 个主推奖项`,
        sectionTitle: '老虎机',
        sectionSubtitle:
          '直接复用 Web 同一套 `/draw/overview`、`/draw` 与 `/draw/play` 流程。',
        metaCostPerPull: '单抽消耗',
        metaPity: '保底',
        metaFairness: '公平性',
        pityBoostActive: '概率加成中',
        pityDisabled: '未启用',
        pityPullsToBoost: (draws: number) => `还差 ${draws} 抽触发加成`,
        slotRevealTitle: '停轴揭晓',
        slotToneSpinningBatch: (count: number) => `正在旋转 ${count} 次...`,
        slotToneSpinningSingle: '转轴旋转中...',
        slotToneWin: '中奖线已锁定。',
        slotToneBlocked: '结果被库存或赔付控制拦截。',
        slotToneSettled: '本轮已结算，可查看下方旋转结果摘要。',
        slotToneReady: '准备好开始第一次旋转。',
        slotHintAnimating: '移动端沿用 Web 一样的从左到右锁轴节奏。',
        slotHintSettled: '转轴结束后，中线会停在本轮高亮结果上。',
        pullOnce: '旋转一次',
        pullMany: (count: number) => `旋转 ${count} 次`,
        pulling: '旋转中...',
        refreshBanner: '刷新老虎机',
        disabledBySystem: '系统配置当前已关闭抽奖。',
        multiLocked: (max: number) =>
          `当前 \`draw_system.max_draw_per_request\` 为 ${max}，所以多次旋转仍被锁定。`,
        loadingBanner: '正在加载当前老虎机...',
        loadingPlay: (count: number) =>
          count > 1
            ? `正在调用 POST /draw/play（${count} 抽）...`
            : '正在调用 POST /draw...',
        noActivePrizes: '当前还没有配置主推奖项。',
        latestSinglePull: '最近一次旋转',
        latestBatchPull: (count: number) => `最近 ${count} 次旋转`,
        highlight: '高亮奖励',
        noFeaturedReward: '没有主推奖励',
        noPullYet: '还没有开始旋转，使用上方控件揭晓第一轮结果。',
      },
      quickEight: {
        routeTitle: '快八路由',
        routeSubtitle: '选号玩法拆成独立移动端页面。',
        summaryBalance: '余额',
        summarySelection: '选号进度',
        routeHint: (pickCount: number, boardSize: number, drawCount: number) =>
          `请从 1 到 ${boardSize} 中选满 ${pickCount} 个号码。后端会立即开出 ${drawCount} 个号码并结算。`,
        sectionTitle: '快八',
        sectionSubtitle: '直接复用 Web 同一套 `/quick-eight` 接口与赔率表。',
        selectionTitle: '你的号码',
        selectionLocked: '号码已选满',
        selectionLeft: (remaining: number) => `还差 ${remaining} 个`,
        noSelection: '还没有选择任何号码。',
        clear: '清空',
        stakeAmount: '下注金额',
        stakeRange: (min: string, max: string) => `最小 ${min} / 最大 ${max}`,
        play: '开始快八',
        drawing: '开奖中...',
        loadingRequest: '正在调用 POST /quick-eight...',
        latestRound: '最近一期',
        payout: '派奖',
        drawnNumbers: (visible: number, total: number) => `开奖号码 ${visible}/${total}`,
        matchedNumbers: '命中号码',
        noMatches: '本轮没有命中号码。',
        noRoundYet: '当前还没有开奖记录。先选号码、设金额，再开始开奖。',
      },
      blackjack: {
        routeTitle: '二十一点路由',
        routeSubtitle: '支持分牌的庄闲牌局运行在共享钱包、公平性和奖池后端之上。',
        summaryBalance: '余额',
        summaryFairnessEpoch: '公平性 Epoch',
        summaryLoading: '加载中',
        sectionTitle: '二十一点',
        sectionSubtitle:
          '直接复用 Web 同一套 `GET /blackjack`、`POST /blackjack/start` 与 `POST /blackjack/:id/action` 接口。',
        metaStakeRange: '下注范围',
        metaNaturalPayout: '天生二十一点赔付',
        metaDealer: '庄家规则',
        metaDouble: '加倍',
        metaSplitAces: '拆 A',
        metaHitSplitAces: '拆 A 后要牌',
        metaResplit: '重复分牌',
        metaMaxSplitHands: '最大分牌手数',
        metaTenValueSplit: '10-value 等价分牌',
        dealerHitsSoft17: '软 17 要牌',
        dealerStandAll17: '所有 17 点停牌',
        doubleEnabled: '已启用',
        doubleDisabled: '未启用',
        stakeAmount: '下注金额',
        stakeHint: (min: string, max: string) =>
          `请输入 ${min} 到 ${max} 之间的下注金额，然后每次只开一手牌。`,
        startHand: '开始发牌',
        dealing: '发牌中...',
        refreshHand: '刷新牌局',
        refreshingHand: '刷新中...',
        noActiveHand: '当前没有进行中的牌局，下一次开始会发出新的一手牌。',
        dealerHand: '庄家',
        playerHand: '玩家',
        visible: '可见点数',
        total: '总点数',
        settling: '结算中...',
        hit: '要牌',
        stand: '停牌',
        double: '加倍',
        split: '分牌',
        hand: '手牌',
        currentBet: '当前下注',
        activeHand: '当前手',
        waitingHand: '待处理',
        stoodHand: '已停牌',
        bustHand: '爆牌',
        winHand: '获胜',
        loseHand: '输牌',
        pushHand: '平局',
        recentHands: '最近牌局',
        noRecentHands: '当前还没有已结算的二十一点牌局。',
        loadingState: '正在刷新二十一点状态...',
      },
    } satisfies Record<RouteScreenKey, Record<string, unknown>>,
  },
} as const;

export type MobileRouteCopy = (typeof routeCopy)[keyof typeof routeCopy];
export type MobileRouteLabels = MobileRouteCopy['labels'];
export type MobileRouteCards = MobileRouteCopy['cards'];
export type MobileRouteHeroes = MobileRouteCopy['heroes'];
export type MobileRouteScreens = MobileRouteCopy['screens'];

export function getMobileRouteCopy(locale: MobileFairnessLocale) {
  return routeCopy[locale];
}
