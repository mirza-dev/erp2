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

/** Özellikler — ikisi büyük ve gerçek ekran görüntülü, üçü küçük kart.
 *  Stok özelliği burada yok: sayfanın kalbi olan `#rezervasyon` bloğu onu anlatır. */
export const featuresBig = [
    {
        icon: FileText,
        kicker: "Teklif",
        title: "Teklif → PDF → e-posta, tek ekrandan",
        desc: "Antetli, iki dilli teklifi hazırla; müşteriye PDF eki olarak gönder. Gönderildiği an stok rezerve olur, kabul edilince sipariş onaylanır. Revizyonlar zincir hâlinde saklanır — hangi sürümün gönderildiği hep bellidir.",
        shot: { src: "/shots/teklif.png", alt: "Roven teklif detay ekranı: satıcı anteti, müşteri bilgisi ve teklif künyesi" },
    },
    {
        icon: Bell,
        kicker: "Uyarılar",
        title: "Riskler takvimde, sen fark etmeden önce",
        desc: "Kritik stok, geciken sevkiyat, süresi dolan teklif, vadesi geçen satın alma — dokuz kural tabanlı uyarı tipi tek takvimde. Kendi notunu ve hatırlatmanı da aynı takvime yazarsın.",
        shot: { src: "/shots/uyarilar.png", alt: "Roven uyarı takvimi: ay görünümü ve seçili günün kritik uyarıları" },
    },
];

