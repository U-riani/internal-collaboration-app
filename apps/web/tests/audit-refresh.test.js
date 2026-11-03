import { describe, expect, it } from "vitest";
import { auditDateRange } from "../src/lib/audit-date-range.js";

describe("Audit date range refresh", () => {
  const initial = Date.parse("2026-11-03T09:00:00.000Z");

  it("moves both ends of a rolling date window forward on refresh", () => {
    const before = auditDateRange("7", "", "", initial);
    const after = auditDateRange("7", "", "", initial + 60_000);
    expect(after.end).toBe("2026-11-03T09:01:00.000Z");
    expect(Date.parse(after.end) - Date.parse(before.end)).toBe(60_000);
    expect(Date.parse(after.start) - Date.parse(before.start)).toBe(60_000);
  });

  it("does not move a selected custom calendar range", () => {
    const before = auditDateRange("custom", "2026-10-01", "2026-10-10", initial);
    const after = auditDateRange("custom", "2026-10-01", "2026-10-10", initial + 60_000);
    expect(after).toEqual(before);
  });

  it("uses the default seven-day window until both custom dates are selected", () => {
    const result = auditDateRange("custom", "2026-11-01", "", initial);
    expect(Date.parse(result.end) - Date.parse(result.start)).toBe(7 * 86400000);
  });
});
