# Settings Modülü Derin Denetim — Bulgular

**Tarih:** 2026-06-19
**Kapsam:** Ayarlar + Kullanıcı Yönetimi — 10 settings route (`api-keys-status`, `files`+`[id]`+`download`, `company`+`company/logo`, `user/{preferences,password,profile,avatar}`) + `admin/users`(+`[id]`) + `company-settings`/`company-files`/`user-profile`/`user-preferences` lib + ayar sayfaları.
**Yöntem:** REVIEW.md read-only (erp2-reviewer checklist + manuel kanıtlama). Modül olgun (Dosyalar sekmesi mig.091, kullanıcı yönetimi RBAC Faz 5, mig.046 SVG-XSS, denetim D4/O11).
**Özet:** **K:0 · Y:0 · O:0 · D:0 · Nit:0 — TEMİZ.** Kampanyanın en olgun modülü; guard kör noktası / redaction sızıntısı / correctness defekti bulunmadı. Bulgu manufacture EDİLMEDİ.

---

## Temiz doğrulananlar (kanıt)

### `admin/users` (POST/PATCH/DELETE) — privilege yönetimi (en kritik yüzey)
- **`requireAdmin`:** `app_metadata.roles ∋ admin` (`parseRoles`) + **zero-admin bootstrap** (sistemde hiç admin yoksa ilk auth'lı kullanıcıya izin; ilk admin atanınca otomatik kapanır → brick-proof) + **`listUsers` HATASI fail-CLOSED** (P1#3/R4: hata → "admin yok" varsayımı yerine 403/throw; admin-yok bypass'ı engellenir).
- **Rol ataması (`normalizeAssignedRoles`):** `normalizeRole` ile **geçersiz rol stringi ATILIR** (privilege injection / arbitrary role yok), dedup, default `["viewer"]`, gereksiz viewer ops-rol varken çıkarılır. POST + PATCH aynı normalize'ı kullanır.
- **Last-admin lockout:** PATCH (admin'i demote) + DELETE, `countAdmins` (**fail-CLOSED** — listUsers hatası throw → 500, count=0 ile bypass YOK) → son admin'in rolü kaldırılamaz / silinemez (409).
- **Input:** email zorunlu, şifre ≥8, "already registered" → 409.

### `api-keys-status` GET
`requireInternalOperator` (en güçlü guard) + demo → tüm flag `false` + yalnız **boolean presence** (`!!process.env...`) döner; secret değer ASLA dönmez.

### `company` GET (guard'sız — by-design)
`SAFE_COMPANY_FIELDS` **whitelist** (`id`/`name`/`tax_office`/`tax_no`/`address`/`phone`/`email`/`website`/`logo_url`/`currency`/`updated_at`) — antet/branding verisi; secret/token YOK. Tüm yüzeylerde (PDF antet, app başlık, teklif/sipariş belgeleri) gereken view-tier veri; whitelist ile korunur (tablo'da hassas kolon olsa bile dönmez). PATCH + `company/logo` POST → `manage_settings` + `validateCompanyPatch` (name 1-200, email, tax_no 10/11 hane, website URL, currency USD/EUR/TRY).

### `files` (şirket dosya arşivi)
GET + `[id]/download` → `view_settings`; POST + `[id]` DELETE → `manage_settings`. Upload validation: displayName 1-200, kategori whitelist, size>0, `MAX_COMPANY_FILE_SIZE`. Download: UUID regex + dosya varlığı + **SVG her zaman attachment** (inline render stored-XSS riski, mig.046 precedent) + signed-URL TTL 3600.

### `user/*` (self-auth — own record)
- **`password`:** session + **mevcut şifre doğrulaması** (cookie'siz izole `signInWithPassword` client → çalınmış-session riskine karşı; mevcut session kirletilmez) + yeni şifre ≥8 + eski≠yeni + audit_log (non-fatal).
- **`avatar`:** MIME allowlist (png/jpeg/webp — **SVG YOK**) + 1MB max.
- **`profile`:** fullName 2-100; **`preferences`:** `resolveAuthContext` own-record.

### RBAC sınıflandırması
`view_settings`/`manage_settings` yalnız **admin** rolünde (diğer 5 rolde yok) → settings admin-tier; files/company guard'ları doğru permission sınıfında.

---

## Sonuç
Settings modülü için düzeltme YOK (kod değişikliği yapılmadı). Bu rapor, modülün denetlendiğini + `company` GET'in neden bilinçli guard'sız (whitelist'li branding) olduğunu gelecekteki turlar için kayda geçirir.

**Bu, `erp2-reviewer` modül-modül derin inceleme kampanyasının (deferred_backlog B) SON modülüdür → kampanya TAMAMLANDI** (9 modül: RFQ · Orders · Quotes · Paraşüt · import/AI · production · customers/products · alerts · settings).
