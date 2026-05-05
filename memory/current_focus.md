---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Sıradaki — G11 (AI öneri tutarlılığı, 6h CRON + manuel) ve Faz 12 (gerçek Paraşüt API)
**Son:** Ayarlar production-ready KAPALI (2026-05-05; 2194 test) — Kullanıcı/Bildirimler API + validation + DemoBanner koşullu
**Önceki:** Production bulgular 1. tur KAPALI (2026-05-05; 2158 test) — AI filter alignment + import UI + multi-currency netleştirme
**Önceki²:** Seed idempotent + UI tetikleyici KAPALI (2026-05-05) — settings'te "Tüm Verileri Sıfırla ve Demo Yükle" butonu

---

## Ayarlar Production-Ready (2026-05-05) — KAPALI

**Hedef:** Settings sayfası 5 sekmeli ama Kullanıcı/Bildirimler tamamen mock + Firma validation yok + DemoBanner her zaman görünüyordu. Production-ready hale getirmek.

**1 commit, 12 dosya:**

**Backend:**
- Migration `045_user_preferences_avatars.sql`: `user_notification_preferences` tablosu (auth.users FK + UNIQUE user_id+notification_type) + `user-avatars` storage bucket (1MB, public, RLS service_role only).
- `src/lib/notification-types.ts`: 5 tip sabit liste (stock_critical, order_pending, order_new, sync_error, order_shipped) + her birinin label/desc'i.
- `src/lib/validation.ts`: isValidEmail (regex), isValidTaxNumber (10/11 hane filter), isValidUrl (protokol opsiyonel).
- `src/lib/supabase/user-profile.ts`: dbGetUserProfile / dbUpdateUserFullName / dbUpdateUserAvatarUrl — Supabase `auth.users.user_metadata` üzerinde merge update (admin API).
- `src/lib/supabase/user-preferences.ts`: dbListUserPrefs (DB satırı yoksa default virtual list) / dbUpsertUserPrefs (whitelist + onConflict upsert).

**API endpoints:**
- `GET/PATCH /api/settings/user/profile` — session auth, fullName 2-100 char validation, trim
- `POST /api/settings/user/password` — cookie'siz anon client ile signInWithPassword doğrulaması → updateUser({ password }) → audit_log entry. Supabase updateUser mevcut şifre sormuyor; manuel doğrulama zorunlu.
- `POST /api/settings/user/avatar` — multipart, image MIME, ≤1MB, path `${user.id}.{ext}`, cache-bust ?t={ts}
- `GET/PATCH /api/settings/user/preferences` — session auth, sanitize+whitelist, upsert

**Frontend:**
- KullanıcıTab: tüm mock kaldırıldı, gerçek API'ye bağlandı. Avatar upload, profile save, password change tam akış. Demo modda guard mesajı korundu.
- BildirimlerTab: mock kaldırıldı, NOTIFICATION_TYPES'a göre render, GET/PATCH wire. Demo modda toggle disabled.
- FirmaTab: inline validation eklendi (required name, email/VKN/URL format). Hatalı alanlarda border kırmızı + FieldError component. Save anında validate, hata varsa toast + bloklu.
- DemoBanner: `useIsDemo` koşulu — production'da hiç render edilmiyor.

**Yeni 4 test dosyası (36 test):**
- `settings-user-profile.test.ts` (8 test): GET 401/200, PATCH 401/400 (boş, kısa, uzun)/200, trim
- `settings-user-password.test.ts` (7 test): 401, current empty, < 8 char, same as new, wrong current, happy path + audit_log, updateUser error
- `settings-user-preferences.test.ts` (5 test): GET 401/200, PATCH 401/400 (non-array)/200/sanitize
- `settings-firma-validation.test.ts` (16 test): EMAIL_RE valid/invalid, taxNumber 10/11/9/12 + non-digit filter, URL with/without protocol/path

