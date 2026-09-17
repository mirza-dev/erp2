# Memory Index

## User
- [user_review_workflow.md](user_review_workflow.md) — "Bulgular" raporuyla review yapar; önce doğrula, sonra düzelt; REVIEW.md = formal review kuralları

## Project
- [project_stack.md](project_stack.md) — Stack, inline style kuralları, klasör yapısı, veri modelleri; skills `~/.claude/skills/erp2-*`; **tema `data-theme` → renkte CSS var** ([[reference_theming]]); **cache: `revalidateTag(tag, "immediate")` — `"max"` YASAK (SWR, bayat okuma; 2026-09-17)**
- [project_domain.md](project_domain.md) — Sipariş çift ekseni, stok modeli, KDV, import kontratı, alert tipleri, tamamlanan fazlar (0–13)
- [project_pmt_multi_type.md](project_pmt_multi_type.md) — PMT multi-product-type firma; tek-tip assumption YAPMA; multi-type karışık katalog/sipariş/teklif zorunlu
- [project_import_module.md](project_import_module.md) — Veri Aktarım Merkezi: **kurulum aracı** konumlandırması (5 adımlı panel); **ders: AI deterministik kusuru örtüyordu** → eşleştirme AI'sız doğru olmalı (`import-sablon-roundtrip` kilitler); AI 401 mandalı + `/api/ai/health`; `view_import` yalnız admin+satınalma (açık soru)
- [project_developer_console.md](project_developer_console.md) — **Developer Console (mig.109)**: internalOperator 4 katman · 3 telemetri kancası (imza değişmeden request-id) · istemci RUM · FNV-1a fingerprint · bilinen sınırlar; `console-ui.ts` tek stil kaynağı + `gate/console-consistency`.
- [project_security.md](project_security.md) — RLS · middleware · demo mode. RLS kapsaması TAM + **gate kural 4** (RLS'siz tablo eklenemez); iki güvenlik listesi de kapandı (10/10 ve 20 maddelik) — raporlar `docs/audit/`. Ders: SQL şemasını kabuk regex'iyle sayma.
- [project_rbac.md](project_rbac.md) — Rol bazlı erişim (6 rol, app_metadata.roles): Faz 1–7 + regresyon KAPALI; R3 finansal redaction + R1/R2 guard'lar; quotes RBAC Faz 8a (delete_quotes/410-convert); named artıklar (PO print guard/redaksiyon · 409 FK ön-kontrolü) 2026-09-16 kapandı
- [project_integrations.md](project_integrations.md) — **Paraşüt Faz 1-16 KOD TAMAM (2026-08-29)**: gerçek HTTP adapter + alış faturası (mig.107) + tahsilat (mig.108) + stok mutabakatı + go-live gate; teslim KAPALI (`PARASUT_ENABLED=false`); açık: API başvurusu · mig.107/108 APPLY · gate `--write`. AI kolon eşleştirme, Sentry ✅, k6, smoke 24
- [project_auth.md](project_auth.md) — Login, kullanıcı yönetimi, admin API, landing page; **parola kurtarma 2026-08-31'e kadar TAMAMEN KIRIKTI** (unutan herkes kilitleniyordu) → self-servis `/sifre-yenile` + admin sıfırlama, `next` allowlist'li; **Secure password change prod'da AÇIK (2026-09-11)** → Ayarlar şifre değişimi taze oturuma taşınır
- [project_products_page.md](project_products_page.md) — Veri akışı, **drawer YOK** (Faz 2b'de kaldırıldı → satır tıklaması `router.push`), liste tablosu Card+DataTable (Faz B #7), dinamik kategori, scan lock, mount scan davranışı, perf pattern
- [deferred_backlog.md](deferred_backlog.md) — **Ertelenen işler + açık kullanıcı-tarafı ön koşullar** (yeni oturumun başlangıç noktası). A/B/D blokları ve 2026-09-15 kapanış envanteri A1–A7 KAPANDI (2026-09-17); kalan yalnız kullanıcı tarafı: C3 deploy · env · Supabase panel · Paraşüt · KVKK.
- [project_sim_kobi.md](project_sim_kobi.md) — KOBİ çalışan simülasyonu: `scripts/sim/` harness + 4 ajan; 2026-08-29 bulguları (K:3 Y:6 O:8) — **hepsi düzeltildi (rapor §5)**, sim artıkları canlıdan temizlendi; ders: doğrulayıcının ilk teşhisi de iddiadır (7'si değişti)
- [project_backups.md](project_backups.md) — `npm run backup` / `npm run restore`. Yedek 2026-08-30'a kadar HİÇ yoktu; **2026-09-05 geri yükleme PROVA EDİLDİ** (64/64 tablo · 13/13 obje · 0 hata) ve prova dört gerçek kusur çıkardı.
- [project_delivery.md](project_delivery.md) — **Teslim modeli**: tek kiracılı (`company_settings` singleton index + 0 tenant kolonu) → müşteri başına ayrı Supabase projesi (~$10/ay marjinal); `npm run schema:bundle` (111 mig → 5 parça); prod-koruma kapısı (`predev`+`pretest:e2e*`, E2E ARTIK KİLİTLİ); PWA sabit "Roven" + kasten aptal SW; on-premise reddedildi
- [project_local_dev_db.md](project_local_dev_db.md) — **Yerel dev DB (colima+Supabase)**: E2E 123 test (`E2E_PORT`, `next dev`e mahkûm — CSP) + `npm run test:integration` gerçek-DB kapısı (fail-closed host); colima, Docker Desktop değil; CSP `connect-src` dersi; Playwright cache'i dışarıdan silinebiliyor → `PLAYWRIGHT_BROWSERS_PATH`; `docs/yerel-gelistirme.md`
- [current_focus.md](current_focus.md) — **Aktif sprint, son tamamlanan işler ve sonraki adımlar** — her tur ayrı `##` bölümü. En son (2026-09-17): kapanış envanteri A1–A7 kapandı — 409 FK ön-kontrol · PO print guard · gerçek-DB entegrasyon kapısı · E2E 94→123 · `revalidateTag "max"` SWR kusuru → `"immediate"`.

## Reference
- [reference_live_demo_redaction.md](reference_live_demo_redaction.md) — Canlı/demo'da null fiyatlar = RBAC redaction (viewer rolü), BUG DEĞİL; auth gate `src/proxy.ts` (middleware.ts değil)
- [reference_theming.md](reference_theming.md) — Koyu+aydınlık tema (Cool slate): `data-theme` token sistemi, FOUC bootstrap, ThemeProvider/useTheme/ThemeToggle, tema-muaf yüzeyler (baskı/logo/lightbox); kural: renkte CSS var kullan→otomatik temalanır
- [reference_worktree_branches.md](reference_worktree_branches.md) — İki worktree (erp2=main, proje-codex=codex-experiment) birebir-ayna; push akışı (commit→ff main→push both→SHA doğrula); `~/.claude/memory`=SYMLINK→erp2/memory (proje-codex ayrı kopya); artık worktree/dallar kullanıcı kararıyla KALIYOR (2026-09-16)
- [reference_rfq_module.md](reference_rfq_module.md) — Tedarikçi Fiyat Talebi (RFQ) modülü (mig.100→103): talep→gönder→fiyat gir→karşılaştır→award→PO; veri modeli, RPC'ler, RBAC, UI, takip işleri ve award integrity (sunucu-otoriter, mükerrer-reddi). Ayrı print sayfası KAPALI (kullanıcı kararı 2026-09-16; arşiv-view yeterli).
- [reference_quote_line_columns.md](reference_quote_line_columns.md) — Teklif satır kolon modeli: **Ölçü (Size) kolonu KALDIRILDI** (kullanıcı kararı 2026-06-16) — ürün adı DN+basınç sınıfını zaten içeriyor, `size_text` redundant; **gelecekte tekrar EKLEME**, `size_text` dormant korunur
- [reference_review_agent.md](reference_review_agent.md) — `erp2-reviewer` inceleme/güvenlik subagent'ı (`/erp-review`) + Semgrep/gitleaks (`brew install`); Bulgular K/Y/O/D çıktısı; subagent oturum-başında yüklenir (restart gerek)

## Roadmap
- [project_voice_input.md](project_voice_input.md) — Sesli üretim girişi V1-V3 ✅ 3657 test; V3: fireNotes→notlar entegrasyonu + Ctrl+M shortcut (input/processing/demo/repeat guard'lı); pure helper voice-note-helpers.ts (client/server boundary korunur)
- [yuksek_etki_plan.md](yuksek_etki_plan.md) — 4 yüksek etkili stok özelliği: 3/4 tamamlandı; 4. Tedarikçi Performansı kullanıcı kararıyla KAPALI/yapılmayacak (2026-09-16)
- [project_quotes.md](project_quotes.md) — Teklif modülü — **V7 master plan TAMAMLANDI** (Faz 1–8; mig.073–080 APPLY edildi): accept→sipariş atomik, PDF arşiv, revizyon, not şablonları. Kalan (quotes borcu DEĞİL): audit actor trigger, Paraşüt Sandbox gate.
- [project_frontend_renewal.md](project_frontend_renewal.md) — Frontend yenileme planı — **Faz B KAPANDI (2026-09-05)**: DataTable/Card/Badge · ortak `Modal`+`Drawer` (`dialog-a11y`) · `PageHeader`/`FilterChips`/`NavLink`/`SectionHeader`/`Stat`; dokunma hedefleri + mobil ölçüm de kapalı.

## Feedback
- [feedback_auto_use_skills.md](feedback_auto_use_skills.md) — Proje kapsamındaki erp2-* skill'leri kullanıcı söylemeden otomatik kullan (tetikleyici eşleşince kendiliğinden)
- [feedback_no_silent_deletes.md](feedback_no_silent_deletes.md) — Kod silmeden önce onay veya net gerekçe gerekiyor
- [feedback_memory_updates.md](feedback_memory_updates.md) — MEMORY.md ve memory dosyaları düzenli güncel tutulmalı
- [feedback_auto_context_update.md](feedback_auto_context_update.md) — current_focus.md ve CLAUDE.md Mevcut Durum her iş sonunda otomatik güncellenmeli
- [feedback_plan_domain_check.md](feedback_plan_domain_check.md) — Plan yazmadan önce domain-rules.md okunmalı; projeden kopuk özellik planlanmamalı
- [feedback_contract_in_types_not_comments.md](feedback_contract_in_types_not_comments.md) — Sözleşme yalnız YORUMDA yaşıyorsa fiilen yok — tipi daralt. Bir ENVANTER ölçmediğini kapsayamaz. Bir kuralın ADINA değil YÜRÜDÜĞÜ AĞACA bak. Bir iddia iki dosyanın BİLEŞİMİNDE yaşayabilir.
- [feedback_global_over_hardcode.md](feedback_global_over_hardcode.md) — Tekrarlayan UI ayarını sayfa-bazlı hardcode yerine component varsayılanı/global yap
- [feedback_ask_scope_decisions.md](feedback_ask_scope_decisions.md) — Kapsam/varsayım kararlarını AskUserQuestion ile sor, sonra kendin ilerle (mikro-onay bekleme)
