/**
 * Landing (src/app/page.tsx) içeriği — metinler, paketler, SSS, yapılandırılmış veri.
 *
 * Neden ayrı dosya: Next route-segment dosyaları (`page.tsx`) yalnız
 * belirli export'lara izin verir; içeriği buradan export etmek testlerin
 * ve JSON-LD üreticisinin aynı diziye bakmasını sağlar. Sayfa yalnız
 * yerleşimi taşır, metin BURADA yaşar.
 *
 * Marka metinleri: docs/brand/roven-marka-rehberi.md §1.3 (vaat ≤ canlı, §1.5).
 * Fiyat: docs/brand/fiyatlandirma-modeli.md §4 — rakamlar değişirse iki yerde
 * birden değişmeli (belge iç kullanım, burası vitrin); test bunu kilitler.
 */

import {
    ScanLine,
    FileText,
    Bell,
    Boxes,
    RefreshCw,
    Sparkles,
} from "lucide-react";

export const modules = [
    "Teklif",
    "Sipariş",
    "Stok",
    "Üretim",
    "Satın Alma",
    "Muhasebe",
    "Uyarılar",
];

export const features = [
    {
        icon: ScanLine,
        title: "Excel’ini Bırak, Sistem Eşleştirsin",
        desc: "Ürün, cari ve stok listeni sürükle bırak — kolonlar otomatik eşleşir, eşleşmeyi bir kez onaylarsın, sistem hatırlar. Yapay zeka anahtarı tanımlıysa PDF ve görsel belgeleri de okur.",
    },
    {
        icon: FileText,
        title: "Teklif → PDF → E-posta",
        desc: "Profesyonel teklifi tek tıkla hazırla, müşteriye PDF olarak gönder. Kabul edilince sipariş ve stok rezervasyonu otomatik oluşur.",
    },
    {
        icon: Boxes,
        title: "Gerçek Zamanlı Stok",
        desc: "Fiziksel stok, rezerve, satılabilir ve yoldaki mal tek bakışta. Aynı stoğu iki kez satma riski yok — sistem rezervasyonu yönetir.",
    },
    {
        icon: Bell,
        title: "Uyarı Takvimi",
        desc: "Kritik stok, geciken sevkiyat, süresi dolan teklif, vadesi gelen satın alma — dokuz uyarı tipi takvimde, sen fark etmeden önce. Kendi notunu ve hatırlatmanı da aynı takvime yazarsın.",
    },
    {
        icon: RefreshCw,
        title: "Paraşüt’e Hazır",
        desc: "Sevk edilen sipariş faturaya, mal kabul alış faturasına, tahsilat durumu panoya — Paraşüt bağlantısı hazır, tek ayarla açılır. Çift veri girişi biter.",
    },
    {
        icon: Sparkles,
        title: "Satın Alma Önerileri",
        desc: "Tüketim hızı, tedarik süresi ve açık siparişlerden neyi ne zaman sipariş etmen gerektiği hesaplanır; tedarikçilerden fiyat toplar, kazananı tek tıkla siparişe çevirirsin.",
    },
];

export const steps = [
    {
        no: "01",
        title: "Belgeni bırak",
        desc: "Ürün listeni, cari listeni ya da açılış stoğunu Excel olarak bırak. Kolonlar eşleşir, sistem geri kalanını halleder.",
    },
    {
        no: "02",
        title: "Sistem işler",
        desc: "Teklif çıkar, stok rezerve et, üretimi planla, faturayı muhasebeye gönder — hepsi tek akışta.",
    },
    {
        no: "03",
        title: "Önde kal",
        desc: "Panel sana ciroyu, riskleri ve fırsatları gösterir. Tahmin etme — gör.",
    },
];

// Hero ürün-mock'unda kullanılan veriler tamamen kurgusaldır (gerçek müşteri DEĞİL).
export const mockOrders = [
    { no: "ORD-2041", name: "Anadolu Makine A.Ş.", status: "Onaylı", tone: "success" },
    { no: "ORD-2040", name: "Ege Mobilya Sanayi", status: "Rezerve", tone: "warning" },
    { no: "ORD-2039", name: "Marmara Gıda Dağıtım", status: "Sevk", tone: "accent" },
    { no: "ORD-2038", name: "Toros Ambalaj Ltd.", status: "Bekliyor", tone: "muted" },
];

export const mockBars = [38, 54, 41, 67, 49, 72, 60, 84];

// Geniş KOBİ konumlandırması (marka rehberi §0/§1.2): sektör örnekleri
// vana/endüstri vurgusundan çıkarıldı; her satır ürünün gerçekten kapsadığı bir
// akışa bağlanır — uydurma vaat yok.
export const sectors = [
    { title: "Üretim atölyeleri", desc: "Reçeteli üretim, hurda/fire kaydı, bileşen stoğu ve eksik listesi." },
    { title: "Toptan ve dağıtım", desc: "Çok para birimli teklif, rezervasyonlu sipariş, sevkiyat ve cari takibi." },
    { title: "İthalat ve tedarik", desc: "Tedarikçi fiyat talepleri, karşılaştırma, satın alma siparişi ve mal kabul." },
    { title: "Proje bazlı iş", desc: "Revizyonlu teklifler, PDF arşiv, teklif geçerlilik takibi ve kabulde otomatik sipariş." },
];

