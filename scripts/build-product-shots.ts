/**
 * Landing için GERÇEK ürün ekran görüntülerini üretir (`public/shots/*.png`).
 *
 * ── Neden bu script var ───────────────────────────────────────────────────
 * Landing'in hero'su bugüne kadar CSS ile ÇİZİLMİŞ bir panel gösteriyordu
 * (`rv-window` + `mockOrders`). Çizim olduğu belli olan bir görsel, 85.000 TL'lik
 * bir kurulum satışında ürünün var olduğuna dair şüphe bırakır. Vitrin artık
 * çalışan sistemin kendi ekranını gösteriyor.
 *
 * ── Neden "gerçek veri sızmasın" politikasını DEĞİŞTİRİYOR ────────────────
 * `scripts/build-og-image.ts` bugüne kadar "görselde ürün ekranı YOK (gerçek
 * veri sızmasın)" diyordu ve manifest `screenshots` alanı tam bu yüzden
 * atlanmıştı. O gerekçe hâlâ geçerli — DEĞİŞEN, artık sızmayı yapısal olarak
 * engelleyen bir mekanizmamızın olması: çekimden önce veritabanındaki firma
 * adları kurgusal adlarla değiştiriliyor (`neutralizeNames`).
 *
 * Somut risk ölçüldü: `src/lib/seed/seed-data.ts` GERÇEK firma adları taşıyor
 * — Tüpraş İzmit Rafinerisi, Abdi İbrahim İlaç A.Ş., Enerjisa, Ülker, Star
 * Rafineri, China Langge Valve. Bu adların göründüğü bir ekran görüntüsünü
 * yayınlamak, o firmaların Roven müşterisi olduğu İDDİASI anlamına gelir.
 * Yayınlanamaz — ve bir insanın "bu sefer bakarım" demesine bırakılamaz.
 *
 * ── Kapı: FAIL-CLOSED, kaçış yok ──────────────────────────────────────────
 * Bu script veritabanına YAZAR. `src/lib/env-target.ts`'teki `isProdTarget`
 * bilinçli olarak fail-closed DEĞİLDİR (tanınmayan hedef prod sayılmaz) ve o
 * kural okuma-ağırlıklı kapı için doğrudur; YAZAN bir script için yanlıştır:
 * tanınmayan bir URL pekâlâ başka bir müşterinin canlı kurulumu olabilir ve
 * orada cari adlarını ezmek geri alınamaz. Bu yüzden burada kapı ters çevrili:
 * yalnız `127.0.0.1`/`localhost` KABUL edilir, geri kalan her şey reddedilir.
 * `ALLOW_PROD_TARGET` bu script için TANINMAZ.
 *
 * Kullanım:
 *   1) yerel Supabase ayakta olmalı (colima + supabase start)
 *   2) ayrı bir kabukta: npm run dev
 *   3) npm run shots
 *
 * Bayraklar:
 *   --check   yalnız ortamı ve satır sayılarını raporlar, hiçbir şey yazmaz
 *   --keep-names   ad değiştirmeyi ATLAR (yalnız yerel inceleme için;
 *                  çıktı YAYINLANAMAZ, script bunu ekrana basar)
 *
 * İsteğe bağlı: PLAYWRIGHT_CHROMIUM_PATH=<chrome-headless-shell yolu>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

// .env.local'ı elle yükle (backup.ts / check-migrations.ts deseni — dotenv yok)
const ROOT = process.cwd();
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

const OUT_DIR = join(ROOT, "public", "shots");
// `SHOTS_APP_URL` önce gelir: geliştirme sunucusu 3000 doluyken başka bir
// portta koşuyor olabilir ve `.env.local`daki NEXT_PUBLIC_APP_URL uygulamanın
// KENDİ bağlantı üretimi için kullanılıyor — onu çekim uğruna değiştirmek
// e-posta/paylaşım linklerini sessizce bozardı.
const APP_URL =
    process.env.SHOTS_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const EMAIL = process.env.E2E_USER_EMAIL ?? "";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "";

const CHECK_ONLY = process.argv.includes("--check");
const KEEP_NAMES = process.argv.includes("--keep-names");

/* ────────────────────────────────────────────────────────────────────────
   Kurgusal adlar
   ────────────────────────────────────────────────────────────────────────
   Kaynak: landing'in kendi hero mock'unda zaten kullanılan ve kodda
   "tamamen kurgusaldır (gerçek müşteri DEĞİL)" diye işaretli adlar. Aynı
   dizinin burada da kullanılması bilinçli: vitrindeki çizim ile vitrindeki
   fotoğraf aynı kurgusal evreni göstersin, ziyaretçi ikisi arasında geçerken
   isim değişimi görmesin.

   Adlar bilerek COĞRAFİ + JENERİK: bir marka taklidi değil, "bir işletme"
   izlenimi verirler. Kiracı firma adı "Örnek …" ile başlıyor — kurgusal
   olduğu okunduğu anda anlaşılsın diye.
*/
const FICTIONAL_COMPANY = "Örnek Makine San. ve Tic. A.Ş.";

