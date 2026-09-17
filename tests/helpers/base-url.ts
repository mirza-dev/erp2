/**
 * E2E'nin tek adres kaynağı.
 *
 * 2026-09-16: `localhost:3000` beş dosyada elle yazılıydı. O gün portu BAŞKA bir araç
 * (`vinext dev`, [::1]:3000) tutuyordu; Playwright'ın `reuseExistingServer` kontrolü o
 * sunucuyu "bizim" sanıp suite'i YANLIŞ uygulamaya karşı koşturabilirdi — ve `next dev`
 * port dolu olunca sessizce 3001'e kayar. Port artık tek yerden ve env'den geliyor:
 * `E2E_PORT=3100 npm run test:e2e`. Varsayılan 3000 (davranış değişmez).
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3000);
export const BASE_URL = `http://localhost:${E2E_PORT}`;
