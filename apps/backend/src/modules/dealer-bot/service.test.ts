import { describe, expect, it } from "vitest";

import { appendDealerFeedEvent, buildDealerEvent } from "./service";

describe("dealer bot service", () => {
  it("caps the dealer feed to the newest 12 events", () => {
    let feed = [] as ReturnType<typeof appendDealerFeedEvent>;

    for (let index = 0; index < 14; index += 1) {
      feed = appendDealerFeedEvent(
        feed,
        buildDealerEvent({
          kind: "action",
          source: "rule",
          gameType: "holdem",
          tableId: 8,
          tableRef: "holdem:8",
          actionCode: `code-${index}`,
          text: `Event ${index}`,
        }),
      );
    }

    expect(feed).toHaveLength(12);
    expect(feed[0]?.text).toBe("Event 2");
    expect(feed[11]?.text).toBe("Event 13");
  });

  it("deduplicates by id when the same dealer event is re-applied", () => {
    const event = buildDealerEvent({
      kind: "message",
      source: "llm",
      gameType: "blackjack",
      tableId: null,
      tableRef: "bj-1",
      text: "Dealer says hello.",
    });

    const once = appendDealerFeedEvent([], event);
    const twice = appendDealerFeedEvent(once, event);

    expect(twice).toHaveLength(1);
    expect(twice[0]?.id).toBe(event.id);
  });
});