export const faqs = [
    {
        q: "Kurulum ne kadar sürer?",
        a: "Elinizdeki Excel listeleriyle bir öğleden sonra. Kurulum paneli beş adımı sırayla gösterir: ürün tipleri, ürünler, cariler, tedarikçiler, açılış stoğu. Her adımda şablon indirir, doldurur, yüklersiniz.",
    },
    {
        q: "Verilerimiz nerede tutuluyor?",
        a: "Her müşteri için ayrı bir veritabanı kurulur; başka bir işletmeyle aynı tabloyu paylaşmazsınız. Yeni kurulumlar Avrupa Birliği bölgesinde (Frankfurt) açılır; yedekleme ve geri yükleme yordamı prova edilmiştir ve verinizin tam yedeği her zaman alınabilir.",
    },
    {
        q: "Muhasebe programımızla çalışır mı?",
        a: "Paraşüt bağlantısı hazırdır ve tek ayarla açılır: satış faturası, alış faturası, tahsilat durumu ve stok mutabakatı. Başka bir muhasebe programı için hazır bağlantı yoktur.",
    },
    {
        q: "Yapay zeka olmadan çalışır mı?",
        a: "Evet. Kolon eşleştirme, uyarılar ve satın alma önerileri kural tabanlıdır; yapay zeka anahtarı tanımlı değilse sistem sade modda aynı işi yapar. Anahtar tanımlanınca PDF okuma ve yapay zeka bulguları devreye girer.",
    },
    {
        q: "Telefondan kullanılır mı?",
        a: "Evet. Ana ekrana eklenen uygulama gibi açılır; koyu ve aydınlık tema, dokunmaya uygun kontroller ve çevrimdışı uyarısı vardır. Sevkiyat, mal kabul ve üretim kaydı sahadan girilebilir.",
    },
    {
        q: "Kim neyi görür?",
        a: "Altı rol: yönetici, satış, satın alma, üretim, muhasebe, izleyici. Fiyat ve maliyet alanları yetkisi olmayana hiç gönderilmez; her değişiklik kimin yaptığıyla birlikte kayıt altındadır.",
    },
];

/* Fiyat modeli: docs/brand/fiyatlandirma-modeli.md §4. Rakamlar oradan gelir —
   değişirse İKİ yerde birden değişmeli (belge iç kullanım, burası vitrin). */
export const plans = [
    {
        name: "Hızlı Kurulum",
        price: "45.000",
        forWho: "Verisi düzenli, hemen başlamak isteyen",
        featured: false,
        items: [
            "Sistem kurulumu ve devreye alma",
            "Ürün + cari aktarımı (1 Excel)",
            "Logo ve antet",
            "3 saat uzaktan eğitim",
            "30 gün yakın destek",
        ],
    },
    {
        name: "Anahtar Teslim",
        price: "85.000",
        forWho: "Çoğu işletme için doğru başlangıç",
        featured: true,
        items: [
            "Tüm verilerin aktarımı — ürün, cari, tedarikçi, tedarikçi fiyatları, açılış stoğu",
            "Ürün tipleri ve teknik alanlar kurulumu",
            "Teklif ve PDF şablonu firmanıza göre",
            "Rol ve yetki haritası çıkarımı",
            "1 gün yerinde eğitim",
            "90 gün yakın destek",
        ],
    },
    {
        name: "Dönüşüm",
        price: "150.000",
        priceSuffix: "’den",
        forWho: "Mevcut ERP’den geçen, süreci karmaşık",
        featured: false,
        items: [
            "Anahtar Teslim’in tamamı",
            "Mevcut sistemden geçmiş veri göçü",
            "Süreç analizi atölyesi",
            "Özel alan ve rapor tasarımı",
            "2 gün yerinde eğitim",
            "6 ay yakın destek",
        ],
    },
];

/**
 * Yapılandırılmış veri (JSON-LD).
 *
 * Google'ın sayfayı "bir yazılım ürünü" olarak tanıması ve SSS'lerin arama
 * sonucunda açılır madde olarak çıkması için. İçerik SAYFANIN KENDİ
 * dizilerinden türetilir (`faqs`, `plans`) — ikinci bir metin kopyası tutulsaydı
 * sayfa değişince yapılandırılmış veri sessizce yalan söylemeye başlardı ve
 * Google bunu "uyumsuz içerik" olarak cezalandırır.
 *
 * Fiyat `lowPrice` olarak veriliyor: paketler hizmet kapsamına göre değişiyor,
 * tek bir fiyat iddiası yanlış olurdu.
 */
export function buildJsonLd(siteUrl: string) {
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "SoftwareApplication",
                "@id": `${siteUrl}/#software`,
                name: "Roven",
                applicationCategory: "BusinessApplication",
                applicationSubCategory: "ERP",
                operatingSystem: "Web",
                inLanguage: "tr-TR",
                description:
                    "Küçük ve orta ölçekli işletmeler için yapay zeka destekli ERP. " +
                    "Teklif, sipariş, stok, üretim ve satın alma tek akışta.",
                url: siteUrl,
                offers: {
                    "@type": "AggregateOffer",
                    priceCurrency: "TRY",
                    lowPrice: plans[0].price.replace(".", ""),
                    offerCount: plans.length,
                },
                featureList: modules,
            },
            {
                "@type": "Organization",
                "@id": `${siteUrl}/#org`,
                name: "Roven",
                url: siteUrl,
                logo: `${siteUrl}/icons/icon-512.png`,
            },
            {
                "@type": "FAQPage",
                "@id": `${siteUrl}/#faq`,
                mainEntity: faqs.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
            },
        ],
    };
}

export const carePlans = [
    { name: "Temel", price: "24.000", desc: "Barındırma, günlük yedek, güncellemeler, e-posta desteği (2 iş günü)." },
    { name: "Öncelikli", price: "42.000", desc: "Telefon ve WhatsApp desteği, aynı iş günü yanıt, aylık 4 saat uzaktan destek, çeyreklik sağlık kontrolü." },
    { name: "Ortak", price: "72.000", desc: "4 saat yanıt, aylık 8 saat geliştirme kotası, yeni özelliklerde öncelik." },
];
