import type { PlayActionContext } from "../actions";
import { revealOpeningStrip, revealSlot } from "../actions";
import { mountScratchCard, mountScratchSurface } from "../scratch-card";

interface ScratchControllerOptions {
  appRoot: HTMLDivElement;
  getActionContext: () => PlayActionContext;
}

export function hydrateScratchController(options: ScratchControllerOptions): void {
  const scratchCanvases = options.appRoot.querySelectorAll<HTMLCanvasElement>("[data-scratch-slot-id]");

  scratchCanvases.forEach((canvas) => {
    const slotId = Number(canvas.dataset.scratchSlotId);
    if (!Number.isFinite(slotId)) {
      return;
    }

    mountScratchCard({
      canvas,
      onComplete: () => {
        revealSlot(options.getActionContext(), slotId);
      },
    });
  });

  const scratchBoards = options.appRoot.querySelectorAll<HTMLCanvasElement>("[data-scratch-board]");

  scratchBoards.forEach((canvas) => {
    const wrapper = canvas.parentElement;
    if (!wrapper) {
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const liveSlots = [0, 1, 2]
      .map((slotId) => wrapper.querySelector<HTMLElement>(`[data-slot-cell-id="${slotId}"]`))
      .filter((slot): slot is HTMLElement => slot !== null);

    if (liveSlots.length < 3) {
      return;
    }

    const revealGate = new Set<number>();
    const regions = liveSlots
      .map((slot) => {
        const slotId = Number(slot.dataset.slotCellId);
        if (!Number.isFinite(slotId)) {
          return null;
        }

        const rect = slot.getBoundingClientRect();
        return {
          id: slotId,
          x: rect.left - canvasRect.left,
          y: rect.top - canvasRect.top,
          width: rect.width,
          height: rect.height,
          threshold: 0.46,
        };
      })
      .filter((region): region is NonNullable<typeof region> => region !== null);

    if (regions.length < 3) {
      return;
    }

    mountScratchSurface({
      canvas,
      regions,
      onReveal: (regionId) => {
        revealGate.add(regionId);
        if (revealGate.size === regions.length) {
          revealOpeningStrip(options.getActionContext());
        }
      },
    });
  });
}
