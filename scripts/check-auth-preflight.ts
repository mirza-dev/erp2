/**
 * C1 — Login brick-risk preflight (READ-ONLY).
 *
 * Brick senaryosu: `proxy.ts` her oturumu `isProvisionedUser` ile süzer;
 * kullanıcı yönetimine (kurtarma kolu) erişim `admin` rolü ister
 * (`parseRoles ∋ admin`). Deploy sonrası HİÇBİR `auth.users` kaydında
 * `app_metadata.roles ∋ admin` YOK + prod `ADMIN_EMAILS` boş/yanlışsa →
 * kimse admin değil → /dashboard/settings/users kapalı → kimse provize
 * edilemez → BRICK. Bu script o çekirdek koşulu deploy ÖNCESİ doğrular.
 *
 * Tasarım: `check-migrations.ts` gate deseni — tek read-only Supabase admin
 * okuması (`listUsers`), HİÇBİR mutasyon. Rol tespiti üretimle BİREBİR olsun
 * diye gerçek `parseRoles`/`isProvisionedUser` import edilir (saf modül).
 *
 * Kullanım (deploy ÖNCESİ): npm run preflight:auth
 * Çıkış: kalıcı+bootstrap admin == 0 → exit 1 (BRICK). listUsers hatası →
 *        fail-closed (admin sayılamadı → exit 1).
 *
 * SINIR: `ADMIN_EMAILS` buradan LOCAL env'den okunur — prod Coolify değeri
 * ayrıca doğrulanmalı (script onu göremez). "Kalıcı admin" (app_metadata.roles)
 * env-bağımsızdır → prod'da da geçerlidir.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseRoles, isProvisionedUser } from "../src/lib/auth/permissions";

// .env.local'ı elle yükle (check-migrations deseni; dotenv bağımlılığı yok).
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error("[auth-preflight] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
    process.exit(2);
}

const svc = createClient(url, key, { auth: { persistSession: false } });

function adminEmailsFromEnv(): string[] {
    return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface AuthUser {
    id: string;
    email?: string;
    app_metadata?: Record<string, unknown> | null;
    user_metadata?: Record<string, unknown> | null;
}

async function listAllUsers(): Promise<AuthUser[]> {
    const all: AuthUser[] = [];
    const perPage = 1000;
    for (let page = 1; ; page++) {
        const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
        // fail-closed: hata → admin sayılamaz → BRICK varsay (D'deki R4 deseni).
        if (error || !data) {
            console.error(`[auth-preflight] listUsers hatası (sayfa ${page}): ${error?.message ?? "veri yok"}`);
            console.error("→ fail-closed: admin sayımı güvenilir değil, deploy ERTELENMELİ.");
            process.exit(1);
        }
        all.push(...(data.users as unknown as AuthUser[]));
        if (data.users.length < perPage) break;
    }
    return all;
}

async function main() {
    const adminEmails = adminEmailsFromEnv();

    const users = await listAllUsers();

    let provisioned = 0;
    const durableAdmins: string[] = [];   // app_metadata.roles ∋ admin (env-bağımsız)
    const bootstrapAdmins: string[] = [];  // yalnız LOCAL ADMIN_EMAILS ile admin
    const misProvisioned: string[] = [];   // user_metadata rol VAR, app_metadata.roles YOK

    for (const u of users) {
        const email = u.email ?? null;
        if (isProvisionedUser(u.app_metadata, email, adminEmails)) provisioned++;

        const durable = parseRoles(u.app_metadata, email, []).includes("admin");
        const withEnv = parseRoles(u.app_metadata, email, adminEmails).includes("admin");
        if (durable) durableAdmins.push(email ?? u.id);
        else if (withEnv) bootstrapAdmins.push(email ?? u.id);

        const appRoles = u.app_metadata?.roles;
        const hasAppRoles = Array.isArray(appRoles) && appRoles.length > 0;
        const um = u.user_metadata ?? {};
        const hasUserMetaRole = Boolean(um.role) || (Array.isArray(um.roles) && um.roles.length > 0);
        if (!hasAppRoles && hasUserMetaRole) misProvisioned.push(email ?? u.id);
    }

    console.log(`[auth-preflight] toplam kullanıcı: ${users.length} · provize: ${provisioned}`);
    console.log(`  kalıcı admin (app_metadata.roles ∋ admin — env-bağımsız, prod'da da geçerli): ${durableAdmins.length}`);
    for (const e of durableAdmins) console.log(`    ✅ ${e}`);
    console.log(`  bootstrap admin (yalnız LOCAL ADMIN_EMAILS): ${bootstrapAdmins.length}`);
    for (const e of bootstrapAdmins) console.log(`    ⚠️  ${e} — prod Coolify ADMIN_EMAILS'e bağlı`);

    // ADMIN_EMAILS format doğrulaması (LOCAL).
    if (adminEmails.length === 0) {
        console.log("  ADMIN_EMAILS (LOCAL): boş — prod Coolify env'de set olup olmadığını AYRICA doğrula.");
    } else {
        console.log(`  ADMIN_EMAILS (LOCAL): ${adminEmails.length} giriş`);
        const bad = adminEmails.filter((e) => !EMAIL_RE.test(e));
        for (const e of bad) console.log(`    ❌ geçersiz e-posta formatı: "${e}"`);
    }

    if (misProvisioned.length > 0) {
        console.log(`  ⚠️  mis-provision (user_metadata rol VAR, app_metadata.roles YOK → sessizce viewer): ${misProvisioned.length}`);
        for (const e of misProvisioned) console.log(`    ⚠️  ${e}`);
    }

    const totalAdmins = durableAdmins.length + bootstrapAdmins.length;
    if (totalAdmins === 0) {
        console.error("\n[auth-preflight] ❌ BRICK RİSKİ: HİÇBİR admin yok (kalıcı + bootstrap = 0).");
        console.error("→ Deploy sonrası kimse /dashboard/settings/users'a erişemez. Kurtarma:");
        console.error("   npm run create-admin <email> <şifre>   VEYA   Coolify ADMIN_EMAILS set + redeploy.");
        process.exit(1);
    }
    if (durableAdmins.length === 0) {
        console.warn("\n[auth-preflight] ⚠️  Kalıcı admin YOK — admin erişimi YALNIZ ADMIN_EMAILS'e bağlı.");
        console.warn("→ ADMIN_EMAILS HER İKİ Coolify ortamında da set olmalı; aksi halde o ortamda BRICK.");
        console.warn("→ Tavsiye: en az bir kullanıcıya `app_metadata.roles:[\"admin\"]` ata (create-admin / panel).");
        return; // exit 0 — uyarı, blok değil
    }
    console.log("\n[auth-preflight] OK — en az bir kalıcı admin var (env-bağımsız brick koruması).");
}

main().catch((err) => {
    console.error("[auth-preflight] beklenmeyen hata:", err);
    process.exit(2);
});
