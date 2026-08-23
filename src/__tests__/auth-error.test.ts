/**
 * Giriş hatası sınıflandırması — "şifre hatalı" ile "sunucuya ulaşılamadı" ayrımı.
 *
 * Regresyon kilidi: 2026-08-24'te erişilemeyen Supabase projesi (host ENOTFOUND)
 * kullanıcıya "E-posta veya şifre hatalı." olarak gösteriliyor, doğru şifreyle
 * giren kullanıcı şifresini suçluyordu.
 *
 * Beklenen şekiller @supabase/auth-js kaynağından alındı (lib/fetch.js).
 */
import { describe, it, expect } from "vitest";
import { isBackendUnreachable } from "@/lib/auth/auth-error";

describe("isBackendUnreachable", () => {
    it("ağ/DNS/offline (AuthRetryableFetchError, status 0) → ulaşılamıyor", () => {
        expect(isBackendUnreachable({ name: "AuthRetryableFetchError", status: 0 })).toBe(true);
    });

    it("sınıf adı tek başına yeter (status taşımasa bile)", () => {
        expect(isBackendUnreachable({ name: "AuthRetryableFetchError" })).toBe(true);
    });

    it("sunucu tarafı geçici arıza (5xx) → ulaşılamıyor", () => {
        expect(isBackendUnreachable({ status: 500 })).toBe(true);
        expect(isBackendUnreachable({ status: 503 })).toBe(true);
    });

    it("geçersiz kimlik bilgisi (AuthApiError 400) → kimlik hatası", () => {
        expect(isBackendUnreachable({ name: "AuthApiError", status: 400 })).toBe(false);
    });

    it("diğer 4xx'ler de kimlik/istek hatası sayılır", () => {
        expect(isBackendUnreachable({ status: 401 })).toBe(false);
        expect(isBackendUnreachable({ status: 422 })).toBe(false);
        expect(isBackendUnreachable({ status: 429 })).toBe(false);
    });

    it("status'suz bilinmeyen hata → kimlik hatası (yanlış yönlendirme yapma)", () => {
        // Gerçek auth-js hataları hep status taşır; bu yalnız savunma davranışı.
        expect(isBackendUnreachable({ message: "boom" } as { status?: number })).toBe(false);
    });

    it("hata yoksa false", () => {
        expect(isBackendUnreachable(null)).toBe(false);
        expect(isBackendUnreachable(undefined)).toBe(false);
    });
});
