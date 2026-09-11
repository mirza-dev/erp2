/**
 * GATE: parola politikası.
 *
 * 2026-08-31 denetimi (kullanıcının paylaştığı 20 maddelik liste, madde #19):
 * kural **dört yere kopyalanmıştı** ve dördü de yalnız `length >= 8` bakıyordu.
 * Kopyalanmış kural ayrışır — biri sıkılaşır, öteki geride kalır ve **zayıf olan
 * kazanır** (kullanıcı en gevşek yüzeyden parolasını belirler). Bu yüzden testin
 * iki işi var:
 *
 *   1. Politikanın kendisi doğru davranıyor mu (davranış testi).
 *   2. **Her çağrı yeri ortak yardımcıyı kullanıyor mu** (kaynak iddiası) —
 *      biri elle `8`e dönerse burada yakalanır. 2026-08-31'de liste DÖRTTEN
 *      ALTIYA çıktı: parola kurtarma ekranı (`/sifre-yenile`) ve admin
 *      sıfırlama kolu (`PATCH /api/admin/users/[id]`) eklendi. Yeni bir şifre
 *      belirleme yüzeyi açılıp bu listeye girmezse en gevşek yüzey kazanır.
 *
 * Karmaşıklık kuralı BİLEREK yok (NIST 800-63B); onun yerine uzunluk + zayıf-liste
 * + bağlam reddi. Bu bir eksiklik değil, karar — testte de böyle sabitlendi.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

const root = process.cwd();
const policySrc = readFileSync(join(root, "src/lib/auth/password-policy.ts"), "utf8");

/** Politikayı geçtiği bilinen, gerçekçi bir parola. */
const GOOD = "yesil-kapi-42-menekse";

