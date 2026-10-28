import { describe, expect, it } from "vitest";
import { persistencePresentation } from "../src/presentationStatus";

describe("persistence presentation uses acknowledged store states", () => {
  it("never presents an in-memory or failed save as durable", () => {
    for (const status of [
      "Not saved · kept in memory",
      "Not saved · preview kept",
      "Device storage needs recovery",
    ])
      expect(persistencePresentation(status, true, false).label).toBe(
        "Needs attention",
      );
    expect(persistencePresentation("Saving on device", true, false).label).toBe(
      "Saving…",
    );
  });
  it("distinguishes device durability, cloud sync and conflicts", () => {
    expect(
      persistencePresentation("Offline · saved on device", true, false).label,
    ).toBe("Saved on device");
    expect(persistencePresentation("Pending sync", true, false).label).toBe(
      "Saved on device",
    );
    expect(persistencePresentation("Syncing", true, false).label).toBe(
      "Saved on device",
    );
    expect(persistencePresentation("Syncing", false, false).label).toBe(
      "Syncing…",
    );
    expect(
      persistencePresentation("Offline / sync paused", true, false).label,
    ).toBe("Saved on device");
    expect(
      persistencePresentation("Offline / sync paused", false, false).label,
    ).toBe("Needs attention");
    expect(persistencePresentation("Pending sync", false, false).label).toBe(
      "Saving…",
    );
    expect(persistencePresentation("Synced", false, false).label).toBe(
      "Synced",
    );
    expect(persistencePresentation("Synced", true, true).label).toBe(
      "Needs attention",
    );
    expect(
      persistencePresentation(
        "Saved online · offline copy unavailable",
        false,
        false,
      ).label,
    ).toBe("Needs attention");
  });
});
