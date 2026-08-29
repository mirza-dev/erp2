# KOBİ simülasyonu — kurulum ve işleyiş

Roven ERP'yi **çalışan gözüyle** sınamak için kurulmuş düzenek. Dört yapay
çalışan sistemi yalnız tarayıcıdan kullanır; kaynak koda bakmaz, internete
çıkmaz, sistemin içini bilmez. Bir haftalık iş yapar ve takıldıkları her yeri
patrona rapor eder.

**Neden:** bugüne kadarki doğrulama içeriden yapıldı — 6100 birim testi,
gate'ler, kod denetimleri, zincir bütünlüğü. Hiçbiri "bu sistemi hiç tanımayan
bir çalışan işini baştan sona yapabiliyor mu?" sorusunu sormadı. İş akışı
boşlukları, geri bildirimsiz düğmeler, anlaşılmayan etiketler ve rol duvarları
ancak böyle görünür.

---

## Çalışanlar

| Kim | Kişi | ERP rolü | Neden bu kişilik |
|---|---|---|---|
| `kerem` | Kerem Aydın, makine müh., 6 yıl | `admin` | Ürün/teknik veri modelinin boşluklarını görür |
| `sibel` | Sibel Toprak, mali işler, 9 yıl | `admin` | Rakam tutmazlığını yakalar; her toplamı çaprazlar |
| `hasan` | Hasan Çelik, üretim vardiya sor., 12 yıl | `production` | Bilgisayarla arası orta → kullanılabilirlik kusurları |
| `deniz` | Deniz Arslan, satış + satın alma, 3 yıl | `sales` + `purchasing` | Hızlı ve aceleci → doğrulama boşlukları |

Kişilikler süs değil **kapsam tasarımı**: dört farklı kusur sınıfını dört farklı
insan bulur.

Hesaplar `sim.<ad>@pmt-sim.test` (RFC 2606 — asla yönlendirilmez). Şifre
`SIM_PASSWORD` env'inden okunur; koda yazılmaz, loglanmaz, ekrana basılmaz.

---

## Eller: `simctl`

Çalışanın ERP'ye dokunduğu tek arayüz. İnsan fiilleri konuşur; CSS seçici, id,
test-id **yoktur** — bir çalışan da kullanamaz.

```
node scripts/sim/simctl.mjs <kim> <ne> [değer] [değer2]
```

`git` · `bak` · `tikla` · `satir` · `yaz` · `sec` · `isaretle` · `ara` ·
`geri` · `bekle` · `ekran`

**Kritik tasarım kararı:** etiketiyle bulunamayan bir kontrol, çalışan için
"ekranda yok" demektir. Harness bunu telafi etmez — "bulamadım, ekranda şunlar
var" diye raporlar. Bu kayıt bulgunun kendisidir.

Her komuttan sonra sayfa **insan diline** çevrilip döner: başlık · ekranda
yazanlar · tablolar · doldurulacak alanlar (etiketiyle) · düğmeler · sol menü ·
çıkan bildirim. Çıktıda DOM, selector, sınıf adı görünmez.

### Parçalar

| Dosya | Ne yapar |
|---|---|
| `scripts/sim/daemon.ts` | Rol başına kalıcı Chromium; oturum ve sayfa durumu komutlar arasında yaşar |
| `scripts/sim/perceive.ts` | Sayfayı insan diline çevirir |
| `scripts/sim/act.ts` | Fiiller; hedefleme yalnız görünür etiketle |
| `scripts/sim/simctl.mjs` | Hızlı CLI (düz JS — ajan yüzlerce komut çalıştırır) |
| `scripts/sim/provision.ts` | 4 hesabı açar/kaldırır |
| `scripts/sim/snapshot.ts` | Sim öncesi/sonrası sayısal durum fotoğrafı |
| `scripts/sim/cleanup.ts` | Sim artığını geri alır |

---

## Kaynak kodu kilidi