const FICTIONAL_CUSTOMERS = [
    "Anadolu Makine A.Ş.",
    "Ege Mobilya Sanayi",
    "Marmara Gıda Dağıtım",
    "Toros Ambalaj Ltd.",
    "Karadeniz Tekstil A.Ş.",
    "Akdeniz Metal San.",
    "Trakya Otomotiv Ltd.",
    "İç Anadolu Plastik",
    "Söğüt Endüstri Ltd.",
    "Meriç Kimya San.",
];

const FICTIONAL_VENDORS = [
    "Kuzey Döküm Ltd.",
    "Batı Rulman San.",
    "Doğu Metal Ticaret",
    "Asya Vana Teknoloji Co.",
    "Merkez Hırdavat Ltd.",
    "Yamaç Çelik San.",
];

/**
 * Yayınlanan görselde ASLA görünmemesi gereken adlar.
 *
 * `seed-data.ts`'ten birebir alındı. Burada ikinci kez yazılmaları bilinçli:
 * seed dosyası değişse bile bu liste bir DENETİM kaydıdır — "şu adlar bir kez
 * veritabanındaydı" bilgisini taşır. `marketing-landing.test.ts` bu listeyi
 * `public/shots/` dosya adlarına ve `page.tsx`e karşı kilitler.
 */
export const FORBIDDEN_REAL_NAMES = [
    "Tüpraş",
    "Abdi İbrahim",
    "Enerjisa",
    "Ülker",
    "Star Rafineri",
    "Botaş",
    "Langge",
    "Bulonsan",
    "PMT",
    "pmtendustriyel",
    // ASCII yazımlar — e-posta ve alan adlarında diakritik düşer
    // (`malzeme@botas.example.com` ilk denetimden geçip görsele düşmüştü).
    "botas",
    "tupras",
    "ulker",
    "abdibrahim",
    "starrafineri",
];

/** Yasak listesiyle karşılaştırma: büyük/küçük harften bağımsız. */
export function containsForbiddenName(text: string): boolean {
    const low = text.toLowerCase();
    return FORBIDDEN_REAL_NAMES.some((bad) => low.includes(bad.toLowerCase()));
}

/* ────────────────────────────────────────────────────────────────────────
   Kapı
   ──────────────────────────────────────────────────────────────────────── */

/** Hedef YEREL mi? Fail-closed: yalnız loopback kabul edilir. */
function isLocalSupabase(url: string): boolean {
    return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(url.trim());
}

function assertLocalTarget(): void {
    if (!SUPABASE_URL || !SERVICE_KEY) {
        fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
    }
    if (!isLocalSupabase(SUPABASE_URL)) {
        fail(
            `hedef YEREL DEĞİL: ${SUPABASE_URL}\n\n` +
                "Bu script cari ve tedarikçi ADLARINI DEĞİŞTİRİR — geri alınamaz.\n" +
                "Yalnız 127.0.0.1 / localhost üzerindeki yerel Supabase'e izin verilir.\n" +
                "ALLOW_PROD_TARGET bu script için tanınmaz.",
        );
    }
}

function fail(msg: string): never {
    console.error(`\n[shots] ❌ ${msg}\n`);
    process.exit(1);
}

/* ────────────────────────────────────────────────────────────────────────
   Supabase REST
   ──────────────────────────────────────────────────────────────────────── */

async function rest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
        },
    });
    if (!res.ok) {
        throw new Error(`REST ${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
}

async function countRows(table: string): Promise<number> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            Prefer: "count=exact",
            Range: "0-0",
        },
    });
    const range = res.headers.get("content-range") ?? "";
    const total = Number(range.split("/")[1]);
    return Number.isFinite(total) ? total : 0;
}

/**
 * Firma/cari/tedarikçi adlarını kurgusal adlarla değiştirir.
 *
 * Sıralama `created_at` ile SABİTLENİR: çekim iki kez koşarsa aynı cari aynı
 * kurgusal adı alsın. Sırasız bir listede PostgREST sırayı garanti etmez ve
 * görseller arasında ad kayması olurdu (aynı sipariş, farklı müşteri adı).
 */
async function neutralizeNames(): Promise<void> {
    // Firma künyesi: ad + iletişim. E-posta/web adresi de gerçek firmaya
    // işaret ediyordu (`info@pmtendustriyel…`, `pmtendustriyel.com.tr`) ve
    // Ayarlar ile teklif belgesinde görünür.
    const company = await rest<{ id: string }[]>("company_settings?select=id&limit=1");
    if (company.length > 0) {
        await rest(`company_settings?id=eq.${company[0].id}`, {
            method: "PATCH",
            body: JSON.stringify({
                name: FICTIONAL_COMPANY,
                email: "info@ornekmakine.example.com",
                website: "https://www.ornekmakine.example.com",
            }),
        });
    }

    // Cariler — id → yeni ad eşlemesi TUTULUR, çünkü teklif ve siparişler
    // müşteri adını DONMUŞ KOPYA olarak da taşıyor (aşağıya bak).
    const customers = await rest<{ id: string }[]>(
        "customers?select=id&order=created_at.asc,id.asc",
    );
    const newCustomerName = new Map<string, string>();
    for (let i = 0; i < customers.length; i++) {
        const base = FICTIONAL_CUSTOMERS[i % FICTIONAL_CUSTOMERS.length];
        // Aynı kurgusal ad ikinci kez düşerse ayırt edilebilir kalsın.
        const suffix =
            i >= FICTIONAL_CUSTOMERS.length ? ` ${Math.floor(i / FICTIONAL_CUSTOMERS.length) + 1}` : "";
        const name = `${base}${suffix}`;
        newCustomerName.set(customers[i].id, name);
        await rest(`customers?id=eq.${customers[i].id}`, {
            method: "PATCH",
            body: JSON.stringify({ name }),
        });
    }

    await neutralizeFrozenSnapshots(newCustomerName);

    const vendors = await rest<{ id: string }[]>("vendors?select=id&order=created_at.asc,id.asc");
    for (let i = 0; i < vendors.length; i++) {
        const name = FICTIONAL_VENDORS[i % FICTIONAL_VENDORS.length];
        const suffix = i >= FICTIONAL_VENDORS.length ? ` ${Math.floor(i / FICTIONAL_VENDORS.length) + 1}` : "";
        await rest(`vendors?id=eq.${vendors[i].id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: `${name}${suffix}` }),
        });
    }

    console.log(
        `[shots] adlar kurgusallaştırıldı — 1 firma · ${customers.length} cari · ${vendors.length} tedarikçi`,
    );
}

