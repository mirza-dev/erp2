#!/usr/bin/env bash
# KOBİ simülasyonu — KAYNAK KODU KİLİDİ.
#
# Simülasyon çalışırken (.sim/ACTIVE varken) Bash ile YALNIZCA simctl
# çalıştırılabilir. Amaç: yapay çalışanlar sistemi gerçek bir insan gibi
# kullansın — kaynak koda bakarak "aslında arka planda şöyle oluyor" diye
# akıl yürütemesin, internete çıkıp çözüm arayamasın.
#
# Kilit HERKESİ bağlar (patron dahil): sim koşarken kod okunmaz.
# Bulgu dosyaları Write aracıyla yazılır — bu kanca yalnız Bash'i geçer.
# Kilidi indirmek için:  node scripts/sim/simctl.mjs stop

set -uo pipefail
input=$(cat)

# Proje kökünü kancanın kendi konumundan bul (cwd'ye güvenme)
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$root/.sim/ACTIVE" ] || exit 0

cmd=$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)

# İzin verilen tek şey: simctl
if printf '%s' "$cmd" | grep -Eq '(^|[;&|]\s*)(cd [^;&|]+ (&&|;) )?(npm run sim|node (\./)?scripts/sim/simctl\.mjs|npx tsx scripts/sim/simctl)'; then
    exit 0
fi

cat >&2 <<'MSG'
Simülasyon çalışıyor — bu komut engellendi.

Sistemi yalnızca şu araçla kullanabilirsin:
  node scripts/sim/simctl.mjs <kim> <ne> [değer]

Kaynak koda bakmak, dosya okumak, internete çıkmak SİMÜLASYONUN DIŞINDADIR.
Bir şey çalışmıyorsa sebebini tahmin etme — ne gördüğünü raporuna yaz.
Yardım için:  node scripts/sim/simctl.mjs yardim
MSG
exit 2
