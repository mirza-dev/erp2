import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Gizlilik ve Aydınlatma Metni · Roven",
    description: "Roven ERP'de işlenen kişisel veriler, saklama süreleri ve haklarınız.",
};

/**
 * KVKK aydınlatma metni (madde #16).
 *
 * Sistemde müşteri unvanı, vergi no, telefon, adres ve e-posta duruyor ama
 * uygulamada bunu anlatan hiçbir yüzey yoktu.
 *
 * İÇERİĞİN KAYNAĞI `docs/kvkk-veri-envanteri.md` — o belge canlı şemadan
 * çıkarıldı. İkisi ayrışırsa envanter esastır.
 *
 * KÖŞELİ PARANTEZLER BİLEREK DURUYOR: ticari unvan, VERBİS numarası ve irtibat
 * adresi firmaya özeldir; uydurulmuş bir unvan yanlış beyandır. Hukuk danışmanı
 * onayı alınmadan yayına girmemelidir.
 *
 * Oturumsuz erişilebilir (`proxy.ts` → ALWAYS_PUBLIC): giriş yapmamış bir kişi de
 * okuyabilmeli, aksi hâlde aydınlatma yükümlülüğü karşılanmaz.
 */
export default function PrivacyPage() {
    return (
        <main style={pageStyle}>
            <article style={articleStyle}>
                <p style={eyebrowStyle}>Roven ERP</p>
                <h1 style={h1Style}>Gizlilik ve Aydınlatma Metni</h1>
                <p style={metaStyle}>Son güncelleme: 31 Ağustos 2026</p>

                <div style={draftNoticeStyle} role="note">
                    <strong>Taslak.</strong> Köşeli parantezli alanlar firma bilgisiyle
                    doldurulmalı ve metin hukuk danışmanı onayından geçmelidir.
                </div>

                <Section title="1. Veri sorumlusu">
                    <p style={pStyle}>
                        Kişisel verileriniz, veri sorumlusu sıfatıyla <Blank>ticari unvan</Blank>
                        tarafından, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında
                        aşağıda açıklanan amaçlarla işlenmektedir.
                    </p>
                    <p style={pStyle}>
                        VERBİS kayıt numarası: <Blank>varsa numara</Blank> ·
                        Başvuru adresi: <Blank>KEP veya posta adresi</Blank>
                    </p>
                </Section>

                <Section title="2. İşlenen kişisel veriler">
                    <p style={pStyle}>
                        Roven bir kurumsal kaynak planlama (ERP) sistemidir ve kişisel veriyi
                        yalnız ticari ilişkinin yürütülmesi için işler:
                    </p>
                    <ul style={ulStyle}>
                        <li><strong>Müşteri ve tedarikçi yetkilisi:</strong> ad, unvan, e-posta, telefon, adres, vergi numarası ve dairesi.</li>
                        <li><strong>Belge kayıtları:</strong> teklif ve siparişlerde, belgenin düzenlendiği andaki müşteri ve satış temsilcisi bilgileri.</li>
                        <li><strong>Sistem kullanıcısı:</strong> e-posta adresi, rolleri, son giriş zamanı ve yaptığı işlemlerin kaydı.</li>
                        <li><strong>Teknik kayıtlar:</strong> hata teşhisi için tarayıcı bilgisi ve hata izleri.</li>
                    </ul>
                    <p style={pStyle}>
                        <strong>İşlenmeyenler:</strong> konum, biyometrik veri ve KVKK m.6 anlamında
                        özel nitelikli kişisel veri toplanmaz. Parolalar sistemde saklanmaz;
                        kimlik doğrulama altyapı sağlayıcısında yapılır. Üçüncü taraf reklam veya
                        izleme çerezi kullanılmaz.
                    </p>
                </Section>

                <Section title="3. İşleme amacı ve hukuki sebep">
                    <ul style={ulStyle}>
                        <li><strong>Sözleşmenin kurulması ve ifası</strong> (m.5/2-c): teklif hazırlama, sipariş alma, sevkiyat, faturalama.</li>
                        <li><strong>Hukuki yükümlülük</strong> (m.5/2-ç): ticari defter ve belge saklama.</li>
                        <li><strong>Meşru menfaat</strong> (m.5/2-f): sistem güvenliği, hata teşhisi ve yetkisiz erişimin önlenmesi.</li>
                    </ul>
                </Section>

                <Section title="4. Saklama süresi">
                    <p style={pStyle}>
                        Teknik kayıtlar (hata ve kullanım ölçümleri) <strong>30 gün</strong>,
                        e-posta teslim kayıtları ve bildirim kuyruğu <strong>90 gün</strong> sonra
                        otomatik olarak silinir.
                    </p>
                    <p style={pStyle}>
                        Ticari kayıtlar (cari bilgileri, teklifler, siparişler ve işlem geçmişi)
                        ilgili mevzuatın öngördüğü saklama süresi boyunca tutulur. Bir sistem
                        kullanıcısının hesabı silinse dahi, o kullanıcının yaptığı işlemlerin
                        kaydı ticari izlenebilirlik için korunur.
                    </p>
                </Section>

                <Section title="5. Aktarım">
                    <p style={pStyle}>
                        Veriler bulut altyapı sağlayıcısında (Supabase, Tokyo bölgesi) barındırılır.
                        Ayrıca — yalnız ilgili özellik etkinleştirildiğinde — e-posta gönderimi,
                        hata izleme ve muhasebe entegrasyonu hizmet sağlayıcılarına aktarım yapılır.
                        Hata izleme sistemine gönderilen kayıtlarda istek gövdesi, çerezler ve
                        kimlik doğrulama başlıkları gönderim öncesinde maskelenir.
                    </p>
                    <p style={pStyle}>
                        Veriler pazarlama amacıyla üçüncü kişilere satılmaz veya devredilmez.
                    </p>
                </Section>

                <Section title="6. Haklarınız">
                    <p style={pStyle}>
                        KVKK m.11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, buna
                        ilişkin bilgi talep etme, işlenme amacını öğrenme, yurt içinde veya
                        yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış
                        işlenmişse düzeltilmesini, şartları oluşmuşsa silinmesini isteme ve
                        işlemenin hukuka aykırılığı hâlinde zararınızın giderilmesini talep
                        etme haklarına sahipsiniz.
                    </p>
                    <p style={pStyle}>
                        Başvurularınızı <Blank>irtibat adresi</Blank> üzerinden iletebilirsiniz;
                        talebiniz en geç <strong>30 gün</strong> içinde sonuçlandırılır.
                    </p>
                </Section>

                <div style={{ marginTop: "34px" }}>
                    <Link href="/login" style={backLinkStyle}>&larr; Giriş ekranına dön</Link>
                </div>
            </article>
        </main>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ marginTop: "26px" }}>
            <h2 style={h2Style}>{title}</h2>
            {children}
        </section>
    );
}

