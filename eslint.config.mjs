import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // İç içe build çıktıları (örn. .claude/worktrees/<x>/.next) — kök `.next/**`
    // yalnız kökü kapsar; nested .next dizinleri ayrıca yakalanmalı.
    "**/.next/**",
    // Lokal worktree/agent/skill dizinleri — uygulama kaynağı DEĞİL, .gitignored.
    // `.claude/worktrees/<x>` kendi .next build'iyle ~32k sahte sorun üretiyordu →
    // `npm run lint` (eslint .) güvenilmez oluyordu. Dışlanınca `npm run lint`
    // == `eslint src` (tek güvenilir sinyal, src baseline).
    ".claude/**",
    ".agents/**",
    "skills/**",
    // Vitest/c8 coverage report artifacts (auto-generated, eslint-disable directives in vendor JS)
    "coverage/**",
    // k6 load test runner — separate runtime; Next.js ESLint kuralları geçerli değil
    "tests/load/**",
    // Playwright generated artifacts (test-results + HTML report; .gitignored zaten)
    "playwright-report/**",
    "test-results/**",
  ]),
  // "_"-prefix konvansiyonu: kullanılmayan args/vars/catch error'lar ESLint'te
  // sessize alınır (TS/JS topluluk standardı). Mevcut `_code`, `_input`, `_maxLen`
  // gibi kullanımları meşrulaştırır.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // ── react-hooks@7 (React Compiler-era) strictness suppression ─────────────
      // Bu 3 kural eslint-plugin-react-hooks v7'de geldi; bu kod tabanı onlardan
      // ÖNCE yazıldı + bilinçli mimari kararlarla çakışıyor (kullanıcı kararı:
      // config'te justify+sustur). Gerçek düzeltme = frontend-renewal planı.
      //
      // set-state-in-effect (28): Proje SWR/React Query KULLANMIYOR (CLAUDE.md
      //   sözleşmesi) → veri yükleme mount-time `useEffect` + setState ile yapılır
      //   (`refetch().finally(() => setLoading(false))` deseni). React-doctor'da
      //   kardeş kural `no-fetch-in-effect` zaten aynı gerekçeyle suppress edildi.
      // refs/purity (3): useState lazy-initializer içinde `ref.current` okuma /
      //   `Date.now()` çağrısı — pratikte tek-sefer çalışır, davranışsal bug yok.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
]);

export default eslintConfig;
