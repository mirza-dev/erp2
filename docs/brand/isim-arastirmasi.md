# İsim, Domain ve Tescil Ön Araştırması

Tarih: 2026-09-16 · Ölçüm: `whois` + `dig` (yerel makine; `.app` için Google registry whois'i erişilemedi → "belirsiz") · Karar: **kullanıcının** (marka rehberi §0)

> Bu belge bir **ön tarama**dır. Domain uygunluğu whois anlık görüntüsüdür (bir saat sonra değişebilir); tescil taraması yalnız web araması düzeyindedir — resmî sınıf 9/42 sorgusu §4'teki bağlantılardan, kullanıcı tarafından yapılmalıdır.

---

## 1. Özet

| | Roven (mevcut) | Tekakış (yeni aday) |
|---|---|---|
| Anlam | uydurma, iki hece, TR/EN'de aynı okunur | "tek akış" — markanın ana cümlesi (rehber §1.3) |
| `.com` | **DOLU** (başka sahip, içeriksiz) | **MÜSAİT** |
| `.com.tr` | **DOLU** — Roven Çikolata (Gaziantep, sınıf 30) | **MÜSAİT** |
| `.tr` | müsait | **MÜSAİT** |
| `.io` / `.co` / `.ai` | dolu / dolu / dolu | müsait / – / – |
| Sesteş risk | **"Raven Software Lab"** — Türkiye'de ERP satan yazılım firması | yok (bilinen) |
| Tescil (ön) | sınıf 30'da "Roven" var (çikolata); sınıf 9/42'de web'de iz yok | web'de iz yok; tanımlayıcı bileşik → ayırt edicilik tartışılabilir |
| Kod maliyeti | 0 | ~20 dosya rename + PWA `id` sabit kalmalı (rehber §6) |

**Öneri (marka açısından):** İki yol da savunulabilir; fark ne kadar dışa açılacağınıza bağlı.
- **Roven'ı tut** → `rovenerp.com` (+ `.com.tr`/`.io`) ile ilerle; "Raven" sesteşliği ve sınıf 30'daki Roven Çikolata **hukuken engel değil** (farklı sınıf, farklı sektör) ama Google'da "roven" aramasında çikolata çıkar, SEO'da isim tek başına sizi bulmaz — hep "Roven ERP" yazılır.
- **Tekakış'a geç** → `tekakis.com` + `.com.tr` temiz; isim vaadi taşır ("tek akış") ve Türkçe pazarda hatırlanır; bedeli rename + tanımlayıcı olduğu için tescilde biraz daha zayıf ayırt edicilik (bileşik yazımı "Tekakış" tek kelime olarak başvurulmalı).

Karar vermeden önce §4'teki 10 dakikalık resmî tarama yapılmalı.

---

## 2. Domain ölçümü — tam tablo

`MÜSAİT` = whois "no match"; `DOLU` = kayıt var; `?` = registry yanıt vermedi. DNS sütunu A kaydı var mı (canlı site ipucu).

### 2.1 Roven ve bileşikleri
| Domain | Durum | DNS |
|---|---|---|
| roven.com | DOLU | var (içerik yok — park/boş) |
| roven.com.tr | DOLU | var — **Roven Çikolata** (Gaziantep, ihracatçı; markalar: Alpines, Mir Coco…) |
| roven.tr | MÜSAİT | – |
| roven.io / roven.co / roven.ai | DOLU | var / yok / var |
| roven.app | ? (DNS var → büyük olasılıkla dolu) | var |
| **rovenerp.com** | **MÜSAİT** | – |
| rovenerp.com.tr / rovenerp.tr / rovenerp.io | MÜSAİT | – |
| rovenhq.com | DOLU | var |
| rovenhq.io / .com.tr / .tr | MÜSAİT | – |
| getroven.com | DOLU | yok |
| getroven.io / .com.tr / .tr | MÜSAİT | – |
| rovenapp.com | DOLU | yok |
| rovenapp.io / .com.tr / .tr | MÜSAİT | – |
| rovena.com / .io / .com.tr | DOLU | – |
| rovenix.com | DOLU | yok |
| rovenix.io / .com.tr / .tr | MÜSAİT | – |
| orven.com / .io / .co / .com.tr / .ai | DOLU | – |
| vorena.com / .io / .com.tr | DOLU | – |

### 2.2 Türkçe anlamlı adaylar
Seçim ölçütü: iki-üç hece, anlamı markaya bağlı, TR klavyede sorunsuz (ş/ı domain'de düşer).

| Aday | Anlam / gerekçe | .com | .com.tr | .tr | .io |
|---|---|---|---|---|---|
| **Tekakış** (`tekakis`) | "tek akış" — ana vaat | **MÜSAİT** | **MÜSAİT** | **MÜSAİT** | MÜSAİT |
| Akısa (`akisa`) | akış + -a, yumuşak | DOLU | DOLU | DOLU | MÜSAİT |
| Omurga | "işletmenin omurgası" | DOLU | DOLU | DOLU | MÜSAİT |
| Yordam | yöntem/prosedür | DOLU | DOLU | DOLU | MÜSAİT |
| Orsa | denizcilik: rüzgâra karşı rota | DOLU | DOLU | MÜSAİT | DOLU |
| Mihver | eksen | DOLU | DOLU | DOLU | MÜSAİT |
| Tümel | bütünsel | DOLU | DOLU | MÜSAİT | MÜSAİT |
| Tek Ekran (`tekekran`) | slogan | DOLU | DOLU | DOLU | MÜSAİT |

Kısa (≤6 harf) Türkçe kelimelerin tamamı `.com`/`.com.tr`'de dolu — bu sınıfta aramaya devam etmek verimsiz; ya **bileşik** (Tekakış gibi) ya **uydurma 7+ harf** gerekir.

---

## 3. Sesteş ve karışma riski (web taraması)

- **Raven Software Lab** (`ravensoftlab.com`) — Türkiye'de "ERP çözümleri" satan yazılım firması. "Roven"/"Raven" telefonda ve arama motorunda karışır; kendi kategorinizde bir sesteş var. Roven'ı tutarsanız pazarlamada her zaman **"Roven ERP"** ikilisi ve doğru telaffuz vurgusu ("ro-ven", "rey-vın" değil) gerekir.
- **Roven Çikolata** (`roven.com.tr`) — farklı sınıf (30), tescil çakışması beklenmez; ama `.com.tr` onların ve Türkçe aramada "roven" = çikolata.
- Tekakış için web'de yazılım/ERP sektöründe eşleşme bulunmadı.

---

## 4. Tescil — kullanıcı adımı (10 dk)

1. **TÜRKPATENT marka araştırma** → https://www.turkpatent.gov.tr/arastirma-yap?form=trademark — "roven" ve "tekakış" için **sınıf 9 ve 42** süz; benzer/sesteş için "raven", "rowen", "tekakis" de dene.
2. **EUIPO TMview** → https://www.tmdn.org/tmview/ — aynı iki isim, AB+TR filtresi (ihracat/AB müşterisi ihtimali için).
3. Sonuç temizse **sınıf 9 (yazılım) + 42 (SaaS)** için TÜRKPATENT başvurusu; logo seçimi kesinleştikten sonra **kelime + şekil** birlikte.
4. Domain: karar verilen adın `.com` + `.com.tr` aynı gün alınmalı (whois sorgusu bazı registrar'larda "ilgi" sinyali sayılıyor).

---

## 5. Kararın koda etkisi

| Karar | Değişen |
|---|---|
| Roven kalır | hiçbir şey; `NEXT_PUBLIC_APP_URL` yeni domain'e |
| İsim değişir | `RovenLogo` wordmark · `manifest` `name/short_name` (**`id` sabit kalır**, yoksa kurulu PWA'lar kopar) · `layout.tsx` metadata · e-posta `[Roven]` öneki + kabuk · `roven_remember` çerezi (**değişmez**, kullanıcıya görünmez) · README/CLAUDE.md · `roven-logo.test.tsx` + `topbar-title` kilitleri · `docs/brand/*`. Tahmini ~20 dosya, migration YOK. ERP ajanı ile koordineli tek commit. |

---

## 6. KARAR (kullanıcı, 2026-09-16)

**Roven kalır; domain `rovenerp.com`.** Whois 18:50 yeniden ölçüldü: `rovenerp.com` · `.com.tr` · `.tr` · `.io` müsait. Kullanıcı adımı: `rovenerp.com` + `rovenerp.com.tr` aynı gün alınır (isteğe bağlı `.tr`/`.io`); ardından §4 tescil taraması (sınıf 9/42, "roven" + sesteş "raven") ve TÜRKPATENT başvurusu (kelime + Akış Altıgeni şekli). Geçiş listesi: marka rehberi §9. Kod fallback'leri (`erp.getmedspace.com`) domain canlıya alınana kadar bilerek değişmez.
