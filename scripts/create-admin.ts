/**
 * İlk admin kullanıcısını oluşturur.
 * Kullanım: npm run create-admin <email> <şifre>
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const [,, email, password] = process.argv;

if (!email || !password) {
    console.error("Kullanım: npm run create-admin <email> <şifre>");
    console.error("Örnek:    npm run create-admin admin@pmt.com Test123!");
    process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error("Hata: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local'da tanımlı olmalı.");
    process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (error) {
        console.error("Kullanıcı oluşturulamadı:", error.message);
        process.exit(1);
    }

    console.log("Kullanıcı oluşturuldu:", data.user.email, "(id:", data.user.id + ")");
}

main();