/** Firma bilgisiyle doldurulacak yer tutucu — görsel olarak da belli olsun. */
function Blank({ children }: { children: React.ReactNode }) {
    return (
        <span style={{
            background: "var(--warning-bg, var(--bg-tertiary))",
            color: "var(--warning-text, var(--text-secondary))",
            padding: "1px 6px",
            borderRadius: "4px",
            fontSize: "0.95em",
        }}>
            [{children}]
        </span>
    );
}

const pageStyle: React.CSSProperties = {
    minHeight: "100dvh",
    background: "var(--bg-secondary)",
    padding: "40px 20px 64px",
};

const articleStyle: React.CSSProperties = {
    maxWidth: "680px",
    margin: "0 auto",
    background: "var(--bg-primary)",
    border: "var(--line-width) solid var(--border-secondary)",
    borderRadius: "var(--radius-lg)",
    padding: "32px",
};

const eyebrowStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
    margin: "0 0 6px",
};

const h1Style: React.CSSProperties = {
    fontSize: "22px",
    fontWeight: 650,
    letterSpacing: "-0.01em",
    color: "var(--text-primary)",
    margin: "0 0 4px",
};

const metaStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--text-tertiary)",
    margin: "0 0 20px",
};

const draftNoticeStyle: React.CSSProperties = {
    fontSize: "12.5px",
    lineHeight: 1.6,
    color: "var(--warning-text, var(--text-secondary))",
    background: "var(--warning-bg, var(--bg-tertiary))",
    border: "var(--line-width) solid var(--warning-border, var(--border-secondary))",
    borderRadius: "var(--radius-md)",
    padding: "10px 13px",
};

const h2Style: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 8px",
};

const pStyle: React.CSSProperties = {
    fontSize: "13.5px",
    lineHeight: 1.7,
    color: "var(--text-secondary)",
    margin: "0 0 10px",
};

const ulStyle: React.CSSProperties = {
    fontSize: "13.5px",
    lineHeight: 1.7,
    color: "var(--text-secondary)",
    margin: "0 0 10px",
    paddingLeft: "20px",
};

const backLinkStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--accent)",
    textDecoration: "none",
};
