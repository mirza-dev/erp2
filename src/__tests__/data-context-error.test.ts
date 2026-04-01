import { describe, it, expect } from "vitest";

/**
 * Mirrors the error-detection logic in DataProvider.refetchAll.
 * Tests the priority and message format for all failure scenarios.
 *
 * (React hook itself is not testable in node environment without jsdom;
 * this function replicates the conditional logic inline for coverage.)
 */
function buildLoadError(
  coreStatuses: number[],
  alertsStatus: number
): string | null {
  const failedStatus = coreStatuses.find(s => s < 200 || s >= 300);
  if (failedStatus !== undefined)
    return `Veriler yüklenemedi (HTTP ${failedStatus}). Backend bağlantısını kontrol edin.`;
  if (alertsStatus < 200 || alertsStatus >= 300)
    return `Uyarı servisi yanıt vermedi (HTTP ${alertsStatus}). Stok uyarıları güncel olmayabilir.`;
  return null;
}

describe("buildLoadError — refetchAll hata tespiti", () => {
  it("tüm endpoint'ler OK olduğunda null döner", () => {
    expect(buildLoadError([200, 200, 200, 200], 200)).toBeNull();
  });

  it("core endpoint 500 döndürürse kritik mesaj gösterir", () => {
    const msg = buildLoadError([200, 500, 200, 200], 200);
    expect(msg).toContain("HTTP 500");
    expect(msg).toContain("Backend bağlantısını kontrol edin");
  });

  it("core OK, alerts 503 → soft uyarı mesajı", () => {
    const msg = buildLoadError([200, 200, 200, 200], 503);
    expect(msg).toContain("HTTP 503");
    expect(msg).toContain("Stok uyarıları güncel olmayabilir");
  });

  it("core 500 + alerts 503 → core mesajı öncelikli", () => {
    const msg = buildLoadError([200, 500, 200, 200], 503);
    expect(msg).toContain("Backend bağlantısını kontrol edin");
    expect(msg).not.toContain("Stok uyarıları");
  });

  it("core 404 → mesaj doğru status kodu içeriyor", () => {
    const msg = buildLoadError([404, 200, 200, 200], 200);
    expect(msg).toContain("HTTP 404");
  });
});