/**
 * Teklif ve siparişlerdeki DONMUŞ künye kopyalarını da kurgusallaştırır.
 *
 * Bu adım ilk yazımda YOKTU ve eksikliği ancak görsele bakınca çıktı: teklif
 * detayı ekranında belgenin başlığında "PMT Endüstriyel Vana San. ve Tic.
 * A.Ş." + gerçek adres + gerçek VKN, müşteri alanında da "Tüpraş İzmit
 * Rafinerisi" duruyordu — oysa `customers` ve `company_settings` çoktan
 * yeniden adlandırılmıştı.
 *
 * Sebebi tasarım gereği: teklif bir BELGEdir, gönderildiği andaki künyeyi
 * kendi satırında dondurur (`seller_*`, `customer_*`). Cari kartını sonradan
 * düzeltmek geçmiş belgeyi değiştirmemeli — doğru davranış, ama bir
 * "adları temizledim" adımı için görünmez bir ikinci kopya demek.
 *
 * Ders, script sınırının ötesinde: "veriyi anonimleştirdim" demek, canlı
 * tabloyu anonimleştirmek DEĞİLDİR; belgelerin kendi kopyaları da sayılır.
 */
async function neutralizeFrozenSnapshots(newCustomerName: Map<string, string>): Promise<void> {
    const SELLER = {
        seller_name: FICTIONAL_COMPANY,
        seller_email: "info@ornekmakine.example.com",
        seller_website: "https://www.ornekmakine.example.com",
        seller_address: "Organize Sanayi Bölgesi 5. Cadde No:12, Ankara",
        seller_phone: "+90 312 000 00 00",
        seller_tax_id: "1234567890",
    };

    // Satıcı künyesi TÜM tekliflerde aynı — tek toplu PATCH yeter.
    await rest("quotes?id=not.is.null", { method: "PATCH", body: JSON.stringify(SELLER) });

    const FALLBACK = "Bağlantısız Cari";
    let patched = 0;

    for (const table of ["quotes", "sales_orders"] as const) {
        const rows = await rest<{ id: string; customer_id: string | null }[]>(
            `${table}?select=id,customer_id`,
        ).catch(() => null);
        if (!rows) continue; // kolon yoksa sessizce atla (şema ileride değişebilir)

        for (const row of rows) {
            const name = (row.customer_id && newCustomerName.get(row.customer_id)) || FALLBACK;
            await rest(`${table}?id=eq.${row.id}`, {
                method: "PATCH",
                body: JSON.stringify({ customer_name: name }),
            });
            patched++;
        }
    }
    console.log(`[shots] donmuş künye temizlendi — satıcı + ${patched} belge müşteri adı`);
}

/**
 * E2E/test artığı ürünleri PASİFE alır.
 *
 * Yerel veritabanı E2E koşumlarının kalıntısını taşıyor: `E2E-MIN-1789635943059`,
 * `TEST-1789644121475` gibi SKU'lar ve "Test Ürünü …" adları. Bunlar ürün
 * listesinde ve uyarı panelinde görünüyor — vitrinde "yarım kurulmuş sistem"
 * izlenimi veriyorlar.
 *
 * SİLMEK yerine PASİFE alınıyor: ürünler sipariş/teklif satırlarına FK ile
 * bağlı, silmek ya patlar ya da geçmişi bozar. Liste varsayılan olarak yalnız
 * aktifleri gösterir (`products/page.tsx` "Pasifleri göster" filtresi), yani
 * pasife almak vitrinden düşürmek için yeterli ve geri alınabilir.
 */
