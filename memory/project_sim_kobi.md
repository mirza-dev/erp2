---
name: project_sim_kobi
description: "KOBİ çalışan simülasyonu düzeneği (simctl harness + 4 ajan) ve 2026-08-29 bulguları — K3/Y6/O8, en ağırı müşterisiz sipariş tuzağı"
metadata: 
  node_type: memory
  type: project
  originSessionId: acb6f922-bea3-40f3-872f-883a6e9e560b
  modified: 2026-08-29T06:44:45.140Z
---

**KOBİ simülasyonu (2026-08-29):** dört yapay çalışan (Kerem/mühendis-admin ·
Sibel/muhasebe-admin · Hasan/üretim · Deniz/satış+satınalma) Roven'i **yalnız
tarayıcıdan**, kaynak kodu görmeden, 5 iş günü kullandı. Amaç: kod denetiminin
göremediği **iş akışı boşluklarını** bulmak.

**Düzenek:** `scripts/sim/` — `daemon.ts` (rol başına kalıcı Chromium) ·
`perceive.ts` (sayfa → insan dili, DOM sızdırmaz) · `act.ts` (fiiller, yalnız
görünür etiketle hedefler) · `simctl.mjs` (hızlı CLI) · `provision/snapshot/cleanup`.
Ajanlar: `.claude/agents/sim-*.md` (`tools: Bash` tek başına). Kilit:
`.claude/hooks/sim-guard.sh` (`.sim/ACTIVE` varken yalnız simctl).
**Kanca ve ajan tanımları OTURUM BAŞINDA yüklenir** — yeni oturum gerekiyor,
yoksa kısıt yalnız talimat düzeyinde. Belgeler: `docs/sim/00-kurulum.md`,
`docs/sim/is-emirleri.md`.

**Bulgular:** `docs/sim/2026-08-29-sim-bulgular.md` (K:3 Y:6 O:8 D:5 Nit:9,
elenen:6) + ham `docs/sim/gunluk/gun-1..5.md`.
**DÜZELTME TURU ✅ (2026-08-29, aynı gün):** raporun **§5**'i her bulgunun ne
yapıldığını tablo hâlinde tutuyor; **§0** düzeltmeden önce yeniden okunan yedi
teşhisin nasıl değiştiğini. Sim kayıtları canlıdan temizlendi
(`cleanup --uygula`), 4 sim hesabı silindi, `check:chains` dört zincir de yeşil.

**Teslimi engelleyen üç kritik — hepsi "arka uç var, ekran yok" kalıbı:**
- **K1+Y6** teklif serbest metin müşteriyle açılıyor → `customer_id` null →
  zincir sonuna kadar ilerliyor (stok rezerve) ama `order-service.ts:250`
  sevki reddediyor; müşteri Cariler'e de hiç yansımıyor. **Stoğu tutan, asla
  sevk edilemeyen sipariş.**
- **K2** tedarikçi fatura no (KDV künyesi): API+servis+mig.107 hazır, **UI'da
  0 eşleşme**. `parasut-golive-runbook.md` §5 bunu yanlış anlatıyordu → düzeltildi.
- **K3** stok sayımı: `recount_stock` RPC var (mig.105) ama tek çağıran Excel
  import; doğrudan ekran yok.

**Y1** `finally` iptal edilen fetch'te de loading'i indiriyor → "kayıt
bulunamadı" yanılgısı (`quotes/[id]:70-88`, `orders/[id]:111-116` — ikincisinde
`return` var ama `finally` yine çalışıyor). **Y3** `production/page.tsx:265`
`scrap: 0` sabit. **Y4** RFQ notu kaydediliyor, detayda gösterilmiyor.

**Düzeltmede çıkan iki yeni ders:**
1. **Doğrulayıcının ilk okuması da iddiadır.** Düzeltmeye başlarken her bulgu
   koda karşı YENİDEN okundu; yedisinde teşhis değişti (Y3'ün kökü sabit değil
   taşıma katmanıydı · O3 ürün kodu değil SEED kusuruydu · O6'da denetim izi
   zaten doğruydu · O7 harness · O4 bfcache · Y5'in ikinci kökü taramanın hiç
   koşmamasıydı · O8 kısmen kurgu). Yanlış teşhise göre yazılan düzeltme işe
   yaramazdı.
2. **Testler yeşilken canlı veri hata buldu.** Onarım yolunu gerçek
   `ORD-2026-0030` üzerinde denerken `country: "Türkiye"` gönderdiğim görüldü —
   kolon `char(2)`. 6200 test bunu görmemişti. Kanıt turu şart.

**Ders:** ajan bulgusu = iddia, kanıt değil. Üç bulgu **harness kusuru** çıktı
(sekme tıklaması menüye gidiyordu; modal `main` dışında; ilk-eşleşme seçimi),
biri **yanlış pozitif** (42.240/878 = 48,11 makul kur), biri **simülasyon
kurgusu**. Hepsi raporda gerekçesiyle duruyor. İlgili: [[user_review_workflow]]
[[project_integrations]] [[deferred_backlog]]
