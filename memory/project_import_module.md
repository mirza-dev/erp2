---
name: project_import_module
description: "Veri Aktarım Merkezi — kurulum aracı konumlandırması, eşleştirme katmanının AI'sız doğruluğu, AI mandalı; 2026-08-29 turu"
metadata:
  node_type: memory
  type: project
  originSessionId: acb6f922-bea3-40f3-872f-883a6e9e560b
  modified: 2026-08-29T14:30:00.000Z
---

**Veri Aktarım Merkezi** (`/dashboard/import`) — belge: `docs/veri-aktarim-merkezi.md`.

**Konumlandırma (2026-08-29 kullanıcı kararı): KURULUM ARACI.** Sayfa dosya
BİÇİMİNE göre kurgulanmıştı (Excel mi PDF mi), kullanıcı İŞE göre düşünüyor
("ürün listemi yükleyeyim"). Üstte **Kurulum Durumu paneli**: **8 adım** sırayla
(2026-09-17 onboarding turu; eskiden 5): firma bilgileri → ürün tipleri → ürünler →
cariler → tedarikçiler+ürün kodları → açılış stoğu → kullanıcılar (≥2) → ilk teklif
veya sipariş. Her adım VERİDEN türer (`buildSetupSteps(status, perms?)`,
`SetupStatusPanel.tsx`), elle işaretlenmez; `perms` verilirse rolün açamayacağı
sayfaya link verilmez (satışçı 4 adım görür, viewer 0 → bant render edilmez).
Panodaki `SetupProgressBanner` "Sıradaki: <adım>" linki verir. **Sıra zorunlu:**
tipler ürünlerden önce gelmezse teknik alanlar boş kalır.

**EN ÖNEMLİ DERS — AI deterministik bir kusuru örtüyordu.** Eşleştirme sırası:
hafıza → alias tablosu → **AI** → "Atla". Sistemin KENDİ şablonunun 56
kolonundan 10'u (%18) kendi alanına dönmüyordu (biri ZORUNLU: `"Ürün SKU"` →
Tedarikçi-Ürün İlişkisi şablonu hiç çalışmıyordu), ama eşleşmeyen başlık AI'ya
düşüp doğru bağlandığı için kusur GÖRÜNMÜYORDU. Anahtar geçersizleşince ortaya
çıktı. **Kural: eşleştirme katmanı AI OLMADAN doğru olmak zorunda; AI
iyileştirmedir, bağımlılık değil.** `import-sablon-roundtrip.test.ts` kilitler.

**Kök:** iki normalizer ayrışmıştı — alias anahtarları `normalizeImportToken`
ile yazılmış (`tedarik_suresi_gun`), arama `normalizeColumnName` ile
(`tedarik_suresi__gun_`). Noktalama içeren HER başlık ıskalıyordu
(`Fiyat (USD)`, `Br.`, `V.D.`). Düzeltme: `normalizeColumnName` →
`normalizeImportToken`'a delege. `column_mappings` hafızası etkilenmedi
(3 canlı satır her iki gövdede aynı — doğrulandı, migration YOK).

**AI mandalı:** `isAIAvailable()` eskiden yalnız `!!process.env.ANTHROPIC_API_KEY`
bakıyordu → anahtar DOLU ama GEÇERSİZken (401) `true` dönüyor, her çağrı
sessizce fallback'e düşüyordu. Artık 401/403 mandal kurar (geçici hatalar
KURMAZ); Anthropic çağrıları tek sarmalayıcıdan geçer (11 çağrı yeri, yeni çağrı
eklenince mandal kendiliğinden çalışır). `GET /api/ai/health` → `no_key` /
`auth_failed` / `ok`. AI kapalıyken hub PDF'i YÜKLEMEZ (depoya satır yazılmaz).

**Bilinçli eşleştirilmeyenler** (testle kilitli, "unutulmuş" değil): `olcu`
(vanada DN/ebat demek) · `aciklama` (iki yönde de yanlış olabilir) · `il`/`sehir`
(şemada alan yok). Yanlış eşleştirmek eşleştirmemekten KÖTÜ — sessizce yanlış
veri yazar; eşleşmeyen sütun ise görünür uyarı üretir.

**Yetki:** `view_import`/`manage_import` yalnız admin+satınalma (import SAYFASI
değişmedi). **Durum ucu ayrıştı (kullanıcı kararı 2026-09-16 "herkes görsün"):**
`GET /api/import/setup-status` artık `requireAnyRole(ROLES)` — oturumu olan her rol
sayaçları okur (PII yok); `users.total` yalnız admin için ve `unstable_cache` DIŞINDA
(anahtar global). Muhasebe/üretimin yükleme yetkisi hâlâ yok — bilinçli.

**Kapsam dışı:** geçmiş veri göçü (sipariş/teklif/fatura). `SHEET_ENTITY_MAP`'te
`Siparisler`/`Faturalar`/`Teklifler` girdileri var ama şablonu/tespiti yok —
yarım yol, bilinçli dokunulmadı.

İlgili: [[project_stack]] [[project_domain]] [[current_focus]] [[project_pmt_multi_type]]
