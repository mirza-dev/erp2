/**
 * Rehber yazıları — arama niyetine göre yazılmış Türkçe içerik.
 *
 * Neden veri, neden MDX değil: üç yazı için bir markdown boru hattı (parser,
 * sözdizimi vurgusu, sanitizasyon) kurmak taşıma maliyeti getirir ve HTML
 * enjeksiyon yüzeyi açar. Blok birliği (`Block`) kapalı bir kümedir; render
 * eden bileşen her bloğu React elemanı olarak basar, `dangerouslySetInnerHTML`
 * KULLANILMAZ. Yazı sayısı 15'i geçerse MDX'e geçmek doğru olur.
 *
 * Metin içi vurgu `**…**` ile yazılır ve `renderInline` bunu `<strong>` React
 * elemanına çevirir — ham HTML DEĞİL. Böylece "içerik verisi" ile "işaretleme"
 * arasındaki sınır korunur: bu dosyaya yazılan hiçbir dize etiket üretemez.
 *
 * İçerik kuralı: her iddia ya ölçülmüş bir kaynağa ya ürünün CANLI davranışına
 * dayanır (marka rehberi §1.5). Kapalı özellik (AI belge okuma, Paraşüt)
 * "yapıyor" diye yazılmaz.
 */

export type Block =
    | { t: "p"; v: string }
    | { t: "ul"; v: string[] }
    | { t: "ol"; v: string[] }
    | { t: "note"; v: string }
    | { t: "table"; head: string[]; rows: string[][] };

export interface Section {
    h: string;
    blocks: Block[];
}

export interface Article {
    slug: string;
    title: string;
    /** Arama sonucunda görünen satır — 150-160 karakter hedefi. */
    description: string;
    /** Listede görünen kısa vaat. */
    teaser: string;
    published: string; // YYYY-MM-DD
    updated: string;
    minutes: number;
    sections: Section[];
}

