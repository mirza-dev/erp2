/**
 * G4 (bulgular 4. tur) — purchase-suggested-refetch-after-mutation
 *
 * scheduleRefetchAfterMutation helper'ı handleAccept/handleReject/handleEdit/
 * handleUndo içinde kullanılıyor. Mutation başarılıysa 300ms sonra loadAiData
 * tetiklenir; aynı timer ref'i ile birden fazla çağrı debounce edilir.
 *
 * Page-level (jsdom gerektiren) component testi yerine helper davranışını
 * fake timers ile birebir test ediyoruz.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduleRefetchAfterMutation } from "@/lib/purchase-utils";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("scheduleRefetchAfterMutation — debounce ve gecikme", () => {
    it("default 300ms sonra loadFn tetiklenir", () => {
        const ref: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };
        const loadFn = vi.fn();
        scheduleRefetchAfterMutation(ref, loadFn);
        expect(loadFn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(300);
        expect(loadFn).toHaveBeenCalledTimes(1);
    });

    it("300ms'den önce loadFn tetiklenmez", () => {
        const ref: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };
        const loadFn = vi.fn();
        scheduleRefetchAfterMutation(ref, loadFn);
        vi.advanceTimersByTime(299);
        expect(loadFn).not.toHaveBeenCalled();
    });

    it("ardışık çağrılar debounce: sadece son timer çalışır", () => {
        const ref: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };
        const loadFn = vi.fn();
        scheduleRefetchAfterMutation(ref, loadFn);
        vi.advanceTimersByTime(150);
        scheduleRefetchAfterMutation(ref, loadFn); // önceki iptal
        vi.advanceTimersByTime(150); // toplam 300, ama 2. sayaç yeniden başlatıldı
        expect(loadFn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(150); // 2. sayaç tamamlanır
        expect(loadFn).toHaveBeenCalledTimes(1);
    });

    it("custom delayMs override edilebilir", () => {
        const ref: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };
        const loadFn = vi.fn();
        scheduleRefetchAfterMutation(ref, loadFn, 1000);
        vi.advanceTimersByTime(300);
        expect(loadFn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(700);
        expect(loadFn).toHaveBeenCalledTimes(1);
    });

    it("ref.current değişir (yeni timer'a referans tutar)", () => {
        const ref: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };
        const loadFn = vi.fn();
        scheduleRefetchAfterMutation(ref, loadFn);
        expect(ref.current).toBeDefined();
    });

    it("4 farklı handler aynı ref ile çağrılırsa sadece bir kez tetiklenir (debounce)", () => {
        // handleAccept → handleEdit → handleReject → handleUndo gibi rapid mutation'lar
        const ref: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };
        const loadFn = vi.fn();
        for (let i = 0; i < 4; i++) {
            scheduleRefetchAfterMutation(ref, loadFn);
            vi.advanceTimersByTime(50); // her biri 50ms aralıkla
        }
        // Toplam ilerleme: 200ms — son timer'dan 50ms geçti, henüz tetiklenmedi
        expect(loadFn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(250); // son timer'dan 300ms tamam
        expect(loadFn).toHaveBeenCalledTimes(1);
    });
});
