---
name: feedback_contract_in_types_not_comments
description: "Bir sözleşme yalnız yorumda yaşıyorsa fiilen yoktur — tipe/teste taşı; ve bir envanter, ölçmediği durumu kapsayamaz"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: acb6f922-bea3-40f3-872f-883a6e9e560b
  modified: 2026-09-10T14:30:13.880Z
---

İki kardeş ders; ikisi de 2026-09-10 dokunma-tabanı turunda **aynı gün**
ölçümle kanıtlandı.

## 1 — Sözleşme yorumda yaşıyorsa, yaşamıyordur

`SectionHeader`in `style` prop'u 2026-09-05'ten beri "**yalnız BOŞLUK**"
diyordu. Kural JSDoc'ta net yazılıydı, denetim raporlarında sayılıyordu — ama
tip `CSSProperties`ti. Tip `Pick<CSSProperties, "margin"|"padding"|…>`e
daraltılınca **beş çağrı yerinin sözleşmeyi zaten deldiği** ortaya çıktı:
üçü renk (`--danger-text` ×2, `--warning-text`), ikisi `lineHeight: 1.35`.

Daha incesi: ikisi **aynı değeri bağımsız olarak yazmıştı** → o değer aslında
bileşenin kendi varsayılanı olmalıydı (`feedback_global_over_hardcode`).

**Uygula:** bir prop/API "yalnız şunun için" diye belgelendiyse, o kısıt
**tipte veya kapı testinde** olmalı. Yoksa kısıt değil temennidir ve sessizce
aşınır. Ölçüm ucuz: tipi daralt, `tsc`nin ne söylediğine bak.

## 2 — Bir envanter, ölçmediği durumu kapsayamaz

Aynı turda `deferred_backlog` "36 kontrol 30–43px bandında" diyordu. Yeniden
ölçüldü: **1664 kontrolün 584'ü** 44px altında. Fark bir sayım hatası değildi:
2026-08-31 ölçümü **mobil çekmece KAPALIYKEN** koşmuştu, bu yüzden
uygulamanın en çok dokunulan yüzeyi (Sidebar'ın 16 gezinme bağlantısı,
222×36, hit-area YOK) envantere **hiç girmedi**.

Aynı sınıf: `getComputedStyle(el, "::after")` kutuyu 44×44 gösteriyordu ama
**hesaplanmış stil boyanmış demek değildir** — gerçek cevabı
`elementFromPoint` isabet testi verdi ve planın bir varsayımını çürüttü.

**Uygula:** bir envanter sayısını devralmadan önce **nasıl ölçüldüğünü** sor.
Kapalı çekmece, yüklenmemiş sayfa, render edilmemiş bileşen — hepsi sayıyı
sessizce küçültür. Ölçüm yönteminin kendisi de bulgudur.

Bağlantılar: [[feedback_global_over_hardcode]] · [[project_frontend_renewal]]