async function hideTestArtifacts(): Promise<void> {
    const patterns = ["sku.like.E2E-*", "sku.like.TEST-*", "name.like.*Test *", "name.like.*E2E*"];
    const before = await rest<{ id: string }[]>(
        `products?select=id&is_active=eq.true&or=(${patterns.join(",")})`,
    );
    if (before.length === 0) return;
    await rest(`products?or=(${patterns.join(",")})`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
    });
    console.log(`[shots] ${before.length} test artığı ürün pasife alındı`);
}

/**
 * Satılabilir stoğu NEGATİF olan ürünlerin fiziksel stoğunu açığı kapatacak
 * kadar artırır.
 *
 * Negatif "satılabilir" ürünün gerçek bir bulgusu: rezerve + taslak teklif
 * fiziksel stoğu aşmış, sistem bunu gizlemiyor (`promisable` bilerek
 * `Math.max`süz — bkz. CLAUDE.md stok modeli). Ama vitrinde "-2" bir hata
 * gibi okunur; ziyaretçi modeli bilmez. Sıfıra çekiyoruz, üstüne çıkmıyoruz:
 * satır kritik (≤ min stok) kalır, "3 kritik" rozeti ve kırmızı hikâye
 * korunur. Uyarı taramasından ÖNCE koşar ki uyarılar aynı stoğu görsün.
 *
 * `quoted` hesabı `dbGetQuotedQuantities` ile birebir: yalnız DRAFT sipariş
 * satırları (pending zaten `reserved`da — çift düşmesin).
 */
async function topUpNegativeStock(): Promise<void> {
    const lines = await rest<{ product_id: string; quantity: number }[]>(
        "order_lines?select=product_id,quantity,sales_orders!inner(commercial_status)&sales_orders.commercial_status=eq.draft",
    );
    const quoted = new Map<string, number>();
    for (const l of lines) quoted.set(l.product_id, (quoted.get(l.product_id) ?? 0) + l.quantity);

    const products = await rest<{ id: string; sku: string; on_hand: number; reserved: number }[]>(
        "products?select=id,sku,on_hand,reserved&is_active=eq.true",
    );
    let fixed = 0;
    for (const p of products) {
        const promisable = p.on_hand - p.reserved - (quoted.get(p.id) ?? 0);
        if (promisable >= 0) continue;
        await rest(`products?id=eq.${p.id}`, {
            method: "PATCH",
            body: JSON.stringify({ on_hand: p.on_hand - promisable }),
        });
        fixed++;
    }
    if (fixed > 0) console.log(`[shots] ${fixed} üründe negatif satılabilir sıfıra çekildi`);
}

/**
 * Liste önbelleklerini uygulamanın KENDİ yolundan düşürür.
 *
 * `/api/customers`, `/api/products`, `/api/vendors` `unstable_cache` ile
 * 30–60 sn önbelleklenir. Yukarıdaki PostgREST yazmaları veritabanını
 * değiştirir ama etiketi düşürmez; ikinci koşumda teklif formunun cari
 * listesi bir ÖNCEKİ koşunun bayat e-postasını (`…@botas…`) gösterdi —
 * veritabanı temizken. Firma adı için uygulanan çözümün aynısı: kayıt
 * kendi adıyla uygulama üzerinden PATCH'lenir → route `revalidateTag`.
 *
 * İkinci incelik: bu dalda `revalidateTag(tag, "max")` SWR modunda çalışır —
 * etiket düşünce İLK okuma hâlâ bayat döner ve arka planda tazeler. Bu yüzden
 * her liste iki kez okunur, arada kısa bekleme. Görselin doğruluğu bu
 * ayrıntıya bağlı; "PATCH attım, tazedir" varsayımı yetmedi.
 */
async function bumpListCaches(page: Page): Promise<void> {
    const targets: { list: string; item: string; pick: string }[] = [
        { list: "/api/customers", item: "/api/customers", pick: "customers?select=id,name&limit=1" },
        { list: "/api/products?all=1", item: "/api/products", pick: "products?select=id,name&is_active=eq.true&limit=1" },
        { list: "/api/vendors", item: "/api/vendors", pick: "vendors?select=id,name&limit=1" },
    ];
    for (const t of targets) {
        const [row] = await rest<{ id: string; name: string }[]>(t.pick);
        if (!row) continue;
        const res = await page.request.patch(`${APP_URL}${t.item}/${row.id}`, { data: { name: row.name } });
        if (!res.ok()) console.warn(`[shots] ⚠️  ${t.item} önbellek düşürme HTTP ${res.status()}`);
        await page.request.get(`${APP_URL}${t.list}`);
        await page.waitForTimeout(1_200);
        await page.request.get(`${APP_URL}${t.list}`);
    }
    console.log("[shots] liste önbellekleri düşürüldü — cari · ürün · tedarikçi");
}