describe("GATE — parola politikası", () => {
    it("alt sınır en az 12 ve GOOD örneği gerçekten geçiyor (anti-vacuous)", () => {
        expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
        // Bu geçmezse aşağıdaki "reddedildi" iddialarının hepsi anlamsız olurdu:
        // her şeyi reddeden bir fonksiyon da testi yeşil gösterirdi.
        expect(checkPasswordPolicy(GOOD, { email: "ahmet@pmt.com.tr" })).toBeNull();
    });

    it("sınırın altı reddedilir, sınır kabul edilir", () => {
        expect(checkPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH - 1))).not.toBeNull();
        // Tam sınırda ve başka hiçbir kurala takılmayan bir örnek geçmeli.
        const tamSinir = "kirmizi-defter".slice(0, MIN_PASSWORD_LENGTH);
        expect(tamSinir.length).toBe(MIN_PASSWORD_LENGTH);
        expect(checkPasswordPolicy(tamSinir)).toBeNull();
    });

    it("yaygın parolalar ve basit türevleri reddedilir", () => {
        expect(checkPasswordPolicy("passwordpassword".slice(0, 8))).not.toBeNull(); // kısa zaten
        expect(checkPasswordPolicy("sifresifre12")).toBeNull(); // liste TAM eşleşme arar, bu geçmeli
        // Uzunluğu geçen ama liste/türev kuralına takılanlar:
        expect(checkPasswordPolicy("galatasaray1")).not.toBeNull();  // türev: sondaki rakam atılır
        expect(checkPasswordPolicy("administrator")).not.toBeNull(); // tam eşleşme
        expect(checkPasswordPolicy("ŞİFRE12345678".slice(0, 12) + "!")).not.toBeNull(); // TR katlama + türev
    });

    it("kullanıcının kendi e-postası parola olamaz", () => {
        expect(checkPasswordPolicy("mirzasaribiyik-2026", { email: "mirzasaribiyik@ornek.com" })).not.toBeNull();
        // Bağlam verilmezse bu kural çalışmamalı (sunucu otoriter, istemci opsiyonel geçer).
        expect(checkPasswordPolicy("mirzasaribiyik-2026")).toBeNull();
    });

    it("tekrar ve ardışık diziler reddedilir", () => {
        expect(checkPasswordPolicy("aaaaaaaaaaaaaa")).not.toBeNull();
        expect(checkPasswordPolicy("abcdefghijklm")).not.toBeNull();
        expect(checkPasswordPolicy("987654321000")).not.toBeNull();
    });

    it("zayıf liste boş değil (çıkarım çökerse yukarısı sahte-yeşil olurdu)", () => {
        const list = policySrc.match(/const WEAK_BASES = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
        expect(list.split(",").filter((x) => x.trim().startsWith('"')).length).toBeGreaterThanOrEqual(20);
    });

    it("YEDİ çağrı yerinin yedisi de ortak yardımcıyı kullanıyor", () => {
        const callers: [string, RegExp][] = [
            ["src/app/api/settings/user/password/route.ts", /checkPasswordPolicy\(/],
            ["src/app/api/admin/users/route.ts", /checkPasswordPolicy\(/],
            ["src/app/dashboard/settings/page.tsx", /checkPasswordPolicy\(/],
            ["src/app/dashboard/settings/users/page.tsx", /MIN_PASSWORD_LENGTH/],
            // 2026-08-31, madde #4 — parola kurtarma zinciriyle gelen iki yüzey:
            ["src/app/sifre-yenile/page.tsx", /checkPasswordPolicy\(/],
            ["src/app/api/admin/users/[id]/route.ts", /checkPasswordPolicy\(/],
            // 2026-09-11, dış inceleme #2 — kurtarmanın SUNUCU ucu:
            ["src/app/api/auth/recovery-password/route.ts", /checkPasswordPolicy\(/],
        ];
        for (const [file, needle] of callers) {
            const src = readFileSync(join(root, file), "utf8");
            expect(src, `${file} ortak yardımcıyı kullanmıyor`).toMatch(needle);
            // Elle yazılmış eski eşik geri gelmesin.
            expect(src, `${file} içinde elle yazılmış parola uzunluk eşiği var`)
                .not.toMatch(/(password|Password|Şifre|şifre)[^\n]{0,40}length\s*<\s*\d/);
        }
    });

    /**
     * 2026-09-11 — dış inceleme #2. Üstteki kural "her yüzey yardımcıyı
     * ÇAĞIRIYOR mu" diye soruyordu ve `/sifre-yenile` onu geçiyordu: sayfa
     * gerçekten çağırıyordu, ama İSTEMCİDE — sonra parolayı yine tarayıcıdan
     * yazıyordu. Yani kural yeşilken yüzey atlanabilir kalmıştı.
     *
     * Eksik olan soru şuydu: parolayı KİM YAZIYOR? Bu kural onu sorar ve
     * cevabın her zaman sunucu olmasını şart koşar.
     */
    describe("parolayı YAZAN her yerin sunucu olması", () => {
        /** `src/` altındaki tüm .ts/.tsx (testler hariç). */
        function walk(dir: string, out: string[] = []): string[] {
            for (const e of readdirSync(dir)) {
                if (e === "__tests__") continue;
                const full = join(dir, e);
                if (statSync(full).isDirectory()) walk(full, out);
                else if (/\.tsx?$/.test(e)) out.push(full);
            }
            return out;
        }

        /**
         * Parola YAZAN çağrılar. İddia MESAFEYE değil ÇAĞRININ GÖVDESİNE
         * bağlanır: paren derinliği sayılarak argüman metni çıkarılır ve
         * `password` anahtarı yalnız ORADA aranır.
         *
         * İlk yazım "çağrı var + dosyada `password` geçiyor" diyordu ve
         * `seed-runner`ı YANLIŞ sebeple yakaladı: oradaki `updateUserById`
         * yalnız metadata yazıyor, parola ise bir satır aşağıdaki `createUser`
         * çağrısında. Dosya doğruydu, ölçü aracı kabaydı — ve `createUser`
         * desende hiç yoktu, yani gerçek yüzeyi kaçırıp yanlışını yakalıyordu.
         */
        const CALL = /auth\.(?:admin\.)?(?:updateUser|updateUserById|createUser)\s*\(/g;
        function writesPassword(src: string): boolean {
            for (const m of src.matchAll(CALL)) {
                let depth = 0;
                let i = m.index! + m[0].length - 1;
                const start = i;
                for (; i < src.length; i++) {
                    if (src[i] === "(") depth++;
                    else if (src[i] === ")") {
                        depth--;
                        if (depth === 0) break;
                    }
                }
                if (/(^|[\s{,])password\s*:/.test(src.slice(start, i))) return true;
            }
            return false;
        }

        const files = walk(join(root, "src"));
        const writers = files.filter((f) =>
            writesPassword(
                readFileSync(f, "utf8")
                    .replace(/\/\*[\s\S]*?\*\//g, "")
                    .replace(/^\s*\/\/.*$/gm, ""),
            ),
        );

        it("tarama çalışıyor — parola yazan en az bir yüzey bulundu", () => {
            // Anti-vakum: desen çökerse aşağıdaki iddia BOŞ KÜMEYİ denetlerdi.
            expect(writers.length, "hiç parola yazan dosya bulunamadı — ayrıştırıcı bozuk").toBeGreaterThan(0);
        });

        it("hiçbir İSTEMCİ bileşeni parola yazmıyor", () => {
            const clientWriters = writers.filter((f) =>
                /^\s*["']use client["']/m.test(readFileSync(f, "utf8")),
            );
            expect(
                clientWriters.map((f) => f.replace(root + "/", "")),
                "parola tarayıcıdan yazılıyor — politika devtools'tan atlanabilir",
            ).toEqual([]);
        });

        it("parola yazan her sunucu yüzeyi politikayı AYNI dosyada uyguluyor", () => {
            const bad = writers
                .map((f) => f.replace(root + "/", ""))
                .filter((rel) => !/checkPasswordPolicy\(/.test(readFileSync(join(root, rel), "utf8")));
            expect(bad, "politika uygulanmadan parola yazan yüzey").toEqual([]);
        });
    });
});
