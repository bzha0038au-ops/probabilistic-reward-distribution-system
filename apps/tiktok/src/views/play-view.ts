import type { Card, LiveDataState, PlayStage, PlayState, ScratchSlot, Suit } from "../app-types";
import {
  BUST_COPY,
  CASH_OUT_LINE,
  INTRO_COPY,
  JACKPOT_COPY,
  REX_ENDING,
  WALK_AWAY_COPY,
} from "../game-content";
import {
  escapeHtml,
  formatApiMoney,
  formatDurationMinutes,
  formatMoney,
  getBlackjackTotal,
  truncateMiddle,
} from "../game-utils";
import { iconPalm, iconPlay, iconRefresh, iconTap } from "./icons";

export function renderPlayView(play: PlayState, live: LiveDataState): string {
  switch (play.stage) {
    case "intro":
      return `
        <div class="view intro-view">
          <div class="portrait portrait--yoyo">
            <div class="portrait__glow"></div>
            <div class="portrait__animal">🐷</div>
          </div>
          <article class="quote-card">
            <p class="quote-card__top">${INTRO_COPY.topLine.replace("$20", `<span class="money-accent">$20</span>`)}</p>
            <p class="quote-card__kicker">${INTRO_COPY.kicker}</p>
            <p class="quote-card__line">${INTRO_COPY.quote}</p>
          </article>
          ${renderLiveEngineCard(live)}
          <button class="main-cta" data-action="start-run">
            <span class="main-cta__icon">${iconPlay()}</span>
            <span>PLAY</span>
          </button>
        </div>
      `;

    case "ticket":
    case "decision":
    case "ticket-final":
      return `
        <div class="view ticket-view">
          <div class="total-pill">
            <span>Current Total:</span>
            <strong>${formatMoney(play.scratchTotal)}</strong>
          </div>
          <article class="ticket-card">
            <div class="ticket-card__layout">
              <div class="ticket-face">
                <div class="ticket-card__eyebrow">Last Chance Issue 03</div>
                <div class="ticket-card__title">FATE TICKET</div>
                <div class="ticket-scene">
                  <div class="ticket-scene__sun"></div>
                  <div class="ticket-scene__hill ticket-scene__hill--back"></div>
                  <div class="ticket-scene__hill ticket-scene__hill--front"></div>
                  <div class="ticket-scene__cloud ticket-scene__cloud--one"></div>
                  <div class="ticket-scene__cloud ticket-scene__cloud--two"></div>
                  <span class="ticket-scene__badge">${renderTicketSceneBadge(play)}</span>
                </div>
                <div class="ticket-grid-wrap">
                  <div class="ticket-grid">
                    ${play.slots.map((slot) => renderScratchSlot(slot, play.stage)).join("")}
                  </div>
                  ${renderScratchBoard(play)}
                </div>
                <p class="ticket-card__footer">${renderScratchFooter(play)}</p>
              </div>
              <aside class="ticket-odds">
                <div class="ticket-odds__title">Prize Odds</div>
                <p class="ticket-odds__subtitle">Scratch 2 wins, then decide whether to chase the last panel.</p>
                <div class="ticket-odds__list">
                  ${renderTicketOdds()}
                </div>
                <div class="ticket-odds__note">${renderTicketOddsNote(play)}</div>
              </aside>
            </div>
          </article>
          ${
            play.stage === "decision"
              ? `
                <div class="cta-stack">
                  <button class="main-cta main-cta--continue" data-action="continue-ticket">
                    <span>CONTINUE</span>
                    <small>${play.continueLine}</small>
                  </button>
                  <button class="secondary-cta" data-action="cash-out">
                    <span>CASH OUT</span>
                    <small>${CASH_OUT_LINE}</small>
                  </button>
                </div>
              `
              : `
                <div class="helper-card">
                  <p>${
                    play.stage === "ticket-final"
                      ? "Scratch the last panel. This is the one people remember for the rest of their lives."
                      : "Scratch across all three windows. The whole strip has to come through before you can choose."
                  }</p>
                </div>
              `
          }
          ${renderLiveEngineCard(live)}
        </div>
      `;

    case "bust":
      return `
        <div class="view result-view result-view--bust">
          <div class="result-title">${BUST_COPY.title}</div>
          <article class="result-card">
            <p>${BUST_COPY.body}</p>
          </article>
          <button class="main-cta" data-action="play-again">
            <span class="main-cta__icon">${iconRefresh()}</span>
            <span>PLAY AGAIN</span>
          </button>
        </div>
      `;

    case "ticket-win":
      return `
        <div class="view result-view result-view--win">
          <div class="result-chip">FATE TURNED</div>
          <div class="result-total">${formatMoney(play.scratchTotal)}</div>
          <article class="result-card">
            <h2>${JACKPOT_COPY.title}</h2>
            <p>${JACKPOT_COPY.body}</p>
          </article>
          <div class="cta-stack">
            <button class="main-cta" data-action="face-rex">
              <span>FACE REX</span>
              <small>"If I can break one more man, I can breathe."</small>
            </button>
            <button class="secondary-cta" data-action="cash-out">
              <span>BANK IT</span>
              <small>${CASH_OUT_LINE}</small>
            </button>
          </div>
        </div>
      `;

    case "walk-away":
      return `
        <div class="view result-view result-view--leave">
          <div class="result-title">${WALK_AWAY_COPY.title}</div>
          <article class="result-card">
            <p>${WALK_AWAY_COPY.body}</p>
          </article>
          <div class="cta-stack">
            <button class="main-cta" data-action="play-again">
              <span class="main-cta__icon">${iconRefresh()}</span>
              <span>ANOTHER NIGHT</span>
            </button>
            <button class="secondary-cta" data-action="face-rex">
              <span>GO BACK INSIDE</span>
              <small>"Just one more table. One more chance."</small>
            </button>
          </div>
        </div>
      `;

    case "rex":
    case "rex-win":
      return `
        <div class="view rex-view">
          <div class="speech-bubble">${play.rexSpeech}</div>
          <div class="portrait portrait--rex portrait--small">
            <div class="portrait__glow"></div>
            <div class="portrait__animal">🐶</div>
          </div>
          <div class="label">REX</div>
          ${renderCardFan(play.rexCards, "opponent")}
          <div class="score-pill">Total: ${getBlackjackTotal(play.rexCards)}</div>

          <div class="bet-pill">${formatMoney(play.rexStake)} BET</div>

          <div class="label">YOYO</div>
          ${renderCardFan(play.yoyoCards, "player")}
          <div class="score-pill score-pill--soft">Total: ${getBlackjackTotal(play.yoyoCards)}</div>

          ${
            play.stage === "rex"
              ? `
                <div class="cta-row">
                  <button class="control-cta control-cta--ghost" data-action="rex-stand">
                    <span>${iconPalm()}</span>
                    <strong>STAND</strong>
                  </button>
                  <button class="control-cta" data-action="rex-hit">
                    <span>${iconTap()}</span>
                    <strong>HIT</strong>
                  </button>
                </div>
                <p class="table-caption">You are not hitting for yourself. You are waiting for him to ask for one card too many.</p>
              `
              : `
                <div class="result-card result-card--tight">
                  <h2>${REX_ENDING.title}</h2>
                  <p>${REX_ENDING.body}</p>
                </div>
                <button class="main-cta" data-action="play-again">
                  <span class="main-cta__icon">${iconRefresh()}</span>
                  <span>PLAY AGAIN</span>
                </button>
              `
          }
        </div>
      `;
  }
}