/**
 * Uyarıları sıfırlar ki tarama temiz bir kümeden üretsin.
 *
 * Pasife alınan test ürünleri için ESKİ uyarılar hâlâ duruyor olabilir ve
 * takvimde "Test Ürünü TEST-…" diye görünür. Uyarılar türetilmiş veridir —
 * silmek bilgi kaybı değil, bir sonraki tarama hepsini yeniden üretir.
 */
async function resetAlerts(): Promise<void> {
    await rest("alerts?id=not.is.null", { method: "DELETE" });
}

/**
 * Uyarı yoksa taramayı tetikler.
 *
 * Seed uyarıları INSERT ETMEZ (bilinçli: kural motoru onları verinin kendisinden
 * üretmeli, yoksa vitrindeki uyarı "elle yazılmış" olurdu). Bu yüzden taze bir
 * veritabanında `alerts` boştur ve uyarı takvimi ekranı bomboş çıkar.
 */
async function ensureAlerts(): Promise<void> {
    if ((await countRows("alerts")) > 0) return;
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.warn("[shots] ⚠️  CRON_SECRET yok — uyarı taraması atlandı, takvim boş çıkabilir");
        return;
    }
    const res = await fetch(`${APP_URL}/api/alerts/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
    });
    console.log(
        `[shots] uyarı taraması → HTTP ${res.status} · şimdi ${await countRows("alerts")} uyarı`,
    );
}

/**
 * Serbest metin alanlarındaki gerçek firma adlarını süpürür.
 *
 * Yapılandırılmış alanları (ad, e-posta, künye) temizlemek YETMEDİ: doğrulama
 * teslim şartlarında ve notlarda kalıntı buldu — "EXWORKS PMT İstanbul Depo
 * teslim", "İSTANBUL PMT DEPO TESLİMİ", "fabrika@pmtendustriyel.example.com".
 * Bunlar ne cari adı ne künye; operasyonun gündelik metinleri, ve firma adı
 * onların içine gömülü.
 *
 * Bu yüzden son adım kolon adına DEĞİL içeriğe bakar: her tablo, her metin
 * kolonu, yasak dize varsa değiştir. Uzun eşleşme önce denenir ("Tüpraş İzmit
 * Rafinerisi" → tek kurgusal ad; yalnız "Tüpraş" kalırsa o da düşer).
 */
const TEXT_REPLACEMENTS: [RegExp, string][] = [
    [/PMT Endüstriyel Vana San\. ve Tic\. A\.Ş\./gi, FICTIONAL_COMPANY],
    [/PMT Endüstriyel/gi, "Örnek Makine"],
    [/pmtendustriyel/gi, "ornekmakine"],
    [/pmt\.com\.tr/gi, "ornekmakine.example.com"],
    [/Tüpraş İzmit Rafinerisi/gi, "Anadolu Makine A.Ş."],
    [/Abdi İbrahim İlaç A\.Ş\./gi, "Ege Mobilya Sanayi"],
    [/Enerjisa Üretim Santralleri/gi, "Marmara Gıda Dağıtım"],
    [/Star Rafineri A\.Ş\./gi, "Karadeniz Tekstil A.Ş."],
    [/China Langge Valve Technology Co\., Ltd/gi, "Asya Vana Teknoloji Co."],
    // E-posta/alan adı biçimleri ÖNCE — görünen-ad kalıbı adrese boşluk sokmasın.
    [/@bulonsan/gi, "@kuzeydokum"],
    [/@langge-valve/gi, "@asyavana"],
    [/@langge/gi, "@asyavana"],
    [/Tüpraş/gi, "Anadolu Makine"],
    [/Abdi İbrahim/gi, "Ege Mobilya"],
    [/Enerjisa/gi, "Marmara Gıda"],
    [/Star Rafineri/gi, "Karadeniz Tekstil"],
    [/Botaş/gi, "Akdeniz Metal"],
    [/Ülker/gi, "Toros Ambalaj"],
    [/Langge/gi, "Asya Vana"],
    [/Bulonsan/gi, "Kuzey Döküm"],
    // ASCII e-posta/alan adı kalıntıları (diakritiksiz).
    [/botas/gi, "akdenizmetal"],
    [/tupras/gi, "anadolumakine"],
    [/ulker/gi, "torosambalaj"],
    [/abdibrahim/gi, "egemobilya"],
    [/starrafineri/gi, "karadeniztekstil"],
    [/enerjisa/gi, "marmaragida"],
    // En sona: yalın "PMT" hâlâ kalmışsa (kısaltma olarak gömülü).
    [/\bPMT\b/gi, "Örnek Makine"],
];

/** Yazılamayacak kolonlar — anahtarlar ve veritabanının kendi zaman damgaları. */
const UNWRITABLE = new Set(["id", "created_at", "updated_at", "quote_number", "order_number"]);

const SWEPT_TABLES = [
    "customers",
    "vendors",
    "company_settings",
    "quotes",
    "sales_orders",
    "quote_line_items",
] as const;

async function sweepForbiddenText(): Promise<void> {
    let changed = 0;
    for (const table of SWEPT_TABLES) {
        const rows = await rest<Record<string, unknown>[]>(`${table}?select=*`).catch(() => null);
        if (!rows) continue;

        for (const row of rows) {
            const patch: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
                if (typeof value !== "string" || UNWRITABLE.has(key)) continue;
                let next = value;
                for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
                    next = next.replace(pattern, replacement);
                }
                if (next !== value) patch[key] = next;
            }
            if (Object.keys(patch).length === 0) continue;

            await rest(`${table}?id=eq.${row.id}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            }).catch((err) => {
                console.warn(`[shots] ⚠️  ${table}/${row.id} güncellenemedi: ${String(err).slice(0, 120)}`);
            });
            changed++;
        }
    }
    console.log(`[shots] serbest metin süpürüldü — ${changed} satır`);
}

