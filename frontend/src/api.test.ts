import { describe, expect, it } from "vitest";
import { errorMessage, isActive } from "./api";

describe("researcher-facing request failures", () => {
  it("renders nested protocol validation locations", () => {
    expect(
      errorMessage([
        {
          loc: ["body", "study", "peers", 0, "choice_id"],
          msg: "Unknown option",
        },
      ]),
    ).toBe("study → peers → 0 → choice_id: Unknown option");
    expect(errorMessage("Already running")).toBe("Already running");
  });
  it("stops polling every terminal status, including interrupted work", () => {
    expect(
      [
        "completed",
        "completed_with_errors",
        "cancelled",
        "interrupted",
        "failed",
      ].some(isActive),
    ).toBe(false);
    expect(["queued", "running"].every(isActive)).toBe(true);
  });
});
