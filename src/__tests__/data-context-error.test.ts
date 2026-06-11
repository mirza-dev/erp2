import { describe, it, expect } from "vitest";
import { buildLoadError } from "@/lib/data-context";
import { FetchError } from "@/lib/swr-config";

/**
 * buildLoadError — yük hata mesajı önceliği (SWR turu: artık GERÇEK export
 * test edilir; eski mirror kopya drift riski kapandı).
 *  - core (products/customers/orders/production) hatası > alerts hatası
 *  - FetchError → HTTP status'lu mesaj; diğer hatalar → ağ bağlantı mesajı
 */
const http = (status: number) => new FetchError(`İstek başarısız (HTTP ${status})`, status);

describe("buildLoadError — refetch hata tespiti", () => {
  it("hata yokken null döner", () => {
    expect(buildLoadError([undefined, undefined, undefined, undefined], undefined)).toBeNull();
  });

  it("core endpoint 500 → kritik mesaj", () => {
    const msg = buildLoadError([undefined, http(500), undefined, undefined], undefined);
    expect(msg).toContain("HTTP 500");
    expect(msg).toContain("Backend bağlantısını kontrol edin");
  });

  it("core OK, alerts 503 → soft uyarı mesajı", () => {
    const msg = buildLoadError([undefined, undefined, undefined, undefined], http(503));
    expect(msg).toContain("HTTP 503");
    expect(msg).toContain("Stok uyarıları güncel olmayabilir");
  });

  it("core 500 + alerts 503 → core mesajı öncelikli", () => {
    const msg = buildLoadError([undefined, http(500), undefined, undefined], http(503));
    expect(msg).toContain("Backend bağlantısını kontrol edin");
    expect(msg).not.toContain("Stok uyarıları");
  });

  it("core 404 → mesaj doğru status kodu içerir", () => {
    const msg = buildLoadError([http(404), undefined, undefined, undefined], undefined);
    expect(msg).toContain("HTTP 404");
  });

  it("ağ hatası (FetchError değil) → bağlantı mesajı", () => {
    const msg = buildLoadError([new TypeError("fetch failed"), undefined, undefined, undefined], undefined);
    expect(msg).toBe("Sunucuya bağlanamadı. Ağ bağlantınızı ve backend durumunu kontrol edin.");
  });

  it("yalnız alerts ağ hatası → bağlantı mesajı (soft yol)", () => {
    const msg = buildLoadError([undefined, undefined, undefined, undefined], new TypeError("fetch failed"));
    expect(msg).toBe("Sunucuya bağlanamadı. Ağ bağlantınızı ve backend durumunu kontrol edin.");
  });
});
