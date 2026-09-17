import Link from "next/link";
import { ArrowRight } from "lucide-react";
import RovenLogo from "@/components/layout/RovenLogo";
import { MARKETING_CSS } from "@/lib/marketing/marketing-css";
import { ARTICLE_CSS } from "@/lib/marketing/article-css";

/**
 * Rehber sayfalarının kabuğu — açılış sayfasının gezinme ve alt bilgisini
 * aynen taşır ki ziyaretçi başka bir siteye geçtiğini sanmasın.
 *
 * Gezinme bağlantıları açılış sayfasının bölümlerine mutlak yolla gider
 * (`/#fiyat`): rehberdeyken `#fiyat` bu sayfada bir yere denk gelmez, sessizce
 * hiçbir şey yapmazdı.
 */
export default function MarketingShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="rv-root">
            <style>{MARKETING_CSS}</style>
            <style>{ARTICLE_CSS}</style>

            <div className="rv-bg-mesh" aria-hidden />
            <div className="rv-bg-grid" aria-hidden />
            <div className="rv-bg-grain" aria-hidden />

            <header className="rv-nav">
                <Link href="/" className="rv-brand">
                    <RovenLogo size={19} wordmarkSize={17} />
                </Link>
                <nav className="rv-nav-links">
                    <Link href="/#ozellikler">Özellikler</Link>
                    <Link href="/#fiyat">Fiyat</Link>
                    <Link href="/rehber">Rehber</Link>
                    <Link href="/#sss">SSS</Link>
                </nav>
                <div className="rv-nav-cta">
                    <Link href="/login" className="rv-link-quiet tap-44">
                        Giriş Yap
                    </Link>
                    <a href="/api/auth/demo" className="rv-btn rv-btn-primary rv-btn-sm tap-44">
                        Demo Gez <ArrowRight size={14} />
                    </a>
                </div>
            </header>

            {children}

            <footer className="rv-footer">
                <Link href="/" className="rv-brand">
                    <RovenLogo size={16} wordmarkSize={14} />
                </Link>
                <span className="rv-foot-tag">Yapay zeka destekli ERP — küçük ve orta ölçekli işletmeler için</span>
                <Link href="/gizlilik" className="rv-foot-tag tap-44-v" style={{ color: "inherit", textDecoration: "underline" }}>
                    Gizlilik ve Aydınlatma Metni
                </Link>
                <span className="rv-foot-copy">© {new Date().getFullYear()} Roven</span>
            </footer>
        </div>
    );
}