**Domain kuralı:**
- User profile data Supabase `auth.users.user_metadata`'da tutulur (full_name, avatar_url) — custom tablo gereksiz
- Şifre değişikliğinde mevcut şifre doğrulaması ZORUNLU (Supabase updateUser eski şifre sormuyor — çalınmış oturum riskine karşı). Cookie'siz fresh anon client kullan, persistSession:false.
- DemoBanner her zaman koşullu — `useIsDemo()` üzerinden, sayfa içi if/return ile değil.
- NOTIFICATION_TYPES tek source of truth (frontend display + backend whitelist).

**Test:** 133 dosya · 2194 test yeşil · TS clean · 0 lint hatası

---

## Kapsam Dışı (Sonraki turlar)
- E-posta değiştirme (Supabase auto-confirm + grace period UX)
- SMTP gönderim altyapısı (Resend/SendGrid) — preferences kaydedilir, gönderim ayrı iş
- Browser push notifications (service worker + Web Push API)
- Locale/timezone, role-based access

---

## Production Bulgular 1. Tur (2026-05-05) — KAPALI

**Hedef:** Production deploy sonrası kullanıcı tarafından bildirilen 4 sorun.

**1 commit, 6 dosya:**
- **Bulgu 1 — "Beklemede" ghost satır (HIGH):** Frontend `reorderSuggestions` filtresi `available ≤ min` VEYA `orderDeadline ≤ 7 gün` listesi gösteriyordu, ama `/api/ai/purchase-copilot` route sadece `available ≤ min` filtresi kullanıyordu. Frontend'de listelenen ama AI'da olmayan ürünlerin (örn. AA-SOV-DN80: available=14, min=6, ama deadline geçmiş) suggested rec'leri her load'da expire oluyor → UI "Beklemede" gösteriyor. Fix: AI route'a `computeOrderDeadline` + `dateDaysFromToday` import edildi, filtre `shouldSuggestReorder` ile aligned.
- **Bulgu 2 — Import "Kaynak ?" rozet (MEDIUM):** `sourceChipLabel` sadece "memory"/"ai"/"user" tanırdı; detect-columns route'unun döndürdüğü `"fallback"` (FALLBACK_FIELD_MAP hit) için "?" gösteriyordu. Fix: "fallback" → "Otomatik", default → "—".
- **Bulgu 3 — Apply-mappings sessiz hata (MEDIUM):** Route catch block generic `"Eşleştirme uygulaması başarısız."` döndürüyordu, debugging için kötü. Fix: actual error message propagate (`Eşleştirme uygulanamadı: ${err.message}`).
- **Bulgu 4 — Multi-currency tutar netleştirme (LOW):** `+ $133.600,00` formatı kullanıcılarda toplama gibi algılanıyordu. Fix: "+" kaldırıldı, her tutar yanına currency code eklendi (`€518.400,00 EUR` / `$133.600,00 USD`); başlık "Toplam Sipariş Tutarı" → "Önerilen Satın Alma Tutarı" + tooltip.

**Domain kuralı:** AI öneri filtresi UI filtresiyle aynı kapsamda olmalı. Aksi halde "stok ≥ min ama deadline geçmiş" ürünler için frontend liste gösterirken AI sürekli expire ederek "Beklemede" placeholder'a düşüyor — kullanıcı confused.

**Test güncellemeleri:**
- `ai-purchase-copilot-route.test.ts:110-118` — "healthy" product fixture'da `daily_usage: null` ekle (deadline path'i devre dışı bırak)
- `import-source-chips-ai-percent.test.ts:35-37` — fallback test güncelle, bilinmeyen test ayrıldı

**Test:** 129 dosya · 2158 test yeşil · TS clean · 0 lint hatası

---

## Seed Idempotent + UI Tetikleyici (2026-05-05) — KAPALI

**Hedef:** Production DB hâlâ eski junk veriyle dolu (811 alert, silinmiş ürünler, "cart curt" siparişleri) — seed endpoint hiç manuel curl ile çağrılmamıştı. Tek tıkla "tüm veri temiz + demo seed yükle" akışı gerekti.

**1 commit, 3 dosya:**
- **`src/app/api/seed/route.ts`** —
  - `clearAllData(supabase)` helper extract (DELETE flow tek yerden, DRY).
  - `POST` artık idempotent: önce `clearAllData`, sonra seed insert. Response'a `cleared: { load_orders, demo_tables }` eklendi.
  - `checkAuth` genişletildi: `CRON_SECRET` Bearer **VEYA** authenticated user session (`@/lib/supabase/server` `createClient`). UI'dan tetikleme için.
