/**
 * Para yuvarlama — TEK konvansiyon (denetim D1, 2026-06).
 *
 * Kural: 2 ondalık, half-up (Postgres `round(numeric, 2)` ile hizalı).
 * `Number.EPSILON` katkısı 1.005 gibi float temsili "1.00499..." olan
 * değerlerin yanlış aşağı yuvarlanmasını önler.
 *
 * Satır toplamı → yuvarla → topla (yuvarlamasız float akümülasyonu yasak;
 * 100+ satırda kuruş kaymaları birikir — bkz. rapor D1).
 */
export function roundMoney(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
