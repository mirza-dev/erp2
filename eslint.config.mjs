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
    },
  },
]);

export default eslintConfig;