/** Değiştirdikten sonra gerçek ad KALMADIĞINI doğrular (kapının kanıtı). */
async function assertNoRealNames(): Promise<void> {
    const values: string[] = [];
    const collect = (rows: Record<string, unknown>[]) => {
        for (const row of rows) {
            for (const v of Object.values(row)) if (typeof v === "string") values.push(v);
        }
    };

    // `select=*`: kolon kolon saymak yerine HER metin kolonu taranır.
    // İlk yazım kolonları elle sayıyordu ve iki kez yanıldı — `vendors.email`
    // yok diye patladı, `quotes.seller_*` ise hiç listeye alınmamıştı ve
    // gerçek firma künyesi doğrulamadan geçip görsele düştü. Bir denetimin
    // kapsamı, denetçinin hatırladığı kolonlar kadar olmamalı.
    for (const table of ["customers", "vendors", "company_settings", "quotes", "sales_orders"]) {
        collect(await rest<Record<string, unknown>[]>(`${table}?select=*`));
    }

    const hits = values.filter(containsForbiddenName);
    if (hits.length > 0) {
        fail(`gerçek firma adı hâlâ veritabanında: ${[...new Set(hits)].join(", ")}`);
    }
    console.log("[shots] doğrulandı — cari/tedarikçi/firma adlarında gerçek firma yok");
}

/* ────────────────────────────────────────────────────────────────────────
   Playwright
   ──────────────────────────────────────────────────────────────────────── */

const VIEWPORT = { width: 1440, height: 900 };

interface Shot {
    file: string;
    /** Rota; `:quoteId` gibi yer tutucular `resolveRoute` ile doldurulur. */
    route: string;
    /** Çekimden önce görünür olması beklenen seçici (veri yüklendi kanıtı). */
    settle?: string;
    /** Çekimden önce sayfada yapılacak hazırlık (sekme seç, bant kapat…). */
    prepare?: (page: Page) => Promise<void>;
    label: string;
}

const SHOTS: Shot[] = [
    {
        file: "dashboard.png",
        route: "/dashboard",
        settle: "main h1",
        label: "Genel Bakış",
        // Bugün 18 Eylül; Eylül'de henüz sipariş yok, bu yüzden "Ay" seçiliyken
        // Aylık Ciro ve Bu Ay Üretim "—" gösteriyor. Boş bir KPI vitrinde
        // ürünü işe yaramaz gösterir. "Çeyrek" (Tem–Eyl) veriyi kapsıyor.
        prepare: async (page) => {
            await page
                .getByRole("button", { name: "Çeyrek", exact: true })
                .click({ timeout: 10_000 })
                .catch(() => console.warn('[shots] ⚠️  "Çeyrek" segmenti bulunamadı'));
            await page.waitForTimeout(600);
        },
    },
    {
        file: "stok.png",
        route: "/dashboard/products",
        settle: "table tbody tr",
        label: "Stok & Ürünler",
    },
    {
        file: "teklif.png",
        route: "/dashboard/quotes/:quoteId",
        settle: "main h1",
        label: "Teklif detayı",
        // Form yüklenince müşteri alanı odak alıyor ve öneri listesi açık
        // kalıyor — ilk çekimde liste belgenin üstünü örtmüştü. Gerçek bir
        // kullanıcı gibi: Escape + odağı bırak.
        prepare: async (page) => {
            await page.keyboard.press("Escape").catch(() => {});
            await page.evaluate(() => {
                const el = document.activeElement;
                if (el instanceof HTMLElement) el.blur();
            });
            await page.waitForTimeout(300);
        },
    },
    {
        file: "uyarilar.png",
        route: "/dashboard/alerts",
        settle: "main h1",
        label: "Uyarı takvimi",
        // AI anahtarı tanımlı olmadığı için sayfa "AI servisi yapılandırılmamış
        // (ANTHROPIC_API_KEY gerekli)" bandını açıyor. Bant DOĞRU — kural
        // tabanlı uyarılar AI'sız da çalışıyor, mesaj tam bunu söylüyor — ama
        // vitrinde bir env değişkeni adı okumak kurulumu yarım gösterir.
        // Gizlemiyoruz, KAPATIYORUZ: bandın kendi kapatma düğmesi, gerçek bir
        // kullanıcının yapacağı şey.
        prepare: async (page) => {
            const close = page.getByRole("button", { name: "Banner'ı kapat" });
            for (let i = 0; i < 3 && (await close.count()) > 0; i++) {
                await close.first().click({ timeout: 5_000 }).catch(() => {});
                await page.waitForTimeout(250);
            }
        },
    },
];

