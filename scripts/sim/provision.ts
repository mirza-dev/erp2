/**
 * Dört sim çalışanının ERP hesabını açar.
 *
 * Şifre `SIM_PASSWORD` env'inden okunur — koda yazılmaz, loglanmaz, ekrana
 * basılmaz (`scripts/create-admin.ts` kalıbı).
 *
 * Roller `app_metadata.roles`'a yazılır: uygulamanın authz için okuduğu TEK yer
 * (`src/lib/auth/permissions.ts` — `user_metadata` bilinçli olarak okunmaz).
 *
 * `--sil` ile hesapları kaldırır (sim sonu temizliği).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { SIM_ROLES } from "./roles";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("EKSİK ENV: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(2); }

const sb = createClient(url, key);
const remove = process.argv.includes("--sil");

async function main(): Promise<void> {
    const password = process.env.SIM_PASSWORD;
    if (!remove && !password) {
        console.error("SIM_PASSWORD env yok.\n.env.local dosyasına ekleyin:  SIM_PASSWORD=<güçlü-bir-şifre>");
        process.exit(2);
    }

    const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) { console.error(`listUsers hatası: ${error.message}`); process.exit(1); }
    const byEmail = new Map((data?.users ?? []).map(u => [u.email?.toLowerCase(), u]));

    for (const r of SIM_ROLES) {
        const found = byEmail.get(r.email);

        if (remove) {
            if (!found) { console.log(`—  ${r.email} zaten yok`); continue; }
            const { error: e } = await sb.auth.admin.deleteUser(found.id);
            console.log(e ? `❌ ${r.email}: ${e.message}` : `🗑  ${r.email} silindi`);
            continue;
        }

        if (found) {
            const { error: e } = await sb.auth.admin.updateUserById(found.id, {
                password,
                app_metadata: { roles: r.roles },
                user_metadata: { display_name: `${r.person} (SIM)` },
            });
            console.log(e ? `❌ ${r.email}: ${e.message}` : `♻️  ${r.email} güncellendi → ${r.roles.join("+")}`);
        } else {
            const { error: e } = await sb.auth.admin.createUser({
                email: r.email,
                password,
                email_confirm: true,
                app_metadata: { roles: r.roles },
                user_metadata: { display_name: `${r.person} (SIM)` },
            });
            console.log(e ? `❌ ${r.email}: ${e.message}` : `✅ ${r.email} açıldı → ${r.roles.join("+")}  (${r.person}, ${r.title})`);
        }
    }
    console.log(remove ? "\nSim hesapları kaldırıldı." : "\nDört çalışan işe alındı.");
}

main();