- **`src/components/settings/ResetDemoSection.tsx`** (yeni) — kırmızı "Tehlikeli Bölge" kartı + confirm modal + busy state + toast + 2 sn sonra reload. Demo modda disabled (DEMO_DISABLED_TOOLTIP).
- **`src/app/dashboard/settings/page.tsx`** — 2-kolon layout altına `<ResetDemoSection />` mount.

**Domain kuralı:** Seed endpoint authenticated user **veya** CRON_SECRET bearer ile tetiklenebilir. UI tarafından çağrı için Authorization header gerekmez (cookie-based session). Demo cookie kabul edilmez (sadece gerçek auth). Tek admin kullanan iç araç olduğu için ek role kontrolü yok.

**Test:** 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

---

## Demo Seed Yenileme (2026-05-04) — KAPALI

**Hedef:** Müşteri turuna uygun sade öz boyut + her sayfada anlamlı veri.

**1 commit — `src/app/api/seed/route.ts` rewrite:**
- Mevcut: 1613 satır, 39 ürün, 15 sipariş — kalabalık + LOAD- kalıntısı temizlenmiyor + quotes/ai_recommendations/import_*/company_settings/parasut_oauth_tokens boş
- Yeni: 8 ürün · 4 müşteri · 7 sipariş · 3 teklif · 5 AI öneri · 2 import batch · 3 üretim · 1 şirket ayarı + parasut stub

