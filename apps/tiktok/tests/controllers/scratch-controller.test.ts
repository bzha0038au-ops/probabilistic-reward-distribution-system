import { beforeEach, describe, expect, it, vi } from "vitest";

const scratchMocks = vi.hoisted(() => ({
  revealOpeningStrip: vi.fn(),
  revealSlot: vi.fn(),
  mountScratchCard: vi.fn(),
  mountScratchSurface: vi.fn(),
}));

vi.mock("../../src/actions", () => ({
  revealOpeningStrip: scratchMocks.revealOpeningStrip,
  revealSlot: scratchMocks.revealSlot,
}));

vi.mock("../../src/scratch-card", () => ({
  mountScratchCard: scratchMocks.mountScratchCard,
  mountScratchSurface: scratchMocks.mountScratchSurface,
}));

import { hydrateScratchController } from "../../src/controllers/scratch-controller";

function setRect(
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => "",
    }),
  });
}

describe("scratch-controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("only advances the opening strip after all three regions reveal", () => {
    let onReveal: ((id: number) => void) | undefined;
    scratchMocks.mountScratchSurface.mockImplementation((options: { onReveal: (id: number) => void }) => {
      onReveal = options.onReveal;
    });

    const appRoot = document.createElement("div");
    const wrapper = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.dataset.scratchBoard = "opening";

    setRect(canvas, { left: 0, top: 0, width: 300, height: 120 });

    [0, 1, 2].forEach((slotId) => {
      const slot = document.createElement("div");
      slot.dataset.slotCellId = String(slotId);
      setRect(slot, { left: slotId * 100, top: 20, width: 96, height: 60 });
      wrapper.append(slot);
    });

    wrapper.append(canvas);
    appRoot.append(wrapper);

    const actionContext = {
      state: {} as never,
      persistProgress: vi.fn(),
      navigateToCurrentState: vi.fn(),
      recordBeat: vi.fn(),
    };

    hydrateScratchController({
      appRoot,
      getActionContext: () => actionContext,
    });

    expect(scratchMocks.mountScratchSurface).toHaveBeenCalledTimes(1);
    expect(onReveal).toBeTypeOf("function");

    onReveal?.(0);
    onReveal?.(1);
    expect(scratchMocks.revealOpeningStrip).not.toHaveBeenCalled();

    onReveal?.(2);
    expect(scratchMocks.revealOpeningStrip).toHaveBeenCalledTimes(1);
    expect(scratchMocks.revealOpeningStrip).toHaveBeenCalledWith(actionContext);
  });

  it("wires final scratch-card completion to revealSlot", () => {
    let onComplete: (() => void) | undefined;
    scratchMocks.mountScratchCard.mockImplementation((options: { onComplete: () => void }) => {
      onComplete = options.onComplete;
    });

    const appRoot = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.dataset.scratchSlotId = "2";
    appRoot.append(canvas);

    const actionContext = {
      state: {} as never,
      persistProgress: vi.fn(),
      navigateToCurrentState: vi.fn(),
      recordBeat: vi.fn(),
    };

    hydrateScratchController({
      appRoot,
      getActionContext: () => actionContext,
    });

    expect(scratchMocks.mountScratchCard).toHaveBeenCalledTimes(1);
    expect(onComplete).toBeTypeOf("function");

    onComplete?.();
    expect(scratchMocks.revealSlot).toHaveBeenCalledTimes(1);
    expect(scratchMocks.revealSlot).toHaveBeenCalledWith(actionContext, 2);
  });
});
