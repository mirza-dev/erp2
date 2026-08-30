---
name: project_backups
description: Supabase yedekleme durumu — Free planda otomatik yedek YOK, Storage hiçbir planda DB yedeğine girmiyor; npm run backup aracı ve geri yükleme runbook'u
metadata:
  type: project
---

**2026-08-30 doğrulaması: yedek YOKTU.** İki ayrı katmanda, iki ayrı sebeple.

**1. Plan.** Proje Supabase **Free planında** → otomatik yedek hiç yok. Günlük
yedekler Pro (7 gün) / Team (14) / Enterprise (30); PITR her planda ayrı ücretli.

**2. Storage — plandan BAĞIMSIZ.** Supabase belgesi birebir: *"Database backups do
not include objects you store via the Storage API, as the database only includes
metadata about these objects."* Ücretli plana geçilse bile 6 kovadaki dosyalar
yedeğe girmez; DB satırı yalnız dosyanın adresini tutar.

**Ölçüm (2026-08-30):** 64 tablo / 1.238 satır · 8 hesap (3 admin) · 76 obje /
47,38 MB · proje `erp2`/`ryvxpolvhvsycuqyphoa`, Tokyo `ap-northeast-1`, PG 17.6.1.084.
DB→storage kırık referans **0** (kayıp yaşanmamış; risk gelecekte).

**Kapatıldı:** `npm run backup` (`scripts/backup.ts`) — kaynağa salt-okunur, yalnız
yerel diske. Tablolar NDJSON (PostgREST **PK'ya göre sıralı** sayfalama — ORDER BY'sız
`Range` satır kaçırır), `auth/users.ndjson`, `storage/<kova>/<yol>`, `manifest.json`.
Manifest'te `restoreOrder` var: **migration'ların tablo yaratma sırası geçerli bir
topolojik sıradır** (FK hedefi önce var olmalı). Her tablo `count=exact` ile ölçülüp
dosya satır sayısıyla karşılaştırılır → **yarım yedek exit 0 dönemez.**

**Geri yükleme sırası** (`docs/backup-restore.md`): şema (migration'lar) → **ÖNCE
hesaplar** (13 kolon `auth.users(id)`'ye FK veriyor, biri `not null cascade`) →
`restoreOrder` sırasıyla tablolar → dosyalar. Şemadan doğrulanan trigger yan etkileri:
`trg_pol_line_total` INSERT'te `line_total`'ı yeniden hesaplar; `trg_pol_after_change`
PO başlık toplamlarını satır yüklemesinde üzerine yazar; `updated_at` trigger'ları
BEFORE UPDATE → INSERT'i etkilemez.

**Sınır:** `auth/users.ndjson` **parola hash'i içermez** (Admin API döndürmüyor) →
geri yüklemede sıfırlama gerekir. Kimlik + `app_metadata.roles` korunur.

**Kalıcı kapı:** `src/__tests__/backup-script.test.ts` — 3 invaryant, üçü de
kırmızı-yandığı kanıtlanarak eklendi: `backups/` .gitignore'da (müşteri verisi +
`parasut_oauth_tokens`) · script kaynağa yazmaz · satır sayısı doğrulaması yerinde.

**AÇIK (kullanıcı tarafı):** yedek dış diske/kasaya çıkarılmalı (şu an aynı diskte) ·
haftalık + migration/toplu-import/fatura öncesi koşum · **geri yükleme provası
yapılmadı** (prova edilmemiş yedek hipotezdir) · Pro planı değerlendirilmeli.

Rapor: `docs/audit/2026-08-30-supabase-yedek-dogrulamasi.md`. İlgili:
[[project_security]] · [[deferred_backlog]] · [[reference_worktree_branches]]
