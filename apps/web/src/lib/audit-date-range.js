// A rolling audit filter must advance its end timestamp when the user refreshes.
// Custom calendar dates remain fixed so the selected period is preserved.
export function auditDateRange(range, customFrom, customTo, now = Date.now()) {
  if (range === "custom" && customFrom && customTo) {
    return {
      start: new Date(customFrom + "T00:00:00").toISOString(),
      end: new Date(customTo + "T23:59:59").toISOString(),
    };
  }

  const days = Number(range === "custom" ? 7 : range);
  return {
    start: new Date(now - days * 86400000).toISOString(),
    end: new Date(now).toISOString(),
  };
}