export const ARTICLES: Article[] = [
    {
        slug: "kobi-erp-fiyatlari",
        title: "KOBİ'ler için ERP fiyatları: 2026'da gerçek maliyet nasıl hesaplanır?",
        description:
            "ERP lisans fiyatı toplam maliyetin yarısı bile değil. Kullanıcı lisansı, bakım, sunucu, kurulum ve veri aktarımı kalemleriyle gerçek bütçe nasıl çıkarılır.",
        teaser:
            "Liste fiyatı ile ödeyeceğiniz para arasındaki fark, çoğu işletmeyi ikinci yıl şaşırtıyor. Altı kalemi tek tek açalım.",
        published: "2026-09-18",
        updated: "2026-09-18",
        minutes: 8,
        sections: [
            {
                h: "Sorun: liste fiyatı bir şey anlatmıyor",
                blocks: [
                    {
                        t: "p",
                        v: "ERP araştırmasına çıkan bir işletme sahibinin ilk karşılaştığı şey bir rakamdır: “5 kullanıcı 25.000 TL.” Bu rakam yanlış değildir ama ödeyeceğiniz paranın tamamı da değildir. İkinci yıl gelen fatura, üçüncü kullanıcıyı eklerken çıkan ek lisans ve sunucu kirası hesaba katılmadığında bütçe ikiye katlanabilir.",
                    },
                    {
                        t: "p",
                        v: "Sağlıklı karşılaştırma tek bir soruyla yapılır: **üç yılda toplam ne ödeyeceğim?** Aşağıdaki altı kalem, o sorunun cevabını oluşturur.",
                    },
                ],
            },
            {
                h: "1. Lisans bedeli — ve kullanıcı sayısı tuzağı",
                blocks: [
                    {
                        t: "p",
                        v: "Türkiye'deki klasik ERP'lerin çoğunda fiyat kullanıcı sayısına bağlıdır. 2026 fiyat listelerine göre Logo Netsis 3 Standard 5 kullanıcı için yaklaşık 25.000 TL/yıl, Enterprise 10 kullanıcı için yaklaşık 60.000 TL/yıl seviyesindedir. Akınsoft Wolvox ERP paketleri 45.000 TL bandından başlar ve çok kullanıcılı istekler ayrı fiyatlandırılır.",
                    },
                    {
                        t: "p",
                        v: "Buradaki asıl risk büyümedir. Bugün 5 kişiyle başlarsınız; depoya bir kişi, satışa bir kişi eklediğinizde bir üst pakete geçersiniz ve fark bir seferde gelir. Bütçeyi bugünkü ekibinize göre değil, **üç yıl sonraki ekibinize** göre hesaplayın.",
                    },
                    {
                        t: "note",
                        v: "Kontrol sorusu: “8. kullanıcıyı eklersem fiyat ne olur?” Satıcı bu soruya net rakam veremiyorsa, teklif henüz tamamlanmamıştır.",
                    },
                ],
            },
            {
                h: "2. Yıllık bakım — gizli değil ama unutulan kalem",
                blocks: [
                    {
                        t: "p",
                        v: "Türkiye'de yerleşik uygulama, yıllık bakım anlaşmasının lisans bedelinin yaklaşık %25'i olmasıdır. Bakım genelde mevzuat güncellemelerini, sürüm yükseltmelerini ve aylık sınırlı uzaktan desteği kapsar.",
                    },
                    {
                        t: "p",
                        v: "Bakım isteğe bağlı değildir: vergi mevzuatı ve e-belge formatları değiştiğinde güncelleme almayan bir ERP birkaç yıl içinde kullanılamaz hâle gelir. Bütçeye sabit gider olarak yazın.",
                    },
                ],
            },
            {
                h: "3. Kurulum, veri aktarımı ve eğitim",
                blocks: [
                    {
                        t: "p",
                        v: "Yazılımın kendisi işin yarısıdır. Diğer yarısı, ürün kartlarınızın, cari hesaplarınızın, tedarikçi fiyatlarınızın ve açılış stoğunuzun sisteme doğru biçimde girmesidir. Bu iş çoğu zaman lisanstan ayrı fiyatlanır ve bayiden bayiye değişir.",
                    },
                    {
                        t: "p",
                        v: "Fiyatı sorarken kapsamı da sorun: “Ürün listemi ben mi hazırlayacağım, siz mi aktaracaksınız?” Aradaki fark haftalarla ölçülür.",
                    },
                ],
            },
            {
                h: "4. Sunucu ve barındırma",
                blocks: [
                    {
                        t: "p",
                        v: "Yerel kurulumlarda sunucu, yedekleme ünitesi, işletim sistemi lisansı ve bunları ayakta tutacak bir bilgisayarcı gerekir. Bulut kurulumlarda bu kalem abonelik içine gömülür ama her zaman dahil değildir — sözleşmede açıkça yazmıyorsa dahil değildir.",
                    },
                    {
                        t: "table",
                        head: ["Model", "Kime uyar", "Dikkat"],
                        rows: [
                            ["Yerel sunucu", "Kendi IT'si olan, internet kesintisine kapalı üretim", "Yedek ve güvenlik tamamen sizde"],
                            ["Bulut / SaaS", "IT ekibi olmayan KOBİ", "Verinin nerede durduğunu ve dışa aktarılabilir olduğunu sorun"],
                        ],
                    },
                ],
            },
            {
                h: "5. Modüller",
                blocks: [
                    {
                        t: "p",
                        v: "Klasik ERP'lerde üretim, CRM, B2B, e-ticaret entegrasyonu gibi başlıklar ayrı modüldür ve ayrı fiyatlanır. Başlangıçta ihtiyacınız olmayan bir modül bir yıl sonra zorunlu hâle gelebilir.",
                    },
                    {
                        t: "p",
                        v: "Teklif alırken şunu isteyin: **bugünkü ihtiyaç listesi değil, iki yıl sonraki senaryo için fiyat.** Üretim kaydı tutmaya başlarsanız, ikinci depoyu açarsanız, ihracat faturası keserseniz ne değişiyor?",
                    },
                ],
            },
            {
                h: "6. Değiştirme maliyeti — kimsenin konuşmadığı kalem",
                blocks: [
                    {
                        t: "p",
                        v: "ERP kararı üç-beş yıllık bir karardır. Yanlış sistemden çıkmak, yeni sisteme girmekten pahalıdır: veri dışa aktarılamayabilir, geçmiş belgeler okunamayabilir, ekip ikinci kez eğitilir.",
                    },
                    {
                        t: "p",
                        v: "Bu riski azaltan tek soru sözleşme imzalanmadan sorulur: **“Yarın ayrılmak istersem verimi hangi formatta, ne kadar sürede alırım?”** Cevap net değilse fiyat ne olursa olsun risklidir.",
                    },
                ],
            },
            {
                h: "Karşılaştırma tablosu — teklif alırken doldurun",
                blocks: [
                    {
                        t: "p",
                        v: "Her satıcıya aynı tabloyu doldurtun. Rakamlar yan yana geldiğinde “ucuz” ve “pahalı” genelde yer değiştirir.",
                    },
                    {
                        t: "table",
                        head: ["Kalem", "Satıcı A", "Satıcı B"],
                        rows: [
                            ["Lisans (bugünkü kullanıcı)", "", ""],
                            ["Lisans (+3 kullanıcı)", "", ""],
                            ["Yıllık bakım", "", ""],
                            ["Kurulum + veri aktarımı", "", ""],
                            ["Eğitim", "", ""],
                            ["Sunucu / barındırma", "", ""],
                            ["İhtiyaç duyulacak ek modüller", "", ""],
                            ["3 yıllık toplam", "", ""],
                        ],
                    },
                ],
            },
            {
                h: "Roven bunu nasıl fiyatlıyor?",
                blocks: [
                    {
                        t: "p",
                        v: "Şeffaf olmak gerekirse bu yazıyı biz yazıyoruz, dolayısıyla kendi modelimizi de açıkça söyleyelim: Roven tek seferlik kurulum bedeli + yıllık bakım ile çalışır. Kullanıcı başına ve modül başına ücret yoktur, barındırma bakıma dahildir.",
                    },
                    {
                        t: "p",
                        v: "Salt lisans karşılaştırmasında klasik ERP'lerin giriş paketlerinden pahalı görünürüz; kurulum, veri aktarımı, barındırma ve kullanıcı büyümesi eklendiğinde tablo değişir. Rakamların tamamı fiyat bölümümüzde açık yazıyor — teklif beklemenize gerek yok.",
                    },
                ],
            },
        ],
    },
    {
        slug: "excelden-erpye-gecis",
        title: "Excel'den ERP'ye geçiş: işi durdurmadan 7 adım",
        description:
            "Excel'i bir günde bırakmak zorunda değilsiniz. Ürün listesinden açılış stoğuna, geçişi sırayla ve geri dönülebilir biçimde yapmanın yolu.",
        teaser:
            "Başarısız ERP geçişlerinin çoğu yazılımdan değil sıralamadan kaybediyor. Doğru sıra şu.",
        published: "2026-09-18",
        updated: "2026-09-18",
        minutes: 9,
        sections: [
            {
                h: "Excel neden bir yerden sonra çalışmıyor?",
                blocks: [
                    {
                        t: "p",
                        v: "Excel kötü bir araç değildir; tek kişilik bir iş için mükemmeldir. Çatlama anı, aynı dosyaya **ikinci kişinin** yazmaya başladığı andır. O andan itibaren üç şey kaçınılmaz olur:",
                    },
                    {
                        t: "ul",
                        v: [
                            "Aynı stok iki kişi tarafından iki müşteriye söz verilir; kimse fark etmez, çünkü dosyada rezervasyon kavramı yoktur.",
                            "Fiyat geçmişi kaybolur: “geçen ay bu müşteriye kaça vermiştik?” sorusunun cevabı dosya sürümlerine gömülür.",
                            "Kimin ne değiştirdiği bilinmez. Hata bulunur ama sahibi bulunmaz, aynı hata tekrar eder.",
                        ],
                    },
                    {
                        t: "p",
                        v: "Bunlar disiplin sorunu değil yapı sorunudur. Daha dikkatli çalışarak çözülmezler.",
                    },
                ],
            },
            {
                h: "Geçişin altın kuralı: veri sırası, modül sırası değil",
                blocks: [
                    {
                        t: "p",
                        v: "Çoğu başarısız geçiş “önce hangi modülü açalım” tartışmasıyla başlar. Doğru soru bu değildir. Doğru soru şudur: **hangi veri hangisinden önce girmeli?** Çünkü veriler birbirine dayanır — tedarikçi fiyatını girebilmek için ürün, ürünü girebilmek için ürün tipi gerekir.",
                    },
                    {
                        t: "p",
                        v: "Sıra bozulduğunda sistem çalışmaz görünür, oysa yalnızca yarısı doludur. Ekip “bu iş olmuyor” der ve Excel'e döner. Geçişlerin en yaygın ölüm sebebi budur.",
                    },
                ],
            },
            {
                h: "7 adım",
                blocks: [
                    {
                        t: "ol",
                        v: [
                            "**Ürün tipleri ve teknik alanlar.** Ürünlerinizi ayıran özellikler neler? (Ölçü, malzeme, basınç sınıfı, renk, gramaj…) Bu adım atlanırsa tüm teknik bilgi “açıklama” alanına yığılır ve aranamaz hâle gelir.",
                            "**Ürün kartları.** Kod, ad, birim, kategori, asgari stok. Birim alanını ciddiye alın: adet, kilogram, metre ve metrekare karışırsa stok sayısı anlamını kaybeder.",
                            "**Cari hesaplar.** Müşteri unvanı, vergi dairesi ve numarası, adres, para birimi. Teklif ve fatura belgeleri buradan beslenir; eksik adres, sonradan her belgede elle düzeltme demektir.",
                            "**Tedarikçiler ve tedarikçi ürün kodları.** Aynı ürünün sizdeki kodu ile tedarikçideki kodu farklıdır. Bu eşleşme girilmezse satın alma önerileri kaynak seçemez.",
                            "**Açılış stoğu.** Sayım yapın ve o günkü fiziksel miktarı girin. Geçmiş hareketleri taşımaya çalışmayın — bir kesim tarihi belirleyip “bu tarihten sonrası sistemde” demek, aylarca sürecek bir veri arkeolojisinden iyidir.",
                            "**Kullanıcılar ve yetkiler.** Kim neyi görecek? Satışçı maliyeti görmeli mi? Bu kararı baştan verin; sonradan vermek, alışkanlık oluştuktan sonra geri almak demektir.",
                            "**Paralel dönem.** 2–4 hafta boyunca kritik işi hem Excel'de hem sistemde yürütün. Rakamlar tuttuğunda Excel'i kapatın. Bu adım pahalı görünür; atlanması daha pahalıdır.",
                        ],
                    },
                ],
            },
            {
                h: "Excel dosyanız aslında bir avantaj",
                blocks: [
                    {
                        t: "p",
                        v: "Yıllardır tuttuğunuz dosya çöp değil, sermaye. İçinde ürün listeniz, fiyatlarınız ve cari bilgileriniz zaten var. Modern sistemlerde bu dosya doğrudan yüklenir ve kolonlar eşleştirilir: “Ürün Adı” hangi alana, “Br.” hangi alana gidiyor.",
                    },
                    {
                        t: "p",
                        v: "Roven'da bu eşleştirme bir kez yapılır ve sistem hatırlar; aynı biçimdeki bir sonraki dosya elle müdahale olmadan geçer. Amaç dosyanızı silmek değil, içindekini kullanılabilir hâle getirmektir.",
                    },
                ],
            },
            {
                h: "Geçiş sırasında yapılan dört klasik hata",
                blocks: [
                    {
                        t: "ul",
                        v: [
                            "**Her şeyi aynı anda açmak.** Teklif, üretim, satın alma ve muhasebeyi ilk hafta devreye almak ekibi boğar. Bir zinciri sonuna kadar çalıştırın, sonra ikincisine geçin.",
                            "**Geçmişi taşımaya çalışmak.** Üç yıllık sipariş arşivini aktarmak çoğu zaman gereksizdir. Kesim tarihi belirleyin.",
                            "**Eğitimi tek seferde vermek.** Üç saatlik toplu eğitim unutulur. Rol bazlı, kısa ve işin başında verin.",
                            "**Sorumlu atamamak.** İçeriden bir kişi işin sahibi olmalı. Sahipsiz geçiş, ilk aksaklıkta durur.",
                        ],
                    },
                ],
            },
            {
                h: "Ne zaman geçmemelisiniz?",
                blocks: [
                    {
                        t: "p",
                        v: "Dürüst olmak gerekirse herkesin ERP'ye ihtiyacı yok. Tek kişiyseniz, stok tutmuyorsanız ve teklif vermiyorsanız Excel fazlasıyla yeter. Sisteme geçmek için iki işaretten en az birini görmeniz gerekir: **aynı veriye birden fazla kişinin yazması** veya **stoğun sözle vaat edilmesi**.",
                    },
                    {
                        t: "p",
                        v: "İkisinden biri varsa, geçiş ertelendikçe taşınacak veri büyür ve hata birikir.",
                    },
                ],
            },
        ],
    },
    {
        slug: "stok-rezervasyonu-nedir",
        title: "Aynı stoğu iki müşteriye satmak: rezervasyon nasıl çalışır?",
        description:
            "Fiziksel stok, rezerve, satılabilir ve yoldaki mal arasındaki fark. Teklif aşamasında stoğun neden ayrılması gerektiği ve bunun nasıl kurgulandığı.",
        teaser:
            "Depoda 10 adet var demek, 10 adet satabilirsiniz demek değil. Dört ayrı sayının hikâyesi.",
        published: "2026-09-18",
        updated: "2026-09-18",
        minutes: 7,
        sections: [
            {
                h: "“Depoda 10 var” yanlış bir cümle",
                blocks: [
                    {
                        t: "p",
                        v: "Bir satışçı depoya sorar, “10 adet var” cevabını alır ve müşteriye söz verir. Aynı gün başka bir satışçı aynı soruyu sorar, aynı cevabı alır, o da söz verir. İkisi de yanlış bir şey yapmamıştır; sistem ikisine de aynı doğruyu söylemiştir. Yanlış olan, tek bir sayıyla iş yürütülebileceği varsayımıdır.",
                    },
                    {
                        t: "p",
                        v: "Doğru çalışan bir stok yönetiminde tek sayı değil, dört sayı vardır.",
                    },
                ],
            },
            {
                h: "Dört sayı",
                blocks: [
                    {
                        t: "table",
                        head: ["Sayı", "Anlamı", "Hangi soruyu cevaplar"],
                        rows: [
                            ["Fiziksel stok", "Rafta duran miktar", "Depoda ne var?"],
                            ["Rezerve", "Bir müşteriye ayrılmış miktar", "Ne kadarı sözlü/yazılı olarak verilmiş?"],
                            ["Satılabilir", "Fiziksel − rezerve", "Bugün kaç tane söz verebilirim?"],
                            ["Yoldaki mal", "Sipariş edilmiş, gelmemiş miktar", "Ne zaman rahatlayacağım?"],
                        ],
                    },
                    {
                        t: "p",
                        v: "Satışçının bakması gereken sayı fiziksel stok değil **satılabilir**dir. Bu ayrım yapılmadığında “aynı malı iki kez satma” hatası bir dikkat meselesi değil, matematiksel bir zorunluluk hâline gelir.",
                    },
                ],
            },
            {
                h: "Rezervasyon ne zaman başlamalı?",
                blocks: [
                    {
                        t: "p",
                        v: "Kritik soru budur ve üç yaygın cevabı vardır:",
                    },
                    {
                        t: "ul",
                        v: [
                            "**Sevkiyatta.** En geç seçenek. Stok sevke kadar herkese açık görünür; çift satış tamamen mümkündür.",
                            "**Sipariş onayında.** Daha iyi, ama teklif ile sipariş arasında geçen günlerde stok hâlâ korumasızdır — ve teklif verilen mal çoğu zaman gerçekten satılmıştır.",
                            "**Teklif gönderildiğinde.** En güvenlisi. Müşteriye bir vaatte bulunduğunuz anda o mal ayrılır.",
                        ],
                    },
                    {
                        t: "p",
                        v: "Roven üçüncüsünü uygular: teklif gönderildiği anda bağlı bir bekleyen sipariş oluşur ve stok rezerve edilir. Teklif kabul edilirse sipariş onaylanır; reddedilir, süresi dolar veya revize edilirse rezervasyon otomatik çözülür ve mal tekrar satılabilir hâle gelir.",
                    },
                ],
            },
            {
                h: "“Ya stok yetmiyorsa?”",
                blocks: [
                    {
                        t: "p",
                        v: "Rezervasyonun sert bir kural olarak uygulanması, elinizde olmayan malı teklif edememeniz anlamına gelmez — çoğu işletme için bu gerçekçi olmazdı. Doğru davranış **engellemek değil görünür kılmaktır**: teklif oluşur, mevcut kadarı rezerve edilir ve eksik miktar açıkça bildirilir.",
                    },
                    {
                        t: "p",
                        v: "Böylece satışçı müşteriye söz verirken tedarik süresini de bilir. Kaybedilen şey hız değil, sürprizdir.",
                    },
                    {
                        t: "note",
                        v: "Pratik ölçüt: bir sistemin stok tarafı, “söz verdim ama mal yok” durumunu **sevkiyat gününden önce** size söylüyorsa çalışıyordur.",
                    },
                ],
            },
            {
                h: "Üretim yapıyorsanız bir sayı daha var",
                blocks: [
                    {
                        t: "p",
                        v: "Ürettiğiniz bir mal için “satılabilir” sayısı tek başına yetmez; bitmiş ürünün stoğu kadar, onu üretecek bileşenlerin stoğu da önemlidir. Elinizde 10 bitmiş ürün yoksa ama 100 ürünlük bileşen varsa, aslında söz verebilirsiniz.",
                    },
                    {
                        t: "p",
                        v: "Bu yüzden ürün ağacı (BOM) ile stok aynı yerde durmalıdır: üretim kaydı girildiğinde bitmiş ürün artar, bileşenler düşer ve iki taraf da aynı anda güncellenir.",
                    },
                ],
            },
            {
                h: "Kontrol listesi",
                blocks: [
                    {
                        t: "p",
                        v: "Mevcut sisteminizi (Excel dahil) şu beş soruyla ölçün. Üçünden fazlasına “hayır” diyorsanız çift satış riski teoride değil pratikte vardır:",
                    },
                    {
                        t: "ol",
                        v: [
                            "Satışçı, teklif verirken fiziksel stoğu değil satılabilir miktarı görüyor mu?",
                            "Bir teklif gönderildiğinde stok başkasına kapanıyor mu?",
                            "Teklif reddedilince ayrılan mal otomatik olarak serbest kalıyor mu?",
                            "Yoldaki mal ayrı bir sayı olarak görünüyor mu?",
                            "Stok değişikliğinin kim tarafından yapıldığı kayıtlı mı?",
                        ],
                    },
                ],
            },
        ],
    },
];

export function getArticle(slug: string): Article | undefined {
    return ARTICLES.find((a) => a.slug === slug);
}
