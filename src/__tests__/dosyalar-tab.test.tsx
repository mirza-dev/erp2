// @vitest-environment jsdom
/**
 * Ayarlar → Dosyalar sekmesi (DosyalarTab) — davranış testleri.
 * Arama (tr-TR), kategori filtresi+sayılar, sıralama, isimlendirme modalı,
 * iki aşamalı silme, boş durumlar, depolama göstergesi, DnD kaynak kilitleri.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const toastSpy = vi.fn();
vi.mock("@/components/ui/Toast", () => ({
    useToast: () => ({ toast: toastSpy }),
}));

let mockedIsDemo = false;
vi.mock("@/lib/demo-utils", async () => {
    const actual = await vi.importActual<typeof import("@/lib/demo-utils")>("@/lib/demo-utils");
    return { ...actual, useIsDemo: () => mockedIsDemo };
});

import DosyalarTab from "@/components/settings/DosyalarTab";

const FILES = [
    {
        id: "00000000-0000-4000-8000-00000000000a",
        display_name: "Bayilik Sözleşmesi.pdf", description: "İmzalı nüsha", category: "sozlesme",
        ext: "PDF", file_path: "company/a.pdf", file_size: 2412000, mime_type: "application/pdf",
        uploaded_at: "2026-05-28T10:00:00Z", uploaded_by: "Mirza S.", deleted_at: null,
    },
    {
        id: "00000000-0000-4000-8000-00000000000b",
        display_name: "Fiyat Listesi.xlsx", description: null, category: "teklif-eki",
        ext: "XLSX", file_path: "company/b.xlsx", file_size: 456000, mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        uploaded_at: "2026-06-01T10:00:00Z", uploaded_by: "Burak T.", deleted_at: null,
    },
    {
        id: "00000000-0000-4000-8000-00000000000c",
        display_name: "Firma Logosu.svg", description: "Antetlerde", category: "kurumsal",
        ext: "SVG", file_path: "company/c.svg", file_size: 22000, mime_type: "image/svg+xml",
        uploaded_at: "2026-01-20T10:00:00Z", uploaded_by: "Elif K.", deleted_at: null,
    },
];

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function mockListResponse(files = FILES) {
    return {
        ok: true,
        json: async () => ({
            files,
            usedBytes: files.reduce((s, f) => s + f.file_size, 0),
            limitBytes: 5120 * 1024 * 1024,
        }),
    };
}

beforeEach(() => {
    mockedIsDemo = false;
    toastSpy.mockClear();
    fetchMock = vi.fn().mockResolvedValue(mockListResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

async function renderTab() {
    render(<DosyalarTab />);
    await waitFor(() => expect(screen.getByText("Bayilik Sözleşmesi.pdf")).toBeTruthy());
}

function tableRows(): HTMLElement[] {
    return within(screen.getByRole("table")).getAllByRole("row").slice(1); // thead atla
}

describe("DosyalarTab — liste & filtre", () => {
    it("GET'ten dosyaları yükler; varsayılan sıralama yüklenme tarihi azalan", async () => {
        await renderTab();
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/files");
        const names = tableRows().map(r => within(r).getAllByRole("cell")[0].textContent);
        expect(names[0]).toContain("Fiyat Listesi.xlsx");   // 2026-06-01
        expect(names[1]).toContain("Bayilik Sözleşmesi.pdf"); // 2026-05-28
        expect(names[2]).toContain("Firma Logosu.svg");      // 2026-01-20
    });

    it("arama tr-TR locale ile ad+açıklama+yükleyen üzerinde filtreler", async () => {
        await renderTab();
        const search = screen.getByLabelText("Dosya ara");
        // Türkçe büyük İ → küçük i dönüşümü: "İmzalı" açıklaması "imza" ile bulunmalı
        fireEvent.change(search, { target: { value: "imza" } });
        expect(tableRows()).toHaveLength(1);
        // yükleyene göre
        fireEvent.change(search, { target: { value: "elif" } });
        expect(tableRows()).toHaveLength(1);
        expect(tableRows()[0].textContent).toContain("Firma Logosu.svg");
        // eşleşme yok → boş durum mesajı
        fireEvent.change(search, { target: { value: "yokboylebirsey" } });
        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByText(/ile eşleşen dosya bulunamadı/)).toBeTruthy();
    });

    it("kategori menüsü sayıları gösterir, seçim filtreler, boş kategori mesaj verir", async () => {
        await renderTab();
        fireEvent.click(screen.getByRole("button", { name: /Tüm Kategoriler/ }));
        const menu = screen.getByRole("menu");
        const sozlesmeItem = within(menu).getByRole("menuitem", { name: /Sözleşmeler/ });
        expect(sozlesmeItem.textContent).toContain("1");
        fireEvent.click(sozlesmeItem);
        expect(tableRows()).toHaveLength(1);
        expect(tableRows()[0].textContent).toContain("Bayilik Sözleşmesi.pdf");

        // boş kategori (belge: 0 dosya)
        fireEvent.click(screen.getByRole("button", { name: /Sözleşmeler/ }));
        fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Sertifikalar & Belgeler/ }));
        expect(screen.getByText(/Bu kategoride henüz dosya yok/)).toBeTruthy();
    });

    it("Dosya başlığına tıklayınca ada göre artan, tekrar tıklayınca azalan sıralanır", async () => {
        await renderTab();
        const nameHeader = screen.getByText("Dosya");
        fireEvent.click(nameHeader);
        let names = tableRows().map(r => within(r).getAllByRole("cell")[0].textContent ?? "");
        expect(names[0]).toContain("Bayilik");
        fireEvent.click(nameHeader);
        names = tableRows().map(r => within(r).getAllByRole("cell")[0].textContent ?? "");
        expect(names[0]).toContain("Fiyat Listesi");
    });

    it("depolama göstergesi toplamı ve özet metni doğru", async () => {
        await renderTab();
        // 2412000+456000+22000 ≈ 2.75 MB → "3 MB / 5 GB"
        expect(screen.getByText("3 MB / 5 GB")).toBeTruthy();
        expect(screen.getByText(/3 dosya görüntüleniyor · Silinen dosyalar 30 gün çöp kutusunda saklanır/)).toBeTruthy();
    });

    it("SVG satırında Önizle yok (stored-XSS — indirme zorunlu); diğerlerinde var", async () => {
        await renderTab();
        expect(screen.queryByLabelText("Önizle: Firma Logosu.svg")).toBeNull();
        expect(screen.getByLabelText("İndir: Firma Logosu.svg")).toBeTruthy();
        expect(screen.getByLabelText("Önizle: Bayilik Sözleşmesi.pdf")).toBeTruthy();
    });
});

describe("DosyalarTab — yükleme modalı", () => {
    function pickFile(name: string, type = "application/pdf") {
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File([new Uint8Array(10)], name, { type });
        fireEvent.change(input, { target: { files: [file] } });
    }

    it("dosya seçimi modalı açar: taban ad düzenlenebilir, uzantı sabit; boş ad Yükle'yi kilitler", async () => {
        await renderTab();
        pickFile("Yeni Sözleşme.pdf");
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Dosyayı Yükle")).toBeTruthy();
        const nameInput = within(dialog).getByLabelText("Dosya adı (1)") as HTMLInputElement;
        expect(nameInput.value).toBe("Yeni Sözleşme");
        expect(within(dialog).getByText(".pdf")).toBeTruthy();

        const uploadBtn = within(dialog).getByRole("button", { name: /Yükle$/ }) as HTMLButtonElement;
        expect(uploadBtn.disabled).toBe(false);
        fireEvent.change(nameInput, { target: { value: "   " } });
        expect((within(dialog).getByRole("button", { name: /Yükle$/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("ad alanına yazarken focus+select TEKRARLANMAZ — yazı silinmez (mount-only effect)", async () => {
        // Bug: effect [onCancel]'a bağlıydı; onCancel inline olduğundan her tuşta
        // yeniden koşup select() yapıyordu → yazılan harf seçilip ezilirdi.
        const selectSpy = vi.spyOn(HTMLInputElement.prototype, "select");
        await renderTab();
        pickFile("Sözleşme.pdf");
        const dialog = await screen.findByRole("dialog");
        const nameInput = within(dialog).getByLabelText("Dosya adı (1)") as HTMLInputElement;
        const mountCalls = selectSpy.mock.calls.length;

        // her change parent'ı re-render eder (pending state) — effect yeniden koşmamalı
        fireEvent.change(nameInput, { target: { value: "T" } });
        fireEvent.change(nameInput, { target: { value: "Te" } });
        fireEvent.change(nameInput, { target: { value: "Tedarik Sözleşmesi" } });

        expect(nameInput.value).toBe("Tedarik Sözleşmesi");
        expect(selectSpy.mock.calls.length).toBe(mountCalls); // yeniden select YOK
        selectSpy.mockRestore();
    });

    it("desteklenmeyen uzantı modal açmaz, hata toast'ı verir", async () => {
        await renderTab();
        pickFile("zararli.exe", "application/octet-stream");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
    });

    it("Yükle → POST FormData (display_name+category) + refetch + başarı toast'ı", async () => {
        await renderTab();
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
            if (init?.method === "POST") return { ok: true, json: async () => ({ id: "yeni" }) };
            return mockListResponse();
        });
        pickFile("Yeni Sözleşme.pdf");
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("KATEGORİ"), { target: { value: "sozlesme" } });
        fireEvent.click(within(dialog).getByRole("button", { name: /Yükle$/ }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "POST");
        expect(postCall?.[0]).toBe("/api/settings/files");
        const fd = (postCall![1] as RequestInit).body as FormData;
        expect(fd.get("display_name")).toBe("Yeni Sözleşme");
        expect(fd.get("category")).toBe("sozlesme");
        expect(toastSpy).toHaveBeenCalledWith({ type: "success", message: '"Yeni Sözleşme.pdf" yüklendi.' });
    });

    it("demo modda dosya seçimi engellenir (toast), modal açılmaz", async () => {
        mockedIsDemo = true;
        await renderTab();
        pickFile("x.pdf");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "info" }));
    });
});

describe("DosyalarTab — silme", () => {
    it("Sil iki aşamalı: önce 'Sil?' onayı, ikinci tık DELETE + refetch", async () => {
        await renderTab();
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
            if (init?.method === "DELETE") return { ok: true, json: async () => ({ ok: true }) };
            return mockListResponse(FILES.slice(1)); // silinen düştü
        });
        fireEvent.click(screen.getByLabelText("Sil: Bayilik Sözleşmesi.pdf"));
        expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === "DELETE")).toBe(false);
        const confirmBtn = screen.getByRole("button", { name: "Sil?" });
        fireEvent.click(confirmBtn);
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/settings/files/00000000-0000-4000-8000-00000000000a",
                expect.objectContaining({ method: "DELETE" }),
            );
        });
        await waitFor(() => expect(screen.queryByText("Bayilik Sözleşmesi.pdf")).toBeNull());
        expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
    });
});

describe("kaynak kilitleri (source-lock)", () => {
    const src = readFileSync(join(process.cwd(), "src/components/settings/DosyalarTab.tsx"), "utf8");

    it("pencere-geneli DnD: window dinleyicileri + dragover/drop preventDefault + dragDepth sayacı", () => {
        expect(src).toMatch(/window\.addEventListener\("dragenter"/);
        expect(src).toMatch(/window\.addEventListener\("drop"/);
        // kritik: preventDefault yoksa tarayıcı bırakılan dosyayı açıp sayfadan ayrılır
        const onOver = src.slice(src.indexOf("const onOver"), src.indexOf("const onLeave"));
        expect(onOver).toMatch(/e\.preventDefault\(\)/);
        const onDrop = src.slice(src.indexOf("const onDrop"), src.indexOf('window.addEventListener("dragenter"'));
        expect(onDrop).toMatch(/e\.preventDefault\(\)/);
        expect(src).toMatch(/dragDepth/);
        // gizli panelde (başka sekme aktifken) tepki verilmez
        expect(src).toMatch(/section\[hidden\]/);
    });

    it("önizleme popup-blocker'a dayanıklı: sekme senkron açılır, URL sonra atanır", () => {
        const preview = src.slice(src.indexOf("const handlePreview"), src.indexOf("const handleDownload"));
        expect(preview.indexOf('window.open("", "_blank")')).toBeGreaterThan(-1);
        expect(preview.indexOf("window.open")).toBeLessThan(preview.indexOf("await fetch"));
    });

    it("tema kuralı: component hex renk içermez (yalnız CSS var)", () => {
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
});
