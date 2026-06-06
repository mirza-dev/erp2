// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RovenLogo } from "@/components/layout/RovenLogo";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("RovenLogo", () => {
    it("varsayılan: hexagon mark (svg + polygon) + 'Roven' wordmark render eder", () => {
        const html = renderToStaticMarkup(<RovenLogo />);
        expect(html).toContain("<svg");
        expect(html).toContain("<polygon");
        expect(html).toContain("currentColor");
        expect(html).toMatch(/>Roven</);
    });

    it("tema-uyumlu: sabit hex renk YOK, currentColor/inherit kullanılır", () => {
        const html = renderToStaticMarkup(<RovenLogo />);
        // mark + wordmark currentColor; sarmal inherit → parent var(--text-primary) miras alınır
        expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
    });

    it("varsayılan: svg dekoratif (aria-hidden), erişilebilir ad görünür wordmark'tan gelir", () => {
        const html = renderToStaticMarkup(<RovenLogo />);
        expect(html).toContain('aria-hidden="true"');
        expect(html).not.toContain('aria-label="Roven"');
    });

    it("showWordmark=false: yalnız mark, svg role=img + aria-label=Roven, görünür metin yok", () => {
        const html = renderToStaticMarkup(<RovenLogo showWordmark={false} />);
        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="Roven"');
        expect(html).not.toMatch(/>Roven</);
    });

    it("size prop svg boyutunu ayarlar", () => {
        const html = renderToStaticMarkup(<RovenLogo size={30} />);
        expect(html).toContain('width="30"');
        expect(html).toContain('height="30"');
    });

    it("wordmarkSize verilince fontSize uygulanır", () => {
        const html = renderToStaticMarkup(<RovenLogo wordmarkSize={15} />);
        expect(html).toMatch(/font-size:\s*15px/);
    });
});

describe("RovenLogo entegrasyon (source-regression)", () => {
    it("Topbar RovenLogo kullanır, düz 'Roven' metin düğümü kalmadı", () => {
        const src = read("src/components/layout/Topbar.tsx");
        expect(src).toContain("RovenLogo");
        expect(src).not.toMatch(/>\s*Roven\s*</);
    });

    it("landing page RovenLogo kullanır, düz 'Roven' metin düğümü kalmadı", () => {
        const src = read("src/app/page.tsx");
        expect(src).toContain("RovenLogo");
        expect(src).not.toMatch(/>\s*Roven\s*</);
    });

    it("login page RovenLogo kullanır, düz 'Roven' metin düğümü kalmadı", () => {
        const src = read("src/app/login/page.tsx");
        expect(src).toContain("RovenLogo");
        expect(src).not.toMatch(/>\s*Roven\s*</);
    });

    it("app/icon.svg favicon mevcut (hexagon mark)", () => {
        const svg = read("src/app/icon.svg");
        expect(svg).toContain("<polygon");
        expect(svg).toContain("<svg");
    });
});
