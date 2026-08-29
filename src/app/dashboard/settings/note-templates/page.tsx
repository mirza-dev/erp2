import { redirect } from "next/navigation";

/**
 * Eski Not Şablonları sayfası → Ayarlar sekmesi.
 *
 * 2026-08-29: içerik `src/components/settings/NoteTemplatesTab.tsx`'e taşındı ve
 * Ayarlar'ın "Not Şablonları" sekmesi oldu. Bu route SİLİNMEDİ, yönlendirmeye
 * çevrildi: sidebar dışında yer imi/geçmiş bağlantıları ve `page-access.ts`
 * kuralı (view_settings) kırılmasın — proxy.ts bu path'i hâlâ aynı izinle
 * kapıda tutuyor, yönlendirme ondan SONRA çalışıyor.
 */
export default function NoteTemplatesRedirectPage() {
    redirect("/dashboard/settings?tab=not-sablonlari");
}
