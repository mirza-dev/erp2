import type { CSSProperties } from "react";
import { labelStyle as sharedLabelStyle } from "@/components/ui/Input";

/**
 * Developer Console'un elle örülmüş yüzeyleri için ortak stil kaynağı.
 *
 * Konsolun üç sayfası (Bug'lar, Hatalar, Performans) ortak `DataTable`'ı
 * kullanır; kalan dördü satırlarını elle örer. `Card` kasten dolgusuzdur —
 * dolgu çocuğun sorumluluğudur (bkz. Card.tsx) — ama elle örülen yüzeyler
 * yatay dolguyu hiç vermiyordu, bu yüzden metin kartın kenarlığına 1px
 * kalıyordu. Buradaki `CONSOLE_GUTTER`, `DataTable` hücresinin yatay
 * dolgusuyla (10px 14px → DataTable.tsx) aynıdır; böylece elle örülen
 * yüzeyler tablo kullanan sayfalarla aynı hizada durur.
 */
export const CONSOLE_GUTTER = "14px";

/**
 * Kart içi bölüm başlığının OLUĞU — tipografi değil, yalnız boşluk.
 *
 * 2026-09-05: tipografi ortak `ui/SectionHeader`in `title` varyantına taşındı.
 * Bu dosyada üç kez ayrı tanımlanıp ayrışmıştı; repo genelinde ise DÖRDÜNCÜ
 * rakip tanımdı (`settings/page.tsx` ikisini birden taşıyordu). Geriye kalan
 * tek şey konsola özgü: `Card` kasten dolgusuzdur, o yüzden başlık kendi yatay
 * oluğunu taşır ve `DataTable` hücresiyle (10px 14px) hizalı durur.
 */
export const sectionTitlePad: CSSProperties = {
    padding: `12px ${CONSOLE_GUTTER} 8px`,
};

/**
 * Kart içinde ayraç çizgisi olan satır.
 *
 * Yatay dolgu satır kutusunun İÇİNDE kalır, `borderBottom` ise kutunun
 * kenarındadır — yani içerik içeri alınırken ayraç kartın tam genişliğinde
 * kalmaya devam eder. Tablo görünümü korunur.
 */
export function consoleRow(verticalPadding: string): CSSProperties {
    return {
        padding: `${verticalPadding} ${CONSOLE_GUTTER}`,
        borderBottom: "0.5px solid var(--border-secondary)",
    };
}

/** Kart içinde ayraçsız blok içerik (ızgara, paragraf, yığın izi). */
export const cardBody: CSSProperties = {
    padding: `0 ${CONSOLE_GUTTER}`,
};

/** Kartın SON bloğu — alt boşluğu da taşır ki içerik kenarlığa dayanmasın. */
export const cardBodyLast: CSSProperties = {
    padding: `0 ${CONSOLE_GUTTER} ${CONSOLE_GUTTER}`,
};

/**
 * Etiket/değer ızgarası. İki dosyada kopyaydı ve `margin` değerleri
 * ayrışmıştı; dış boşluk artık çağrı yerinin değil, kartın işi.
 *
 * Hücreler kasten ESNER (`align-items` varsayılan `stretch`): hizalama işi
 * `factCell`/`factValue` ikilisine aittir — bkz. oradaki not.
 */
export const factGrid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: "12px",
    margin: 0,
};

/**
 * Etiket/değer hücresi.
 *
 * ÖLÇÜLEN KUSUR: iki satıra kırılan bir etiket (örn. "Developer allowlist
 * (INTERNAL_OPERATOR_EMAILS)") kendi değerini aşağı itiyordu — aynı ızgara
 * satırındaki durumlar 610px'e karşı 627px'te duruyordu.
 *
 * Izgaraya `align-items: start` vermek bunu ÇÖZMEZ: kayma hücreler arasında
 * değil, hücrenin İÇİNDE. Hücre satır yüksekliğine esner (`height: 100%`) ve
 * değer `marginTop: auto` ile alta sabitlenir → etiket kaç satır sürerse
 * sürsün, satırdaki tüm değerler aynı taban çizgisine oturur.
 */
export const factCell: CSSProperties = {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    height: "100%",
};

/** Hücrenin değer satırı — `factCell` içinde alta yaslanır. */
export const factValue: CSSProperties = { margin: 0, marginTop: "auto" };

/**
 * Uzun tek değerler (user-agent gibi) için tam satır genişliği.
 * `auto-fill` boş kolonları koruduğu için 7. hücre 190px'lik tek bir yolda
 * sıkışıp 7 satıra kırılıyor, sağında 1019px boş kalıyordu.
 */
export const factWide: CSSProperties = { gridColumn: "1 / -1" };

/**
 * `<dt>` etiketi. Konsolda satır içi yazılmıştı (11px/450) — uygulamanın
 * kanonik form etiketi ise 11px/600. Aynı yardımcıya bağlanır ki geri
 * kaymasın.
 */
export function factLabel(): CSSProperties {
    return { ...sharedLabelStyle(), marginBottom: "3px" };
}