/**
 * Geliştirme sunucusunun kendi katmanlarını gizler.
 *
 * `next dev` sol alt köşeye bir dev göstergesi basar (`nextjs-portal` özel
 * elemanı). Vitrine giden bir görselde "geliştirme modu" rozeti, ürünün
 * canlı olmadığını söyler. Yalnız ÇEKİM bağlamında gizleniyor — uygulamanın
 * kendi kodu değişmiyor.
 */
const HIDE_DEV_CHROME = `
nextjs-portal, #__next-dev-overlay, [data-nextjs-toast], [data-nextjs-dialog-overlay] {
    display: none !important;
}`;

/**
 * Vitrine yakışan teklifi seçer.
 *
 * İlk yazımda "en yeni teklif" alınıyordu ve bu, en yeni kaydın bir E2E
 * artığı olduğu için REDDEDİLMİŞ, 120 TRY tutarında, müşterisi "Test
 * Müşterisi 1789641939002" olan bir belge getirdi. "En yeni" bir kalite
 * ölçütü değil; ölçüt AÇIKÇA yazılıyor:
 *   gönderilmiş/kabul edilmiş · test artığı değil · tutarı en büyük.
 * Reddedilmiş teklif bilerek dışarıda: vitrinde kaybedilmiş bir satış.
 */
async function resolveRoute(route: string): Promise<string> {
    if (!route.includes(":quoteId")) return route;
    const quotes = await rest<{ id: string; customer_name: string; grand_total: number }[]>(
        "quotes?select=id,customer_name,grand_total" +
            "&status=in.(sent,accepted)&order=grand_total.desc&limit=25",
    ).catch(() => [] as { id: string; customer_name: string; grand_total: number }[]);

    const usable = quotes.find((q) => !/test|e2e/i.test(q.customer_name ?? ""));
    if (!usable) {
        console.warn("[shots] ⚠️  uygun teklif bulunamadı — liste sayfası çekilecek");
        return "/dashboard/quotes";
    }
    return route.replace(":quoteId", usable.id);
}

/**
 * Hidrasyonu DOĞRUDAN ölçer — `tests/helpers/nav.ts:waitForHydration` ile aynı
 * sinyal. Oradan import ETMİYORUZ: o dosya `@playwright/test`in `expect`ini
 * çeker ve test koşucusu dışında çağrılması desteklenmiyor. Sinyal tek satır,
 * kopyası kaymasın diye gerekçe burada yazılı: React hidrasyonda sahiplendiği
 * DOM düğümüne `__reactFiber$…` yazar; "kabuk boyandı" ile "olay dinleyicileri
 * bağlandı" arasındaki fark ancak böyle gözlenir.
 */
async function waitForHydration(page: Page, timeout = 30_000): Promise<void> {
    await page.waitForFunction(
        "(() => { const el = document.querySelector('main');" +
            " return !!el && Object.keys(el).some(k => k.startsWith('__react')); })()",
        undefined,
        { timeout, polling: 50 },
    );
}

