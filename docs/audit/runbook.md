# ERP2 Audit Runbook
_Ortam: Lokal dev (`localhost:3000`) | DB: Supabase cloud_

## Önkoşullar

```bash
# k6 kurulu olmalı
k6 version

# Dev server çalışıyor olmalı
npm run dev

# .env.local'den gerekli değerler
source .env.local  # veya export CRON_SECRET=xxx SESSION_COOKIE=xxx
```

**SESSION_COOKIE nasıl alınır:**
1. Tarayıcıda `http://localhost:3000` aç, giriş yap
2. Geliştirici Araçları → Application → Cookies
3. `sb-xxx-auth-token` cookie değerini kopyala
4. `export SESSION_COOKIE="sb-xxx-auth-token=..."`

---

## Faz 1 — Güvenlik Audit (Statik, Çalıştırma Gerektirmez)

Bulgular: `docs/audit/faz1-security-findings.md`
Auth matrisi: `docs/audit/faz1-auth-matrix.md`

```bash
# Baseline testler
npm run test          # 1609 test — hepsi yeşil olmalı
npm run build         # 0 hata, 0 TS hatası olmalı
npm run smoke         # Dev server çalışırken (SESSION_COOKIE gerekli)
```

---

## Faz 2 — Concurrency Testleri

### 2.1 Quote Convert Yarışı (migration 037 doğrulaması)

```bash
# 1. Önce "accepted" durumunda bir teklif oluştur (UI'dan veya API)
# 2. Teklif ID'sini al (TKL-YYYY-NNN formatında)
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SESSION_COOKIE="$SESSION_COOKIE" \
  -e QUOTE_ID="TKL-2026-001" \
  --out json=results/concurrency-quote-$(date +%Y%m%d-%H%M%S).json \
  tests/load/concurrency-quote-convert.k6.js

# Beklenen çıktı:
#   convert_success_201 count <= 1
#   convert_conflict_409 count > 0
```

### 2.2 Stok Rezervasyon Yarışı (kademeli)

```bash
# Kademe 1: 5 VU
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SESSION_COOKIE="$SESSION_COOKIE" \
  -e PRODUCT_ID="<stok kısıtlı ürün id>" \
  -e CUSTOMER_ID="<müşteri id>" \
  -e TARGET_VU=5 \
  --out json=results/stock-reservation-vu5-$(date +%Y%m%d).json \
  tests/load/concurrency-stock-reservation.k6.js

# Invariant kontrol (Supabase SQL Editor):
# → docs/audit/invariant-checks.sql — Query 1, 2, 4 çalıştır

# Kademe 2: 15 VU (aynı komut, TARGET_VU=15)
# ... 30, 50, 75, 100 VU sırasıyla devam
```

### 2.3 Alert Scan Kırılma Testi

```bash
for VU in 5 15 30 50 75 100; do
  echo "=== Kademe: $VU VU ==="
  k6 run \
    -e BASE_URL=http://localhost:3000 \
    -e CRON_SECRET="$CRON_SECRET" \
    -e TARGET_VU=$VU \
    --out json=results/scan-vu${VU}-$(date +%Y%m%d).json \
    tests/load/breakpoint-scan.k6.js
  echo "Kademe $VU bitti — invariant SQL çalıştır"
  sleep 30  # DB'nin normalize olması için
done
```

---

## Faz 3 — Kapasite Testi

### 3.1 Small Profil (500 ürün, 1000 sipariş)

```bash
# Önce .env.local'i yükle
export $(grep -v '^#' .env.local | xargs)

# Veri yükle
npx tsx scripts/seed-large.ts --profile=small

# Test çalıştır
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SESSION_COOKIE="$SESSION_COOKIE" \
  -e PROFILE=small \
  --out json=results/capacity-small-$(date +%Y%m%d).json \
  tests/load/capacity-endpoints.k6.js

# Temizle
npx tsx scripts/seed-large.ts --clean
```

### 3.2 Medium Profil (5.000 ürün, 10.000 sipariş)

```bash
npx tsx scripts/seed-large.ts --profile=medium
k6 run -e PROFILE=medium -e SESSION_COOKIE="$SESSION_COOKIE" \
  --out json=results/capacity-medium-$(date +%Y%m%d).json \
  tests/load/capacity-endpoints.k6.js
npx tsx scripts/seed-large.ts --clean
```

### 3.3 Edge Case Testleri (curl)

```bash
# Limit abuse
curl -s -b "$SESSION_COOKIE" "http://localhost:3000/api/inventory/movements?product_id=xxx&limit=999999"
curl -s -b "$SESSION_COOKIE" "http://localhost:3000/api/orders?page=999999"

# Bozuk JSON
curl -s -X POST -H "Content-Type: application/json" -b "$SESSION_COOKIE" \
  -d '{broken json}' "http://localhost:3000/api/orders"

# Enum dışı status
curl -s -X PATCH -H "Content-Type: application/json" -b "$SESSION_COOKIE" \
  -d '{"commercial_status":"invalid_status"}' "http://localhost:3000/api/orders/xxx"

# Negatif quantity
curl -s -X POST -H "Content-Type: application/json" -b "$SESSION_COOKIE" \
  -d '{"customer_id":"xxx","lines":[{"product_id":"yyy","quantity":-1,"unit_price":100}]}' \
  "http://localhost:3000/api/orders"

# Çok büyük sayı
curl -s -X POST -H "Content-Type: application/json" -b "$SESSION_COOKIE" \
  -d '{"customer_id":"xxx","lines":[{"product_id":"yyy","quantity":99999999,"unit_price":99999999}]}' \
  "http://localhost:3000/api/orders"
```

---

## Invariant Kontrol — Her Kademe Sonrası

Supabase Dashboard → SQL Editor → `docs/audit/invariant-checks.sql` içeriğini yapıştır.

**Beklenen:** Tüm sorgular 0 satır döndürmeli.
**Sorun çıkarsa:** Testi durdur, hangi kademe ve VU sayısında olduğunu kaydet.

---

## Sonuç Toparlama

```bash
# Tüm JSON sonuçlarını listele
ls -lh results/

# k6 JSON'dan özet al (jq gerekli)
jq '.metrics | {
  p50: .http_req_duration.values."p(50)",
  p95: .http_req_duration.values."p(95)",
  p99: .http_req_duration.values."p(99)",
  failed: .http_req_failed.values.rate,
  rps: .http_reqs.values.rate
}' results/scan-vu15-*.json
```

Sonuçlar `docs/audit/faz4-capacity-matrix.md` dosyasına aktarılır.

---

## Temizlik

```bash
# Load test verisini sil
npx tsx scripts/seed-large.ts --clean

# Demo verisini yenile (bozulduysa)
curl -X DELETE -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/seed
curl -X POST  -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/seed
```
