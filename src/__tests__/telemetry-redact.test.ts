/**
 * Developer Console §10 — hassas veri redaksiyonu.
 *
 * Bu, panelin en riskli yüzeyi: hata mesajları ve bağlam nesneleri parola,
 * token, çerez veya müşteri verisi taşıyabilir ve panel onları OKUNAKLI
 * gösterir. Testler iki katmanı da sınar — anahtar bazlı (alan adı) ve değer
 * bazlı (serbest metinde gömülü sır) — ve ayrıca redaksiyonun YAZMA YOLUNDA
 * gerçekten çağrıldığını kaynak-kilidiyle doğrular. Yalnız fonksiyonu test
 * etmek, onu çağırmayı unutmuş bir yazma yolunu yakalamaz.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
    REDACTED,
    isSensitiveKey,
    redactContext,
    redactHeaders,
    redactString,
    redactText,
    redactValue,
} from "@/lib/telemetry/redact";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("isSensitiveKey — anahtar bazlı maskeleme", () => {
    it("sır taşıyan alan adlarını tanır", () => {
        for (const key of [
            "password", "passwd", "authorization", "Authorization", "cookie",
            "access_token", "refresh_token", "api_key", "apiKey", "client_secret",
            "private_key", "session", "credit_card", "cvv", "iban",
        ]) {
            expect(isSensitiveKey(key), `${key} maskelenmeliydi`).toBe(true);
        }
    });

    it("zararsız alanları maskelemez — teşhis körleşmesin", () => {
        // Bu repoda gerçekten var olan alanlar; hepsini maskelemek paneli
        // işe yaramaz hâle getirirdi.
        for (const key of [
            "incident_key", "event_key", "scope_key", "field_key", "rowKey",
            "author", "authorized_at", "endpoint", "status", "module", "entity_id",
        ]) {
            expect(isSensitiveKey(key), `${key} gereksiz maskelendi`).toBe(false);
        }
    });
});

describe("redactText — serbest metinde gömülü sır", () => {
    it("JWT / Supabase token maskelenir", () => {
        const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        const out = redactText(`auth failed for ${jwt}`);
        expect(out).toContain(REDACTED);
        expect(out).not.toContain(jwt);
    });

    it("Bearer başlığı maskelenir ama şema görünür kalır", () => {
        const out = redactText("Authorization: Bearer sk_live_abcdef1234567890");
        expect(out).toContain("Bearer");
        expect(out).not.toContain("sk_live_abcdef1234567890");
    });

    it("sağlayıcı anahtarları maskelenir", () => {
        expect(redactText("key sk-ant-api03-AAAABBBBCCCCDDDD")).not.toContain("AAAABBBBCCCCDDDD");
        expect(redactText("resend re_123456789abcdefg")).not.toContain("123456789abcdefg");
    });

    it("bağlantı dizesindeki parola maskelenir", () => {
        const out = redactText("postgres://erp_user:sUperGizli1@db.host:5432/erp");
        expect(out).not.toContain("sUperGizli1");
        expect(out).toContain("postgres://erp_user");
    });

    it("gömülü atama biçimleri maskelenir", () => {
        expect(redactText('{"password":"abc123"}')).not.toContain("abc123");
        expect(redactText("api_key=ABCDEF123456")).not.toContain("ABCDEF123456");
    });

    it("kişisel veri kalıpları maskelenir (e-posta, VKN, kart)", () => {
        expect(redactText("müşteri ali@firma.com")).toBe("müşteri [email]");
        expect(redactText("VKN 1234567890 hatalı")).toBe("VKN [vkn] hatalı");
        expect(redactText("kart 4111 1111 1111 1111")).toContain("[card]");
    });

    it("teşhis için gerekli metni bozmaz", () => {
        const msg = "quote accept failed: order already exists";
        expect(redactText(msg)).toBe(msg);
    });
});

describe("redactValue — iç içe nesneler", () => {
    it("hassas alanın DEĞERİ hiç bakılmadan maskelenir", () => {
        const out = redactValue({ user: "ali", password: "p4ssw0rd", nested: { token: "abc" } }) as Record<string, unknown>;
        expect(out.password).toBe(REDACTED);
        expect((out.nested as Record<string, unknown>).token).toBe(REDACTED);
        expect(out.user).toBe("ali");
    });

    it("dizi elemanları da geçer", () => {
        const out = redactValue([{ apiKey: "gizli" }]) as Array<Record<string, unknown>>;
        expect(out[0].apiKey).toBe(REDACTED);
    });

    it("döngüsel referans patlatmaz", () => {
        const a: Record<string, unknown> = { name: "x" };
        a.self = a;
        expect(() => redactValue(a)).not.toThrow();
        expect(JSON.stringify(redactValue(a))).toContain("circular");
    });

    it("derinlik ve eleman tavanı uygulanır (§24 — ağır serialization yok)", () => {
        const deep = { a: { b: { c: { d: { e: "çok derin" } } } } };
        expect(JSON.stringify(redactValue(deep))).toContain("truncated");

        const big = Array.from({ length: 100 }, (_, i) => i);
        const out = redactValue(big) as unknown[];
        expect(out.length).toBeLessThanOrEqual(21);
        expect(String(out.at(-1))).toContain("more");
    });

    it("Error nesnesi mesaj+stack ile ama redakteli döner", () => {
        const err = new Error("parola: gizli123 ile giriş");
        const out = redactValue(err) as Record<string, unknown>;
        expect(out.name).toBe("Error");
        expect(String(out.message)).not.toContain("gizli123");
    });

    it("redactContext her zaman düz nesne döndürür", () => {
        expect(redactContext(null)).toBeNull();
        expect(redactContext("düz metin")).toEqual({ value: "düz metin" });
        expect(redactContext({ a: 1 })).toEqual({ a: 1 });
    });
});

describe("redactHeaders", () => {
    it("hassas başlıklar tamamen maskelenir", () => {
        const out = redactHeaders({
            authorization: "Bearer abcdef123456",
            cookie: "sb-auth=xyz",
            "user-agent": "Mozilla/5.0",
        });
        expect(out.authorization).toBe(REDACTED);
        expect(out.cookie).toBe(REDACTED);
        expect(out["user-agent"]).toBe("Mozilla/5.0");
    });
});

describe("redactString — uzunluk tavanı", () => {
    it("tavanı aşan metin kırpılır", () => {
        const out = redactString("x".repeat(5_000), 100);
        expect(out.length).toBeLessThanOrEqual(101);
    });
});

// ── Yazma yolunun redaksiyondan geçtiğinin kilidi ────────────────────────

describe("KİLİT — telemetri yazma yolu redaksiyonsuz yazamaz", () => {
    const RECORD = code(read("src/lib/telemetry/record.ts"));

    it("record.ts redaksiyon helper'larını import eder", () => {
        expect(RECORD).toMatch(/from "\.\/redact"/);
        expect(RECORD).toContain("redactContext");
        expect(RECORD).toContain("redactString");
    });

    it("kullanıcıdan gelen HER alan redaksiyondan geçer", () => {
        // Bu dört alan hassas veri taşıyabilen alanlardır; ham yazılırlarsa
        // panel bir sızıntı yüzeyine döner.
        expect(RECORD).toMatch(/title: redactString\(/);
        expect(RECORD).toMatch(/normalizedMessage: redactString\(/);
        expect(RECORD).toMatch(/stack: stack \? redactString\(/);
        expect(RECORD).toMatch(/context: redactContext\(/);
        expect(RECORD).toMatch(/userAgent: userAgent \? redactString\(/);
    });

    it("sistem olayı mesajı da redakte edilir", () => {
        expect(RECORD).toMatch(/message: redactString\(options\.message/);
    });

    it("arıza mesajı bile redakte edilir (sayaç sızıntı yapmasın)", () => {
        expect(RECORD).toMatch(/lastFailureMessage = redactString\(/);
    });
});
