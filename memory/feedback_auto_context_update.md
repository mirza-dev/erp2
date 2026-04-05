---
name: Otomatik Bağlam Güncellemesi
description: Her önemli iş bitişinde CLAUDE.md ve current_focus.md otomatik güncellenmeli, kullanıcı manuel yapmak zorunda kalmamalı
type: feedback
---

Her anlamlı iş tamamlandığında (özellik, güvenlik fix, refactor, vb.) session sonunda şunları otomatik güncelle — kullanıcı söylemeden:

1. `memory/current_focus.md` — "Son tamamlanan" ve "Aktif" alanları
2. `CLAUDE.md` başındaki "Mevcut Durum" bölümü — tarih, son iş, test sayısı

**Why:** Kullanıcı "bunları ben mi yapacağım?" diye sordu. Manuel güncelleme beklentisi yok.
**How to apply:** İş commit'lendikten hemen sonra, kullanıcıya sonuç raporlamadan önce bu iki dosyayı güncelle. Ayrı bir commit gerekmez — son commit'e eklenebilir veya hemen ardından küçük bir commit atılabilir.
