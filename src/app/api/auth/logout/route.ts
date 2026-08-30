import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Oturumu kapatır — YALNIZ bu tarayıcıdakini.
 *
 * `scope: "local"` AÇIKÇA veriliyor: supabase-js varsayılanı `"global"` ve o,
 * kullanıcının TÜM cihazlardaki refresh token'larını iptal eder. Uygulamada
 * "her yerden çık" diye bir yüzey yok; sidebar'daki tek "Çıkış Yap" düğmesinin
 * telefondaki oturumu da öldürmesi kullanıcının beklemediği bir yan etki.
 *
 * Bu davranış 2026-08-30'da E2E suite'inde somut hasara da yol açıyordu:
 * `auth.spec`'in çıkış testi, paylaşılan `storageState` oturumunu iptal edip
 * sonraki tüm testleri giriş sayfasına düşürüyordu (dashboard.spec tek başına
 * 6/6, auth'tan sonra 2/6). `playwright.config.ts`'te proje sırası da ikinci
 * bir savunma olarak sertleştirildi.
 */
export async function POST() {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.json({ ok: true });
}