**Veri tasarımı:**
- 8 ürün (her biri tek senaryo): KV-3P-DN50 normal/manufactured/BOM kaynağı, KV-DB-DN100 CRITICAL, KV-3P-DN80 WARNING, KB-WT-DN150 past deadline, AA-SOV-DN80 imminent 3 gün (45 gün Almanya lead), CV-KV-DN65 imminent 1 gün, CT-SS-DN50 fiyat eksik (price=NULL → Sprint C sayacı), BE-SC-M24x100 BOM bileşeni
- 4 müşteri: Tüpraş (TRY), Abdi İbrahim (EUR), Enerjisa (USD), Ülker (VKN-eksik — Paraşüt preflight)
- 7 sipariş: çift eksen matrisi tam (draft+unallocated, pending+expired_quote, approved+allocated quote_id'li, partially_allocated+shortage, partially_shipped, shipped+parasut_error, cancelled)
- 3 teklif: TKL-2026-001 sent (geçerli), TKL-2026-002 expired (alert), TKL-2026-003 accepted (ORD-2026-0003'e bağlı)
- 5 AI öneri: 2 suggested, 1 accepted, 1 rejected, 1 edited + ai_feedback satırları
- 2 import batch: confirmed + 3 merged draft / review + 4 mixed-status draft
- 3 üretim: KV-3P-DN50 (today, normal), KV-3P-DN50 (daysAgo(2), 2 fire), KB-WT-DN150 (daysAgo(5), normal)
- BOM: KV-3P-DN50 ← CT-SS-DN50 (1) + BE-SC-M24x100 (8)

**DELETE akışı:**
- Aşama 1 (yeni): LOAD- prefix temizliği — sales_orders.notes/customers.name/products.sku LIKE
- Aşama 2: 25 demo tablo (FK alt → üst sırasıyla; quotes/quote_line_items/ai_*/import_*/column_mappings/parasut_oauth_tokens dahil)
- Aşama 3: company_settings UPDATE ile sıfırla (singleton invariant)
- Aşama 4: order_counters reset (last_seq=0)

**POST akışı:** company_settings UPDATE → parasut_oauth_tokens UPSERT → products → customers → quotes + quote_line_items → sales_orders (quote_id refs) + order_lines → reservations + shortages + product.reserved sync → BOM → commitments → production → movements → shipments + invoices + payments → ai_recommendations + ai_feedback → import_batches + drafts → column_mappings + ai_entity_aliases → sync_logs + audit_log + order_counters

**Domain kuralı:** ai_recommendations.entity_id text kolonu (UUID değil); products.id'yi string olarak insert edilmeli. Active suggested için entity başına 1 satır constraint var (idx_recs_active_unique). company_settings singleton — DELETE değil UPDATE ile sıfırla. parasut_oauth_tokens singleton_key UNIQUE → upsert onConflict.

**Test:** 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası (test mock'lar DB'ye dokunmuyor).

**Manuel doğrulama (curl + demo cookie):**
1. `curl -X DELETE /api/seed -H "Authorization: Bearer $CRON_SECRET"` → tüm veri temiz
2. `curl -X POST /api/seed -H "Authorization: Bearer $CRON_SECRET"` → response: `{ products: 8, customers: 4, orders: 7, quotes: 3, ai_recommendations: 5, import_batches: 2, ... }`
3. Demo cookie ile gez: /dashboard, /dashboard/products, /dashboard/orders, /dashboard/customers, /dashboard/quotes, /dashboard/purchase/suggested, /dashboard/import, /dashboard/settings, /dashboard/parasut, /dashboard/alerts — her sayfa dolu

---

---

## Sprint C Bulgular 4. Tur Özet (2026-05-02) — KAPALI

**Hedef:** 3. tur sonrası kalan G3/G5/G4 bulgularını kapatmak.

**1 commit (`3e01cd0`):**
- **G3 (HIGH):** "Açık Sipariş" sütunu hardcoded `0` → gerçek sayı. `page.tsx`'e `openOrderCounts` state + mount fetch (alerts sayfası pattern paralel: `fetch("/api/orders/open-count-by-product")`). Mobil + masaüstü cell'ler vurgu rengi (>0 ise accent-text). Backend helper (`dbGetOpenOrderCountByProduct`) ve endpoint zaten hazırdı.
- **G5 (MEDIUM):** Mobil kart pending state'inde inline IIFE + "Karar ver →" → `<RecActionCell>` (drawer açmadan inline aksiyonlar). Decided'da "Kararı geri al" linki otomatik (RecActionCell zaten içeriyor). RejectMode input'una `maxLength={200}` (plan G5 line 136).
- **G4 (MEDIUM/LOW):** 2 yeni test dosyası — `purchase-suggested-refetch-after-mutation` (6 test, fake timers + debounce), `purchase-suggested-demo-mode` (5 test, helper kontrat + frontend simülasyonu). 2 helper extract → `purchase-utils.ts`:
  - `scheduleRefetchAfterMutation(timerRef, loadFn, delayMs=300)` — 4 handler'da duplicate olan debounce pattern
  - `shouldSkipAiFetch(isDemo)` — demo modda AI fetch kısa devresi (page.tsx loadAiData içinde tek noktaya alındı)
- `acik-column` testine `openOrderCount` field'ı route response'unda olmadığını doğrulayan regresyon eklendi.

**Geçersiz iddia:** "Undo başarı toast'ı yok" — `page.tsx:663`'te VAR (3. turda eklenmiş).

**Domain kuralı:** UI mount'ta endpoint çağrısı yaparken AbortController kullan (re-mount/dependency change'de pending fetch iptal edilsin). Best-effort fail handling: hata durumunda boş object/array → 0 default.

**Test:** 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

---

## Sprint C Bulgular 3. Tur Özet (2026-05-02) — KAPALI

**Hedef:** G1/G3/G5 bulgularını kapatmak.

**1 commit (`52a082d`):**
- **G1 (HIGH):** `dbGetAllActiveProductIds` yeni helper (`products.ts`) — copilot route artık pageSize:500 truncation'ından bağımsız tam aktif ID setiyle orphan expire yapıyor. Eski kod: `products.map(p => p.id)` (500 limitli). Yeni: ayrı SELECT id sorgusu, tüm aktif ürünler.
- **G3 (HIGH):** "Stok Açığı" → "Açık Sipariş" — masaüstü header + tooltip + hücre (0 göster); mobil kart etiketi. Tooltip: "Bu üründe açık (onaylı + sevk edilmemiş) sipariş sayısı". Kullanılmayan `deficit` değişkenleri silindi.
- **G5 (MEDIUM):** Masaüstü KARAR hücresi inline IIFE'den `<RecActionCell>` bileşenine geçirildi — pending satırlar artık doğrudan Kabul Et/Düzenle/Reddet chiplerini gösteriyor (drawer açmak gerekmez). `handleUndo` başarı yoluna `toast({ type: "success", message: "Karar geri alındı." })` eklendi.
- **3 yeni test:** `purchase-suggested-multi-currency` (8 test), `purchase-suggestions-on-product-delete` (5 test), `purchase-suggested-acik-column` (5 test)
- **Güncellenen testler:** `ai-purchase-copilot-route.test.ts` + `purchase-suggested-ai-banner.test.ts` — `dbGetAllActiveProductIds` mock eklendi.

**Domain kuralı:** PostgREST `.range()` ile pageSize:N limiti, expire için gereken "tüm aktif ID" listesini kesiyor. Expire işleminde her zaman ayrı `SELECT id` sorgusu kullan (pagination yok).

**Test:** 127 dosya · 2145 test yeşil · TS clean · 0 lint hatası

**Plan `03-purchase-suggested-implementation.md`'de eksik kalan test dosyaları:**
- `purchase-suggested-refetch-after-mutation.test.ts` — frontend-only (jsdom gerektirir), node env'de test edilemez
- `purchase-suggested-demo-mode.test.ts` — frontend-only (middleware + demo cookie), node env'de test edilemez

---

## Sprint C Bulgular 2. Tur Özet (2026-05-02) — KAPALI

**Hedef:** /dashboard/purchase/suggested sayfasının tasarımını koruyup eksik işlevsellik + bug + lifecycle.

**1 commit:**
- Fix 1 (HIGH): NULL fiyat sıfıra düşüyor → `??` → `||` (page.tsx) — missingPriceCount artık doğru
- Fix 2 backend (HIGH): "Kararı geri al" akışı → VALID_TRANSITIONS'a reverse geçişler + ALLOWED_STATUSES'a "suggested"
- Fix 2 frontend (HIGH): handleUndo + optimistic rollback + "Kararı geri al" butonu (table + drawer)
- Fix 3 (MEDIUM): Ürün silinince/deaktif edilince rec'ler anında expire — dbExpireEntityRecommendations yeni helper
- Fix 4: 5 adlandırılmış test — action-feedback, cost-fallback, ai-banner, product-cleanup, empty
- 124 dosya · 2128 test yeşil · TS clean · 0 lint hatası

---

## Sprint C Özet (2026-05-01) — KAPALI

**Hedef:** /dashboard/purchase/suggested sayfasının tasarımını koruyup eksik işlevsellik + bug + lifecycle.

**3 commit:**
- Part 1 (`2816193`): AI fail banner + costPrice NULL fallback + 300ms refetch + isDemo guard. Backend route'a `ai_call_failed` flag.
- Part 2 (`27ca6b6`): `dbExpireRecommendationsForMissingEntities` — silinmiş ürünün suggested+decided rec'lerini expire eder; route scan başında çağrı (Sprint A G1 alerts pattern paralel).
- Part 3 (`d45bd2b`): "Açık" → "Stok Açığı" (header + tooltip + 0); multi-currency TOPLAM (Map ile group; tek currency mevcut görünüm, karışıksa "+ $X" alt satır).

**Test:** 106 dosya · 2003 test yeşil · TS clean.

---

## Sprint B Özet (2026-05-01) — KAPALI

**Hedef:** /dashboard/import wizard'ı tasarımını koruyup eksik işlevsellik + bug + veri bütünlüğü.

**4 commit:**
- Part 1 (`3e0a196`): file size limit (25 MB) + inline edit rollback (sessiz fail kaldırıldı)
- Part 2 (`8e6a1ca`): Sonuç ekranında entity-bazlı kırılım tablosu (G6) — Türkçe etiket
- Part 3 (`6c266d7`): order_line sort_order collision fix — per-order cache
- Part 4 (this): race condition CAS + migration 043 + rollback

**Migration:** `043_import_batches_confirming_status.sql` — status enum'una 'confirming' eklendi.

**Test:** 106 dosya · 1993 test yeşil · TS clean.
