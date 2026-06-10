/**
 * Veri Aktarım Merkezi — sayfalar arası File aktarımı.
 *
 * Hub (/dashboard/import) dropzone'una bırakılan dosya, uzantısına göre
 * Excel sihirbazına (/dashboard/import/excel) veya AI kuyruğuna yönlendirilir.
 * App Router client-side navigasyonu JS belleğini koruduğu için File objesi
 * module-level singleton ile taşınır; sayfa doğrudan açılır/yenilenirse
 * singleton boştur ve hedef sayfa kendi dosya seçicisini gösterir.
 *
 * Oku-ve-temizle sözleşmesi: takeImportFile aynı dosyayı bir kez döndürür.
 */

export type ImportFileTarget = "excel" | "ai";

let stashed: { file: File; target: ImportFileTarget } | null = null;

export function stashImportFile(file: File, target: ImportFileTarget): void {
    stashed = { file, target };
}

export function takeImportFile(target: ImportFileTarget): File | null {
    if (stashed && stashed.target === target) {
        const file = stashed.file;
        stashed = null;
        return file;
    }
    return null;
}

/** Excel sihirbazına yönlenecek uzantılar (AI classify maliyeti olmadan). */
export const EXCEL_WIZARD_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);

export function isExcelWizardFile(fileName: string): boolean {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return EXCEL_WIZARD_EXTENSIONS.has(ext);
}