function renderLiveEngineCard(live: LiveDataState): string {
  if (!live.session) {
    return `
      <article class="live-engine-card">
        <div class="live-engine-card__eyebrow">Live Backend</div>
        <div class="live-engine-card__title">Shared Draw Engine</div>
        <p>${escapeHtml(live.authMessage)}</p>
        <p>${escapeHtml(live.dashboardMessage)}</p>
      </article>
    `;
  }

  const balance = live.wallet
    ? formatApiMoney(live.wallet.balance.totalBalance)
    : live.drawOverview
      ? formatApiMoney(live.drawOverview.balance)
      : "$0";
  const drawCost = live.drawOverview ? formatApiMoney(live.drawOverview.drawCost) : "Offline";
  const featuredPrize = live.drawOverview?.featuredPrizes[0] ?? null;
  const featuredPrizes = live.drawOverview?.featuredPrizes.slice(0, 3) ?? [];
  const pityProgress = live.drawOverview
    ? live.drawOverview.pity.threshold > 0
      ? Math.min(100, Math.round((live.drawOverview.pity.currentStreak / live.drawOverview.pity.threshold) * 100))
      : 0
    : 0;
  const pitySummary = live.drawOverview
    ? live.drawOverview.pity.active
      ? `Boost +${live.drawOverview.pity.maxBoostPct}%`
      : live.drawOverview.pity.drawsUntilBoost !== null
        ? `${live.drawOverview.pity.drawsUntilBoost} to boost`
        : `${live.drawOverview.pity.currentStreak}/${live.drawOverview.pity.threshold}`
    : "Offline";

  return `
    <article class="live-engine-card">
      <div class="live-engine-card__eyebrow">Live Backend</div>
      <div class="live-engine-card__title">Shared Draw Engine</div>
      <div class="live-stat-grid">
        <div class="live-stat">
          <span>Balance</span>
          <strong>${balance}</strong>
        </div>
        <div class="live-stat">
          <span>Draw Cost</span>
          <strong>${drawCost}</strong>
        </div>
        <div class="live-stat">
          <span>Pity</span>
          <strong>${escapeHtml(pitySummary)}</strong>
        </div>
        <div class="live-stat">
          <span>Pool</span>
          <strong>${live.drawOverview ? live.drawOverview.maxBatchCount : "?"} max</strong>
        </div>
      </div>
      <p>${escapeHtml(live.drawStatus === "error" ? live.drawMessage : live.dashboardMessage)}</p>
      <div class="button-row">
        <button class="secondary-cta secondary-cta--small" data-action="play-live-draw"${
          live.drawStatus === "loading" || !live.drawOverview ? " disabled" : ""
        }>Spin Live Draw</button>
        <button class="secondary-cta secondary-cta--small secondary-cta--ghost" data-action="refresh-live"${
          live.dashboardStatus === "loading" ? " disabled" : ""
        }>Sync</button>
      </div>
      ${
        live.drawOverview
          ? `
            <div class="live-engine-panel">
              <div class="live-engine-panel__title">Fairness Commit</div>
              <div class="detail-list">
                <div class="detail-row"><span>Commit</span><strong>${escapeHtml(truncateMiddle(live.drawOverview.fairness.commitHash))}</strong></div>
                <div class="detail-row"><span>Epoch</span><strong>${live.drawOverview.fairness.epoch}</strong></div>
                <div class="detail-row"><span>Reveal cadence</span><strong>${escapeHtml(formatDurationMinutes(live.drawOverview.fairness.epochSeconds))}</strong></div>
              </div>
            </div>
            <div class="live-engine-panel">
              <div class="live-engine-panel__title">Pity Track</div>
              <p class="live-engine-card__meta">${escapeHtml(pitySummary)}</p>
              <div class="pity-bar">
                <div class="pity-bar__fill" style="width:${pityProgress}%"></div>
              </div>
              <p class="live-engine-card__meta">${live.drawOverview.pity.currentStreak}/${live.drawOverview.pity.threshold} misses toward the next boost.</p>
            </div>
          `
          : ""
      }
      ${
        featuredPrizes.length
          ? `
            <div class="live-prize-grid">
              ${featuredPrizes
                .map(
                  (prize) => `
                    <div class="live-prize-card">
                      <span class="live-prize-card__rarity">${escapeHtml(prize.displayRarity)}</span>
                      <strong>${escapeHtml(prize.name)}</strong>
                      <span>${formatApiMoney(prize.rewardAmount)}</span>
                      <small>${escapeHtml(prize.stockState)} · ${prize.stock} left</small>
                    </div>
                  `,
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        live.lastDraw
          ? `
            <div class="live-engine-panel">
              <div class="live-engine-panel__title">Last Live Settlement</div>
              <p class="live-engine-card__meta">${live.lastDraw.winCount} win${live.lastDraw.winCount === 1 ? "" : "s"}, ${formatApiMoney(live.lastDraw.totalReward)} total reward, ${formatApiMoney(live.lastDraw.endingBalance)} ending balance.</p>
              ${renderLiveResultList(live)}
            </div>
          `
          : ""
      }
      ${
        featuredPrize && !featuredPrizes.length
          ? `<p class="live-engine-card__meta">Featured: ${escapeHtml(featuredPrize.name)} for ${formatApiMoney(featuredPrize.rewardAmount)}</p>`
          : ""
      }
    </article>
  `;
}

function renderLiveResultList(live: LiveDataState): string {
  if (!live.lastDraw || live.lastDraw.results.length === 0) {
    return `<p class="live-engine-card__meta">The latest live pull did not return any result rows.</p>`;
  }

  return `
    <div class="live-result-list">
      ${live.lastDraw.results
        .slice(0, 3)
        .map(
          (result) => `
            <div class="live-result-item">
              <strong>${escapeHtml(result.prize?.name ?? result.status)}</strong>
              <span>${formatApiMoney(result.rewardAmount)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderScratchSlot(slot: ScratchSlot, stage: PlayStage): string {
  const isFinalActive = stage === "ticket-final" && slot.id === 2 && !slot.revealed;
  const isLocked = slot.id === 2 && (stage === "ticket" || stage === "decision");
  const isActive = isFinalActive;
  const classNames = [
    "ticket-slot",
    slot.revealed ? "ticket-slot--revealed" : "ticket-slot--hidden",
    isActive ? "ticket-slot--active" : "",
    isLocked ? "ticket-slot--locked" : "",
    slot.revealed && slot.kind === "cash" ? "ticket-slot--cash" : "",
    slot.revealed && slot.kind === "multiplier" ? "ticket-slot--multiplier" : "",
    slot.revealed && slot.kind === "bust" ? "ticket-slot--bust" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const slotLabel =
    slot.revealed || slot.id !== 2 || isFinalActive ? slot.label : isLocked ? "LOCK" : "?";
  const scratchOverlay =
    isActive && !slot.revealed
      ? `<canvas class="ticket-slot__scratch" data-scratch-slot-id="${slot.id}" aria-label="Scratch slot ${slot.id + 1}"></canvas>`
      : "";

  return `
    <article class="${classNames}" data-slot-cell-id="${slot.id}">
      <span class="ticket-slot__spark"></span>
      <span class="ticket-slot__mark">${slotLabel}</span>
      ${scratchOverlay}
    </article>
  `;
}

function renderScratchBoard(play: PlayState): string {
  if (play.stage !== "ticket") {
    return "";
  }

  return `<canvas class="ticket-grid__scratch-board" data-scratch-board="opening" aria-label="Scratch strip"></canvas>`;
}

function renderScratchFooter(play: PlayState): string {
  if (play.stage === "ticket") {
    return "Scratch the full strip to expose the whole ticket.";
  }

  if (play.stage === "ticket-final") {
    return "This is the slot people remember for the rest of their lives.";
  }

  return "The cat says nothing. That is usually when people lose everything.";
}

function renderTicketSceneBadge(play: PlayState): string {
  switch (play.stage) {
    case "decision":
      return "2 WINS CLEARED";
    case "ticket-final":
      return "LAST PANEL LIVE";
    default:
      return "+25% NERVE";
  }
}

function renderTicketOdds(): string {
  const rows = [
    { kind: "safe", label: "First hit", chance: "100%", payout: "+$10" },
    { kind: "safe", label: "Second hit", chance: "100%", payout: "+$30" },
    { kind: "jackpot", label: "Final x3", chance: "50%", payout: "$120" },
    { kind: "bust", label: "Bust", chance: "50%", payout: "$0" },
  ];

  return rows
    .map(
      (row) => `
        <div class="ticket-odds__item ticket-odds__item--${row.kind}">
          <span class="ticket-odds__chip"></span>
          <div class="ticket-odds__copy">
            <strong>${row.label}</strong>
            <small>${row.chance}</small>
          </div>
          <span class="ticket-odds__payout">${row.payout}</span>
        </div>
      `,
    )
    .join("");
}

function renderTicketOddsNote(play: PlayState): string {
  const sealedCount = play.slots.filter((slot) => !slot.revealed).length;

  switch (play.stage) {
    case "decision":
      return "1 sealed panel. You can still leave with dinner money.";
    case "ticket-final":
      return "Final panel is live. No one here ever calls this part luck.";
    case "bust":
      return "All value burned off the paper.";
    case "ticket-win":
      return "The ticket actually paid. The room noticed.";
    default:
      return `${sealedCount} sealed panels left on the ticket.`;
  }
}

function renderCardFan(cards: Card[], alignment: "opponent" | "player"): string {
  return `
    <div class="card-fan card-fan--${alignment}">
      ${cards
        .map(
          (card, index) => `
            <article class="play-card play-card--${card.suit}" style="--card-index:${index}">
              <span class="play-card__rank">${card.rank}</span>
              <span class="play-card__suit">${suitSymbol(card.suit)}</span>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function suitSymbol(suit: Suit): string {
  switch (suit) {
    case "hearts":
      return "♥";
    case "spades":
      return "♠";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
  }
}
