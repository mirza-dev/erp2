---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-14 — Kapsamlı Seed Data + "Nerede Kullanılıyor"):**

1. **Seed data genişletmesi:**
   - `POST /api/seed` artık tüm tabloları dolduruyor (sadece products+customers değil)
   - 15 sipariş (draft/pending/approved/shipped/cancelled — tüm durumlar)
   - ~50 sipariş kalemi, stok rezervasyonları, eksiklikler (shortages)
   - 8 satınalma taahhüdü (pending/received/cancelled)
   - 7 BOM kaydı (3 mamul × 2-3 bileşen)
   - 10 üretim kaydı (3 tanesi bugün), stok hareketleri
   - 3 sevkiyat, 3 fatura, 2 ödeme
   - 6 entegrasyon sync logu, 10 audit log kaydı
   - Ürün reserved değerleri reservation toplamlarıyla otomatik senkronize

2. **Ürün detay drawer — "Nerede Kullanılıyor?" bölümü:**
   - products/page.tsx: Block 1 Ürün Kimliği altına dinamik kullanım özeti
   - Onay bekleyen siparişler, taslak teklifler, rezerve miktar, satınalma bekliyor, aktif alertler
   - Mevcut drawer verilerinden (quotes, commitments, alerts) hesaplanıyor — ek API gerekmez

**Test:** Build temiz | TypeScript temiz

**Önceki son tamamlanan (2026-04-13 — Bulgular Fix):**
- Alert metin tazeliği + renk tutarsızlığı düzeltmesi
- 67 dosya · 1348 test

**Bilinen açık sorunlar:** —

**Sonraki adım:** Cumartesi PMT sunum hazırlığı — DemoTab ile test

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
