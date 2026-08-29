/**
 * Teslim öncesi test/E2E artığı tespiti — saf desen katmanı.
 *
 * Fabrikaya kurulumdan önce canlı veride test kalıntısı bırakılmamalı
 * (2026-08-24 taraması: 15 test carisi, 9 test siparişi, 1 anlamsız RFQ).
 *
 * KRİTİK TASARIM KURALI: desenler DAR tutulur. Bu listeye bakarak kayıt
 * silinecek — yanlış bir eşleşme GERÇEK müşteri verisini sildirir. Bu yüzden
 * "test" kelimesi tek başına YETMEZ: gerçek bir firma adı içerebilir
 * ("Testaş Vana", "Protest Mühendislik"). Eşleşme için otomatik üretilmiş
 * kayıtlara özgü yapı aranır — en tipik imza sondaki unix timestamp.
 */

export interface TestDataPattern {
    label: string;
    re: RegExp;
}

export const TEST_DATA_PATTERNS: TestDataPattern[] = [
    { label: "Test Müşterisi <timestamp>", re: /^Test Müşterisi \d{10,}/i },
    { label: "E2E Müşteri <timestamp>", re: /^E2E (Müşteri|Customer) \d{10,}/i },
    { label: "test-<timestamp>@…", re: /^test-\d{10,}@/i },
    { label: "playwright/vitest damgası", re: /(playwright|vitest|__test__)/i },
    // KOBİ simülasyonu (2026-08) — dört yapay çalışanın canlı veride bıraktığı
    // kayıtlar. İmza baştaki "SIM" damgası; `scripts/sim/cleanup.ts` de aynı
    // deseni arar. Gerçek firma adını yakalamaması için sözcük sınırı şart:
    // "Simge Mühendislik" eşleşmemeli.
    { label: "SIM simülasyon kaydı", re: /^SIM[\s\-]/ },
    { label: "sim çalışan hesabı", re: /@pmt-sim\.test$/i },
];

/** Eşleşen desenin etiketi, yoksa null. */
export function matchTestDataPattern(value: string | null | undefined): string | null {
    if (!value) return null;
    const v = value.trim();
    for (const p of TEST_DATA_PATTERNS) if (p.re.test(v)) return p.label;
    return null;
}

/**
 * Klavyeye rastgele basılmış başlık ("zrxdjfgchvj") tespiti — YALNIZ serbest
 * metin başlıklarında (RFQ başlığı gibi) kullanılır, firma adında DEĞİL.
 *
 * Sezgi: 8-20 harflik tek kelime + ilk hecelerde sesli harf yokluğu. Gerçek
 * Türkçe/İngilizce kelimeler sesli harf taşır ve genelde boşluk içerir.
 */
export function isGibberishTitle(value: string | null | undefined): boolean {
    if (!value) return false;
    const v = value.trim();
    if (!/^[a-z]{8,20}$/.test(v)) return false;
    const vowels = (v.slice(0, 6).match(/[aeıioöuü]/g) ?? []).length;
    return vowels <= 1;
}
