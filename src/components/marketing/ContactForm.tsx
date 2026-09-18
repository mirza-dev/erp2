"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { CONTACT_LIMITS, EMPLOYEE_BANDS } from "@/lib/marketing/contact-lead";

type Status = "idle" | "sending" | "ok" | "error";

/**
 * Pazarlama sayfasının kurulum görüşmesi formu.
 *
 * Stil sınıfları (`rv-*`) sayfanın kendi `css` dizesinde tanımlı — pazarlama
 * yüzeyi tek stil kaynağını korur, ayrı CSS dosyası açılmaz.
 *
 * `fallbackEmail` sunucudan gelir (`NEXT_PUBLIC_CONTACT_EMAIL`): e-posta altyapısı
 * yapılandırılmamışsa (`EMAIL_FROM` bugün canlıda boş olabilir) form 503 döner ve
 * ziyaretçi yine de bir yol bulur. Adres tanımlı değilse uydurma adres GÖSTERİLMEZ.
 */
export default function ContactForm({ fallbackEmail }: { fallbackEmail?: string }) {
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState("");
    const [field, setField] = useState("");

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (status === "sending") return;

        const fd = new FormData(e.currentTarget);
        const payload = {
            name: String(fd.get("name") ?? ""),
            company: String(fd.get("company") ?? ""),
            email: String(fd.get("email") ?? ""),
            phone: String(fd.get("phone") ?? ""),
            employees: String(fd.get("employees") ?? ""),
            message: String(fd.get("message") ?? ""),
            website: String(fd.get("website") ?? ""),
        };

        setStatus("sending");
        setError("");
        setField("");

        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setStatus("ok");
                return;
            }
            const data = await res.json().catch(() => ({}));
            setField(typeof data.field === "string" ? data.field : "");
            setError(
                typeof data.error === "string"
                    ? data.error
                    : res.status === 429
                      ? "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin."
                      : "Talebiniz gönderilemedi.",
            );
            setStatus("error");
        } catch {
            setError("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.");
            setStatus("error");
        }
    }

    if (status === "ok") {
        return (
            <div className="rv-form-done" role="status">
                <span className="rv-form-done-i"><Check size={18} /></span>
                <h3 className="rv-form-done-h">Talebiniz bize ulaştı.</h3>
                <p className="rv-form-done-p">
                    Bir iş günü içinde dönüş yapıyoruz. Bu arada canlı demoyu gezebilirsiniz —
                    görüşmede aynı ekranlar üzerinden konuşuruz.
                </p>
                <a href="/api/auth/demo" className="rv-btn rv-btn-ghost">
                    Demoyu gez <ArrowRight size={15} />
                </a>
            </div>
        );
    }

    return (
        <form className="rv-form" onSubmit={onSubmit} noValidate>
            <div className="rv-form-grid">
                <div className="rv-field">
                    <label className="rv-lbl" htmlFor="cf-name">Ad Soyad *</label>
                    <input
                        id="cf-name" name="name" className="rv-input" required
                        maxLength={CONTACT_LIMITS.name} autoComplete="name"
                        aria-invalid={field === "name" || undefined}
                    />
                </div>
                <div className="rv-field">
                    <label className="rv-lbl" htmlFor="cf-company">Firma *</label>
                    <input
                        id="cf-company" name="company" className="rv-input" required
                        maxLength={CONTACT_LIMITS.company} autoComplete="organization"
                        aria-invalid={field === "company" || undefined}
                    />
                </div>
                <div className="rv-field">
                    <label className="rv-lbl" htmlFor="cf-email">E-posta *</label>
                    <input
                        id="cf-email" name="email" type="email" className="rv-input" required
                        maxLength={CONTACT_LIMITS.email} autoComplete="email"
                        aria-invalid={field === "email" || undefined}
                    />
                </div>
                <div className="rv-field">
                    <label className="rv-lbl" htmlFor="cf-phone">Telefon</label>
                    <input
                        id="cf-phone" name="phone" type="tel" className="rv-input"
                        maxLength={CONTACT_LIMITS.phone} autoComplete="tel"
                    />
                </div>
                <div className="rv-field rv-field-wide">
                    <label className="rv-lbl" htmlFor="cf-employees">Çalışan sayısı</label>
                    <select id="cf-employees" name="employees" className="rv-input" defaultValue="">
                        <option value="">Seçiniz</option>
                        {EMPLOYEE_BANDS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                </div>
                <div className="rv-field rv-field-wide">
                    <label className="rv-lbl" htmlFor="cf-message">
                        Bugün neyi Excel’de yönetiyorsunuz?
                    </label>
                    <textarea
                        id="cf-message" name="message" className="rv-input rv-textarea" rows={4}
                        maxLength={CONTACT_LIMITS.message}
                        placeholder="Örnek: teklifleri Word’de hazırlıyoruz, stok ayrı bir Excel’de, ikisi tutmuyor."
                    />
                </div>
            </div>

            {/* Bal küpü — insan görmez, bot doldurur. `display:none` değil: bazı botlar
                gizli alanı atlar, konum dışına taşımak daha iyi yakalar. */}
            <div className="rv-honey" aria-hidden="true">
                <label htmlFor="cf-website">Web sitesi (boş bırakın)</label>
                <input id="cf-website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            {status === "error" && (
                <p className="rv-form-err" role="alert">{error}</p>
            )}

            <div className="rv-form-foot">
                <button
                    type="submit"
                    className="rv-btn rv-btn-primary"
                    disabled={status === "sending"}
                >
                    {status === "sending" ? "Gönderiliyor…" : "Kurulum görüşmesi iste"}
                    {status !== "sending" && <ArrowRight size={16} />}
                </button>
                <span className="rv-form-note">
                    Satış baskısı yok. 30 dakikada sisteminizi ekrandan gösteririz.
                    {fallbackEmail ? <> Dilerseniz doğrudan <a href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a> adresine yazın.</> : null}
                </span>
            </div>
        </form>
    );
}
