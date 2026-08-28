/**
 * Paraşüt faturası için resmî döviz kuru çözümü (Faz 12).
 *
 * SORUN: `createSalesInvoice` payload'ı bugüne dek `exchange_rate` göndermiyordu.
 * Dövizli faturada Paraşüt kendi kurunu uygular; bu, ERP'nin ekranda gösterdiği
 * TL karşılığından sapabilir → muhasebe ile ERP arasında açıklanamayan fark.
 *
 * ÇÖZÜM: fatura tarihine ait **TCMB döviz alış** kuru gönderilir.
 *
 * TASARIM KARARI — best-effort:
 *   Kur çözülemezse (TCMB erişilemez, gün uyuşmuyor, kod bilinmiyor) alan HİÇ
 *   gönderilmez ve fatura yine kesilir. Yanlış bir kur göndermek, Paraşüt'ün
 *   kendi kurunu kullanmasından DAHA kötüdür; ayrıca kur yüzünden fatura
 *   kesilememesi sevkiyatı bloke ederdi.
 *
 * SINIR: TCMB `today.xml` yalnız BUGÜNÜN kurunu taşır. Fatura tarihi bugün
 * değilse kur döndürülmez (geçmiş tarihli fatura yanlış kurla damgalanmaz).
 * Faturalar `localISODate(Date.now())` ile kesildiği için pratikte hep bugündür.
 */

import { parseTcmbForexBuying } from "@/lib/exchange-rates";

const TCMB_TODAY_XML_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const FETCH_TIMEOUT_MS   = 8_000;
/** Paraşüt kuru TL bazlıdır; TRL faturada kur alanı anlamsız. */
const BASE_CURRENCY      = "TRL";

/** TCMB tarih biçimi `DD.MM.YYYY` → `YYYY-MM-DD`. */
export function tcmbDateToISO(raw: string): string | null {
    const m = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * `issueDate` (YYYY-MM-DD) için `currency`'nin TCMB alış kuru.
 * Çözülemeyen her durumda `undefined` — çağıran alanı payload'a koymaz.
 */
export async function resolveInvoiceExchangeRate(
    currency: string,
    issueDate: string,
    fetchImpl: typeof fetch = fetch,
): Promise<number | undefined> {
    if (currency === BASE_CURRENCY) return undefined;

    // Mock modda ağa çıkılmaz: mock adapter kur alanını kullanmıyor ve test
    // koşusunda gerçek TCMB isteği hem yavaşlık hem kırılganlık üretirdi.
    // Fonksiyonun kendisi `fetchImpl` enjeksiyonuyla doğrudan test edilir.
    if (process.env.PARASUT_USE_MOCK !== "false") return undefined;

    try {
        const response = await fetchImpl(TCMB_TODAY_XML_URL, {
            headers: { accept: "application/xml,text/xml,*/*" },
            signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) return undefined;

        const parsed = parseTcmbForexBuying(await response.text(), currency);
        if (!parsed) return undefined;

        // today.xml yalnız bugünü taşır → fatura tarihi tutmuyorsa kur gönderilmez.
        const rateDate = tcmbDateToISO(parsed.date);
        if (!rateDate || rateDate !== issueDate) {
            console.log(JSON.stringify({
                parasut_exchange_rate: "date_mismatch",
                currency, issueDate, rateDate,
            }));
            return undefined;
        }

        return parsed.rate;
    } catch (err) {
        // Sessizce düşmez — gözlemlenebilir kalır, ama faturayı bloklamaz.
        console.log(JSON.stringify({
            parasut_exchange_rate: "unresolved",
            currency, issueDate, reason: err instanceof Error ? err.message : String(err),
        }));
        return undefined;
    }
}