`.claude/hooks/sim-guard.sh` — `.sim/ACTIVE` varken Bash ile **yalnız `simctl`**
çalıştırılabilir; başka her komut reddedilir. Kilit herkesi bağlar (patron
dahil): sim koşarken kod okunmaz. Bulgu dosyaları Write aracıyla yazılır, kanca
yalnız Bash'i geçer.

Ayrıca `.claude/agents/sim-*.md` dosyalarında `tools: Bash` **tek başına** —
dosya okuma araçları ve internet araçları ajanların elinde hiç yoktur.

> **Dikkat:** hem kanca hem ajan tanımları **oturum başında** yüklenir. Yeni
> açılmamış bir oturumda ikisi de devre dışıdır; o durumda kısıt yalnız talimat
> düzeyindedir. Yapısal kilit için oturumu yeniden başlatın.

---

## Komutlar

```bash
# Kurulum (bir kez)
npm run sim:provision                 # 4 hesabı aç  (SIM_PASSWORD gerekir)
npm run sim:snapshot -- --out=docs/sim/snapshot-oncesi.json
npm run sim -- start                  # tarayıcıları aç, girişleri yap

# Kullanım
node scripts/sim/simctl.mjs deniz git "Teklifler"
node scripts/sim/simctl.mjs hasan bak
npm run sim -- durum

# Kapanış
npm run sim -- stop
npm run sim:snapshot -- --out=docs/sim/snapshot-sonrasi.json
npm run sim:snapshot -- --karsilastir docs/sim/snapshot-oncesi.json docs/sim/snapshot-sonrasi.json
npm run sim:cleanup                   # kuru çalışma — ne silinecek gösterir
npm run sim:cleanup -- --uygula       # gerçekten sil
npm run sim:provision -- --sil        # hesapları kaldır
npm run check:chains && npm run find-test-data
```

---

## Canlı veri: risk ve karşılığı

Simülasyon **canlı Supabase projesinde** koşuyor (kullanıcı kararı). Bir
haftalık sim gerçek sipariş, rezervasyon, stok hareketi ve ciro üretir.
Karşılığı dört katmanlı:

1. **Fotoğraf** — sim öncesi/sonrası sayısal durum (`snapshot.ts`)
2. **Etiket** — sim'in ürettiği her kayıt `SIM` imzası taşır;
   `src/lib/test-data-patterns.ts` bu deseni tanır → `npm run find-test-data`
   sim artığını da bulur
3. **Geri alma** — `cleanup.ts` siparişleri **uygulamanın kendi `cancel_order`
   RPC'siyle** iptal eder (rezervasyonlar düzgün çözülür), sonra siler
4. **Kanıt** — `npm run check:chains` sim öncesi ve sonrası koşulur

**Bilinen bedel:** üretim girişi ve stok sayımının **gerçek ürünlerin**
`on_hand` değerine etkisi tam geri alınamaz. `snapshot --karsilastir` sapmayı
sayısal gösterir; düzeltme kararı kullanıcınındır.

---

## Bulgu boru hattı — iki aşama, bilinçli ayrı

Çalışanlar kanıt veremez (kod göremiyorlar); doğrulanmamış iddia proje raporuna
giremez.

**Aşama 1 — Ham (çalışan dili):** `docs/sim/gunluk/gun-<n>.md`
Her ajandan gelen rapor değiştirilmeden kaydedilir. Aynı kusuru birden çok kişi
bulursa birleştirilir — bu kusurun ağırlığının göstergesidir, ayrı bulgu değil.

**Aşama 2 — Doğrulanmış (proje formatı):** `docs/sim/<tarih>-sim-bulgular.md`
Her ham bulgu koda karşı doğrulanır ve projenin **Bulgular** formatına çevrilir:
**K/Y/O/D** · `file:line` kanıt · Etki · Düzeltme · Efor. Doğrulamada elenenler
(harness kaynaklı, kullanıcı hatası, bilinen durum) **ayrı bölümde gerekçesiyle**
kalır — sessizce düşürülmez.

Düzeltme bu düzeneğin kapsamı dışında: **önce doğrula, sonra düzelt.**
