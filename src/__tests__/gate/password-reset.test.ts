/**
 * GATE: parola sıfırlama zinciri.
 *
 * 2026-08-31 denetimi (madde #4): akış TAMAMEN KIRIKTI ve kırıklığın şekli
 * öğreticidir — her parça tek başına makul görünüyordu:
 *
 *   · `/login` `resetPasswordForEmail` çağırıyordu           ✓ makul
 *   · dönüş adresi `/login`'di                                ✓ makul
 *   · `/auth/callback` `exchangeCodeForSession` yapıyordu     ✓ makul
 *   · Ayarlar'da şifre değiştirme vardı                       ✓ makul
 *
 * ...ama zincir kopuktu: dönüş `/auth/callback`'e GİTMİYORDU, `/login` PKCE
 * `?code=`'unu hiç işlemiyordu, "yeni şifre" ekranı yoktu ve Ayarlar MEVCUT
 * şifreyi istediği için unutan kişiye yaramıyordu. Net sonuç: şifresini unutan
 * herkes — admin dâhil — kalıcı kilitleniyordu.
 *
 * Bu yüzden test PARÇALARI değil BAĞLANTILARI kilitler. Bir halka koparsa
 * diğerleri hâlâ "doğru" görüneceği için tek tek testler bunu yakalayamazdı.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECOVERY_PATH, resolveNextPath } from "@/lib/auth/recovery-route";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const loginSrc = read("src/app/login/page.tsx");
const callbackSrc = read("src/app/auth/callback/route.ts");
const recoveryPageSrc = read("src/app/sifre-yenile/page.tsx");
const adminUserSrc = read("src/app/api/admin/users/[id]/route.ts");
const usersPageSrc = read("src/app/dashboard/settings/users/page.tsx");

describe("GATE — parola sıfırlama zinciri", () => {
    it("HALKA 1: sıfırlama e-postası exchange yapan handler'a döner, /login'e DEĞİL", () => {
        // Kırık hâl tam olarak buydu: redirectTo `${origin}/login`.
        expect(loginSrc).toMatch(/resetPasswordForEmail\(/);
        expect(loginSrc).toMatch(/\/auth\/callback\?next=\$\{RECOVERY_PATH\}/);
        // `/login` PKCE kodunu işlemiyor — oraya geri dönmek kilidi geri getirir.
        expect(loginSrc).not.toMatch(/redirectTo:\s*`\$\{window\.location\.origin\}\/login`/);
    });

    it("HALKA 2: callback `next`'i ALLOWLIST ile çözer (açık yönlendirme koruması)", () => {
        expect(callbackSrc).toMatch(/resolveNextPath\(searchParams\.get\("next"\)\)/);
        // Serbest path kabul edilmemeli: yalnız bilinen hedef geçer.
        expect(resolveNextPath(RECOVERY_PATH)).toBe(RECOVERY_PATH);
        expect(resolveNextPath("https://kotu.example.com")).toBe("/dashboard");
        expect(resolveNextPath("/dashboard/settings/users")).toBe("/dashboard");
        expect(resolveNextPath("//kotu.example.com")).toBe("/dashboard");
        expect(resolveNextPath(null)).toBe("/dashboard");
    });

    it("HALKA 3: yeni şifre ekranı VAR ve ortak politikayı kullanıyor", () => {
        expect(recoveryPageSrc).toMatch(/checkPasswordPolicy\(/);
        expect(recoveryPageSrc).toMatch(/updateUser\(\{\s*password\s*\}\)/);
        // Elle yazılmış eşik politikadan ayrışır — yasak.
        expect(recoveryPageSrc).not.toMatch(/length\s*<\s*\d/);
    });

    it("HALKA 4: admin sıfırlama var, politikadan geçiyor ve iz bırakıyor", () => {
        // E-postadan BAĞIMSIZ kurtarma yolu: EMAIL_FROM boşken tek çalışan yol bu.
        expect(adminUserSrc).toMatch(/checkPasswordPolicy\(/);
        expect(adminUserSrc).toMatch(/password_reset_by_admin/);
        expect(adminUserSrc).toMatch(/audit_log/);
        // UI tarafı da bağlanmış olmalı — API tek başına kullanıcıya ulaşmaz.
        expect(usersPageSrc).toMatch(/Şifre sıfırla/);
        expect(usersPageSrc).toMatch(/JSON\.stringify\(\{ password: resetPassword \}\)/);
    });

    it("kurtarma yolu tek kaynaktan gelir (üç yüzey ayrışırsa zincir sessizce kopar)", () => {
        expect(RECOVERY_PATH).toBe("/sifre-yenile");
        // Sabit elle yazılmışsa yol değişince biri geride kalır.
        expect(loginSrc).toMatch(/RECOVERY_PATH/);
        expect(callbackSrc).toMatch(/RECOVERY_PATH|resolveNextPath/);
    });

    it("süresi dolmuş kurtarma linki OAuth hatası gibi görünmez", () => {
        // Aksi hâlde kullanıcı "Google ile giriş yapılamadı" okuyup yanlış yerde
        // sorun arar; en sık hata bu (linkler tek kullanımlık ve kısa ömürlü).
        expect(callbackSrc).toMatch(/error=recovery/);
        expect(loginSrc).toMatch(/errRecovery/);
    });
});