export const featuresSmall = [
    {
        icon: ScanLine,
        title: "Excel’ini bırak, sistem eşleştirsin",
        desc: "Ürün, cari ve stok listeni sürükle bırak — kolonlar eşleşir, eşleşmeyi bir kez onaylarsın, sistem hatırlar. Yapay zeka anahtarı tanımlıysa PDF ve görsel belgeleri de okur.",
    },
    {
        icon: Sparkles,
        title: "Satın alma önerileri",
        desc: "Tüketim hızı, tedarik süresi ve açık siparişlerden neyi ne zaman sipariş etmen gerektiği hesaplanır; tedarikçilerden fiyat toplar, kazananı tek tıkla siparişe çevirirsin.",
    },
    {
        icon: RefreshCw,
        title: "Paraşüt’e hazır",
        desc: "Satış ve alış faturası, tahsilat durumu, stok mutabakatı — Paraşüt bağlantısı hazır, isteğe bağlı açılır. Açıldığında aynı bilgiyi iki kez girmezsin.",
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
    {
        q: "Kaç kullanıcı ekleyebiliriz?",
        a: "Sınır yok. Ücret kullanıcı ya da modül sayısına göre değil, kurulum ve yıllık bakım olarak alınır; ekibiniz büyüdükçe fatura büyümez.",
    },
    {
        q: "Mevcut programımızdan geçebilir miyiz?",
        a: "Evet. Ürün, cari, tedarikçi ve açılış stoğu Excel ile aktarılır — çoğu programın dışa aktarımı bu listeleri verir. Geçmiş sipariş ve fatura göçü Dönüşüm paketinde proje olarak yapılır.",
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

/** Hero — birincil eylem görüşme, demo ikincil (fiyat bandı görüşmeyle kapanır). */
export const hero = {
    eyebrow: "Yapay zeka destekli ERP",
    // " an" bölünmez boşlukla bağlı: yoksa "an," tek başına satıra düşüyordu.
    titleLead: "Teklifi gönderdiğin\u00a0an,",
    titleAccent: "stok ayrılır.",
    sub: "Teklif, sipariş, stok, üretim ve satın alma tek zincirde. Aynı malı iki müşteriye satmak artık mümkün değil — sistem rezervasyonu kendisi yönetir.",
    trust: ["Kurulum bir öğleden sonra", "Kullanıcı başına ücret yok", "Veritabanı size ait"],
    shot: { src: "/shots/dashboard.png", alt: "Roven Genel Bakış ekranı: çeyreklik ciro, açık siparişler, teklif hattı ve stok değeri" },
};

/**
 * Vaka bloğu (`#referans`).
 *
 * KURAL: `named` yalnız pilot işletmenin YAZILI izniyle `true` olur. O güne
 * kadar sayfa firma adı da rakam da basmaz — gerçek bir firma hakkında izinsiz
 * iddia yayınlanmaz. `marketing-landing.test.ts` bunu kilitler: `named:false`
 * iken `company` ve `stats` boş olmalı.
 */
export const proof: {
    named: boolean;
    company: string | null;
    statement: string;
    stats: { value: string; label: string }[];
} = {
    named: false,
    company: null,
    statement:
        "Roven, endüstriyel ürün satan ve üreten bir işletmenin gerçek teklif, sipariş ve stok süreçleriyle birlikte geliştirildi. Her ekran, bir satış ekibinin gün içinde gerçekten yaşadığı bir sorundan çıktı.",
    stats: [],
};

/** Vaka isimsizken yanında duran, ürünün KENDİSİ hakkındaki doğrulanabilir gerçekler. */
export const productFacts = [
    { value: "9", label: "kural tabanlı uyarı tipi" },
    { value: "6", label: "rol, alan bazlı fiyat yetkisi" },
    { value: "1", label: "işletmeye 1 ayrı veritabanı" },
    { value: "0", label: "kullanıcı başına ücret" },
];

/** Vurucu an (`#rezervasyon`) — ürünün tekil mekanizması. */
export const reservationChain = [
    { no: "01", title: "Teklifi gönderdin", desc: "Müşteriye PDF gitti; teklifteki kalemler için bekleyen bir sipariş açıldı." },
    { no: "02", title: "Stok rezerve edildi", desc: "O miktar satılabilir stoktan düştü. Yetmiyorsa eksik kısım açıkça işaretlenir." },
    { no: "03", title: "İkinci satışçı aynı malı göremez", desc: "Başka bir teklif yalnız kalan stoğu görür. Teklif reddedilirse rezervasyon kendiliğinden çözülür." },
];

export const reservationShot = {
    src: "/shots/stok.png",
    alt: "Roven Stok & Ürünler listesi: fiziksel stok, satılabilir miktar, kritik ürünler kırmızı",
    caption: "Stok & Ürünler — “Stok” fiziksel miktar, “Satılabilir” rezervasyonlar düşülmüş hâli. Kırmızı satırlar minimum stoğun altında.",
};

/** Excel'e karşı (`#excel`) — rakip firma adı geçmez; asıl rakip tablo dosyası. */
export const excelRows = [
    { excel: "Aynı stoğu iki kişi aynı anda satabilir", roven: "Teklif gönderilince stok rezerve olur" },
    { excel: "Kim, ne zaman değiştirdi belli değil", roven: "Her değişiklik kimin yaptığıyla kayıtlı" },
    { excel: "Teklif revizyonu = yeni bir dosya", roven: "Revizyon zinciri; hangi sürüm gönderildi belli" },
    { excel: "Fiyatı dosyayı açan herkes görür", roven: "Fiyat ve maliyet yetkisi olmayana hiç gönderilmez" },
    { excel: "Yedek = birinin masaüstü", roven: "Günlük yedek; geri yükleme prova edildi" },
];

/** Neden Roven (`#neden`) — üç YAPISAL fark (özellik değil, model). */
export const whyPoints = [
    {
        title: "Kullanıcı başına ücret yok",
        desc: "Kurulum bir kez, bakım yılda bir. Ekibe yeni kişi katıldığında ya da yeni bir modül açtığınızda fatura değişmez.",
    },
    {
        title: "Veritabanı sizin adınıza açılır",
        desc: "Her işletme için ayrı bir veritabanı kurulur; başka bir firmayla aynı tabloyu paylaşmazsınız. Tam yedeğiniz her zaman alınabilir.",
    },
    {
        title: "Kurulum bir öğleden sonra",
        desc: "Elinizdeki Excel listeleriyle. Kurulum paneli adımları sırayla gösterir; aylar süren bir devreye alma projesi değil.",
    },
];

/**
 * Sınırlar (`#sinirlar`) — her madde "ama şu var" ile dengelenir.
 * Paraşüt dili §1.5: "hazır, isteğe bağlı açılır" — asla otomatik akış vaadi.
 */
export const limits = [
    {
        no: "e-Fatura ve e-Arşiv kesmez.",
        but: "Fatura Paraşüt’e gönderilir, e-belge orada kesilir — bağlantı hazır, isteğe bağlı açılır.",
    },
    {
        no: "Resmî muhasebe ve beyanname yapmaz.",
        but: "Mali müşavirinizin işini almıyoruz; ona temiz, eksiksiz veri veriyoruz.",
    },
    {
        no: "App Store’da değil.",
        but: "Telefonun ana ekranına uygulama gibi eklenir; tüm ekranlar mobilde çalışır.",
    },
    {
        no: "Sınırsız özelleştirme değil.",
        but: "Özel alan ve rapor tasarımı Dönüşüm paketinde, proje olarak yapılır.",
    },
];