async function main(): Promise<void> {
    assertLocalTarget();
    console.log(`[shots] hedef: ${SUPABASE_URL} (yerel) · uygulama: ${APP_URL}`);

    const counts = {
        products: await countRows("products"),
        customers: await countRows("customers"),
        quotes: await countRows("quotes"),
        alerts: await countRows("alerts"),
    };
    console.log(
        `[shots] veri — ürün ${counts.products} · cari ${counts.customers} · ` +
            `teklif ${counts.quotes} · uyarı ${counts.alerts}`,
    );
    if (counts.products === 0 || counts.customers === 0) {
        fail(
            "yerel veritabanı boş görünüyor.\n" +
                "Ayarlar › Demo Hazırlık'tan ya da POST /api/seed ile veriyi yükleyin.",
        );
    }

    if (CHECK_ONLY) {
        console.log("[shots] --check: hiçbir şey yazılmadı.");
        return;
    }

    if (KEEP_NAMES) {
        console.warn(
            "[shots] ⚠️  --keep-names: adlar DEĞİŞTİRİLMEDİ. Üretilen görseller " +
                "gerçek firma adı içerebilir ve YAYINLANAMAZ.",
        );
    } else {
        await neutralizeNames();
        await sweepForbiddenText();
        await assertNoRealNames();
    }

    await hideTestArtifacts();
    await topUpNegativeStock();
    await resetAlerts();
    await ensureAlerts();

    if (!EMAIL || !PASSWORD) {
        fail("E2E_USER_EMAIL / E2E_USER_PASSWORD gerekli (.env.local) — giriş yapılamıyor.");
    }

    mkdirSync(OUT_DIR, { recursive: true });

    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
    const browser = await chromium.launch({ executablePath });
    try {
        const context = await browser.newContext({
            viewport: VIEWPORT,
            deviceScaleFactor: 2,
            locale: "tr-TR",
            timezoneId: "Europe/Istanbul",
        });

        // Tema KOYU'ya sabitlenir: landing koyu temaya pinli (marka rehberi
        // §4.4), açık temada çekilmiş bir ekran vitrinde yamalı durur.
        // Anahtar `layout.tsx`in FOUC bootstrap'ıyla aynı: localStorage 'theme'.
        await context.addInitScript(() => {
            try {
                localStorage.setItem("theme", "dark");
            } catch {
                /* private mode — bootstrap zaten koyuya düşer */
            }
        });

        const page = await context.newPage();

        // Giriş — tests/global-setup.ts:23-36 deseni, iki eklemeyle.
        //
        // (1) HİDRASYON BEKLENİR. Giriş formu React'in `onSubmit`ine bağlı;
        //     hidrasyondan önce yapılan tıklama native olayı atar, React
        //     dinleyicisi henüz bağlı olmadığı için hiçbir yere ulaşmaz ve
        //     sayfa sessizce /login'de kalır (bkz. tests/helpers/nav.ts).
        //     Bu script ilk koşumda tam olarak buraya düştü.
        // (2) Başarısızlıkta teşhis basılır: URL + formun kendi hata kutusu.
        //     Aksi hâlde "Timeout 45000ms" kimlik hatasıyla yarış hatasını
        //     ayırt ettirmiyor.
        await page.goto(`${APP_URL}/login`, { waitUntil: "domcontentloaded" });
        await page.locator("main").first().waitFor({ state: "visible", timeout: 45_000 });
        await waitForHydration(page);
        await page.getByLabel(/e-posta/i).fill(EMAIL);
        await page.getByLabel(/şifre/i).fill(PASSWORD);
        await page.getByRole("button", { name: /giriş/i }).click();
        try {
            await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
        } catch {
            const shown = await page
                .locator('[role="alert"], .login-err, .err')
                .first()
                .textContent()
                .catch(() => null);
            fail(
                `giriş başarısız — URL: ${page.url()}\n` +
                    `Ekrandaki mesaj: ${shown?.trim() || "(yok)"}\n` +
                    `Kullanılan hesap: ${EMAIL}\n` +
                    "E2E_USER_EMAIL/PASSWORD yerel veritabanında tanımlı mı?",
            );
        }
        console.log("[shots] giriş yapıldı");

        // Firma adını UYGULAMA ÜZERİNDEN bir kez daha yaz.
        //
        // Neden gerekli: `GET /api/settings/company` `getCachedCompanySettings()`
        // üzerinden SUNUCU ÖNBELLEĞİNDEN okur. Yukarıdaki doğrudan PostgREST
        // yazması veritabanını değiştirir ama o önbelleği haberdar etmez —
        // ilk koşumda pano başlığı eski adı göstermeye devam etti ve bunu
        // ancak görsele bakınca fark ettim. PATCH uygulamanın kendi yolundan
        // geçer, dolayısıyla revalidation da onun kurallarıyla olur.
        if (!KEEP_NAMES) {
            const patch = await page.request.patch(`${APP_URL}/api/settings/company`, {
                data: { name: FICTIONAL_COMPANY },
            });
            console.log(`[shots] firma adı uygulama üzerinden tazelendi — HTTP ${patch.status()}`);
        }

        await bumpListCaches(page);

        for (const shot of SHOTS) {
            const route = await resolveRoute(shot.route);
            await page.goto(`${APP_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
            await page.locator("main").first().waitFor({ state: "visible", timeout: 45_000 });
            await waitForHydration(page);

            if (new URL(page.url()).pathname.startsWith("/login")) {
                fail(`oturum düştü: ${route} istendi, giriş sayfasına düşüldü.`);
            }

            if (shot.settle) {
                await page
                    .locator(shot.settle)
                    .first()
                    .waitFor({ state: "visible", timeout: 30_000 })
                    .catch(() => {
                        console.warn(`[shots] ⚠️  ${shot.file}: "${shot.settle}" görünmedi, yine de çekiliyor`);
                    });
            }

            // Veriye bağlı paneller (SWR) hidrasyondan sonra bir tur daha
            // boyanıyor; sabit kısa bekleme yerine ağın durulmasını bekle.
            await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

            if (shot.prepare) await shot.prepare(page);

            await page.addStyleTag({ content: HIDE_DEV_CHROME });
            const png = await page.screenshot({ type: "png" });
            writeFileSync(join(OUT_DIR, shot.file), png);
            console.log(`[shots] ✓ ${shot.file}  ←  ${route}  (${shot.label})`);
        }
    } finally {
        await browser.close();
    }

    console.log(`\n[shots] tamam — ${SHOTS.length} görsel: public/shots/\n`);
}

main().catch((err) => {
    console.error("\n[shots] ❌ beklenmeyen hata:", err);
    process.exit(1);
});
