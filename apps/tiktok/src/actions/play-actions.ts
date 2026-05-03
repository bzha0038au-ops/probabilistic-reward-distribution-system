import type { AppState } from "../app-types";
import { BUST_COPY, JACKPOT_COPY, REX_ENDING, WALK_AWAY_COPY } from "../game-content";
import { formatMoney } from "../game-utils";
import {
  createIntroPlayState,
  createTicketPlayState,
  getRevealedScratchCount,
  getScratchableSlot,
  refreshBestTake,
  STARTING_CASH,
} from "../state";

export interface PlayActionContext {
  state: AppState;
  persistProgress: () => void;
  navigateToCurrentState: () => void;
  recordBeat: (message: string) => void;
}

export function resetToIntro(context: PlayActionContext): void {
  context.state.play = createIntroPlayState(STARTING_CASH);
  context.navigateToCurrentState();
}

export function startRun(context: PlayActionContext): void {
  const nextRun = context.state.runCount + 1;
  context.state.runCount = nextRun;
  context.state.play = createTicketPlayState(nextRun);
  context.recordBeat(`Run ${nextRun} begins with $20 and a card from the cat.`);
  context.persistProgress();
  context.navigateToCurrentState();
}

export function revealOpeningStrip(context: PlayActionContext): void {
  const play = context.state.play;
  if (play.stage !== "ticket") {
    return;
  }

  const openingSlots = play.slots.filter((slot) => slot.id === 0 || slot.id === 1);
  let awarded = 0;

  openingSlots.forEach((slot) => {
    if (slot.revealed) {
      return;
    }

    slot.revealed = true;
    if (slot.kind === "cash") {
      awarded += slot.amount;
    }
  });

  play.scratchTotal += awarded;
  play.stage = "decision";
  context.recordBeat(`Yoyo tears through the strip. ${formatMoney(awarded)} appears before he can pretend it was discipline.`);
  context.persistProgress();
  context.navigateToCurrentState();
}

export function revealSlot(context: PlayActionContext, slotId: number): void {
  const play = context.state.play;
  if (play.stage !== "ticket" && play.stage !== "ticket-final") {
    return;
  }

  const nextSlot = getScratchableSlot(play);
  if (!nextSlot || nextSlot.id !== slotId) {
    return;
  }

  nextSlot.revealed = true;

  if (nextSlot.kind === "cash") {
    play.scratchTotal += nextSlot.amount;
    context.recordBeat(`Yoyo scratches ${nextSlot.label}. Total climbs to ${formatMoney(play.scratchTotal)}.`);
  }

  const revealedCount = getRevealedScratchCount(play.slots);
  if (play.stage === "ticket" && revealedCount >= 2) {
    play.stage = "decision";
  } else if (play.stage === "ticket-final") {
    if (nextSlot.kind === "bust") {
      play.scratchTotal = 0;
      play.stage = "bust";
      context.state.lastEnding = BUST_COPY.body;
      context.recordBeat("The final scratch is nothing. Everything goes dark.");
    } else {
      play.scratchTotal *= nextSlot.amount;
      play.rexStake = play.scratchTotal;
      play.stage = "ticket-win";
      refreshBestTake(context.state, play.scratchTotal);
      context.state.lastEnding = JACKPOT_COPY.body;
      context.recordBeat(`The final scratch lands on ${nextSlot.label}. Total jumps to ${formatMoney(play.scratchTotal)}.`);
    }
  }

  context.persistProgress();
  context.navigateToCurrentState();
}

export function continueTicket(context: PlayActionContext): void {
  const play = context.state.play;
  if (play.stage !== "decision") {
    return;
  }

  play.stage = "ticket-final";
  context.recordBeat("Yoyo slides the card back under his thumb. The last panel now has to be scratched open.");
  context.persistProgress();
  context.navigateToCurrentState();
}

export function cashOut(context: PlayActionContext): void {
  const play = context.state.play;
  if (play.stage !== "decision" && play.stage !== "ticket-win") {
    return;
  }

  play.stage = "walk-away";
  context.state.lastEnding = WALK_AWAY_COPY.body;
  refreshBestTake(context.state, play.scratchTotal);
  context.recordBeat(`Yoyo stops at ${formatMoney(play.scratchTotal)} and chooses the door over the table.`);
  context.persistProgress();
  context.navigateToCurrentState();
}

export function faceRex(context: PlayActionContext): void {
  const play = context.state.play;
  if (play.stage !== "ticket-win" && play.stage !== "walk-away") {
    return;
  }

  play.rexStake = play.scratchTotal;
  play.stage = "rex";
  context.recordBeat(`Rex waves Yoyo over to the table and sizes up ${formatMoney(play.rexStake)} in his pocket.`);
  context.persistProgress();
  context.navigateToCurrentState();
}

export function leaveTheTable(context: PlayActionContext): void {
  const play = context.state.play;
  if (play.stage !== "rex") {
    return;
  }

  play.stage = "walk-away";
  context.state.lastEnding = "You left before somebody else dragged you deeper into the room.";
  refreshBestTake(context.state, play.rexStake);
  context.recordBeat(`Yoyo watches Rex grin, then gets up with ${formatMoney(play.rexStake)} still in hand.`);
  context.persistProgress();
  context.navigateToCurrentState();
}

export function letRexHit(context: PlayActionContext): void {
  const play = context.state.play;
  if (play.stage !== "rex") {
    return;
  }

  play.rexCards = [...play.rexCards, play.rexDrawCard];
  play.rexStake *= 2;
  play.stage = "rex-win";
  context.state.lastEnding = REX_ENDING.body;
  refreshBestTake(context.state, play.rexStake);
  context.recordBeat(`Rex asks for one more card, busts out, and Yoyo walks with ${formatMoney(play.rexStake)}.`);
  context.persistProgress();
  context.navigateToCurrentState();
}
