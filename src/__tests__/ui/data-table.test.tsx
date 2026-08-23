// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";

afterEach(cleanup);

interface Row {
    id: string;
    name: string;
    qty: number;
}

const rows: Row[] = [
    { id: "1", name: "Alfa", qty: 10 },
    { id: "2", name: "Beta", qty: 20 },
];

const columns: DataTableColumn<Row>[] = [
    { key: "name", header: "Ad", cell: r => r.name },
    { key: "qty", header: "Adet", align: "center", width: "80px", cell: r => `${r.qty} adet` },
];

describe("DataTable", () => {
    it("kolon başlıklarını ve satır hücrelerini render eder", () => {
        render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
        expect(screen.getByText("Ad")).toBeTruthy();
        expect(screen.getByText("Adet")).toBeTruthy();
        expect(screen.getByText("Alfa")).toBeTruthy();
        expect(screen.getByText("10 adet")).toBeTruthy();
        expect(screen.getByText("Beta")).toBeTruthy();
    });

    it("erp-data-table class'ı ile hover'ı CSS'e bırakır", () => {
        const { container } = render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
        expect(container.querySelector("table.erp-data-table")).toBeTruthy();
    });

    it("align ve width kolona uygulanır", () => {
        const { container } = render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
        const headerCells = container.querySelectorAll("thead th");
        expect((headerCells[1] as HTMLElement).style.textAlign).toBe("center");
        expect((headerCells[1] as HTMLElement).style.width).toBe("80px");
    });

    it("minWidth verilince table'a uygulanır + overflow-x wrapper sarar", () => {
        const { container } = render(
            <DataTable columns={columns} rows={rows} rowKey={r => r.id} minWidth="700px" />,
        );
        const table = container.querySelector("table.erp-data-table") as HTMLElement;
        expect(table.style.minWidth).toBe("700px");
        const wrapper = table.parentElement as HTMLElement;
        expect(wrapper.style.overflowX).toBe("auto");
    });

    it("minWidth yokken table'da minWidth set edilmez", () => {
        const { container } = render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
        const table = container.querySelector("table.erp-data-table") as HTMLElement;
        expect(table.style.minWidth).toBe("");
    });

    it("rows boşken emptyMessage gösterir, tablo render etmez", () => {
        const { container } = render(
            <DataTable columns={columns} rows={[]} rowKey={r => r.id} emptyMessage="Kayıt yok." />,
        );
        expect(screen.getByText("Kayıt yok.")).toBeTruthy();
        expect(container.querySelector("table")).toBeNull();
    });

    it("onRowClick verilince satır tıklanınca ilgili row ile çağrılır + cursor pointer", () => {
        const onRowClick = vi.fn();
        const { container } = render(
            <DataTable columns={columns} rows={rows} rowKey={r => r.id} onRowClick={onRowClick} />,
        );
        const firstRow = container.querySelector("tbody tr") as HTMLElement;
        expect(firstRow.style.cursor).toBe("pointer");
        fireEvent.click(firstRow);
        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });

    it("onRowClick yokken satır cursor pointer almaz", () => {
        const { container } = render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
        const firstRow = container.querySelector("tbody tr") as HTMLElement;
        expect(firstRow.style.cursor).toBe("");
    });

    // ── Satır klavye erişimi (Faz B #7) ──────────────────────────────────────
    // Tıklanabilir satır yalnız fareyle çalışmamalı. products/page.tsx bunu elle
    // yazıyordu (tabIndex/onKeyDown/aria-label); DataTable'a taşındı → onRowClick
    // kullanan TÜM listeler klavyeyle gezilebilir.

    it("onRowClick verilince satır tabIndex=0 alır ama role=button ALMAZ", () => {
        const { container } = render(
            <DataTable columns={columns} rows={rows} rowKey={r => r.id} onRowClick={() => {}} />,
        );
        const firstRow = container.querySelector("tbody tr") as HTMLElement;
        expect(firstRow.getAttribute("tabindex")).toBe("0");
        // <tr role="button"> satırı ekran okuyucuda "tablo satırı" olmaktan çıkarır.
        expect(firstRow.getAttribute("role")).toBeNull();
    });

    it("Enter ve Space satırı tetikler (preventDefault ile)", () => {
        const onRowClick = vi.fn();
        const { container } = render(
            <DataTable columns={columns} rows={rows} rowKey={r => r.id} onRowClick={onRowClick} />,
        );
        const firstRow = container.querySelector("tbody tr") as HTMLElement;

        const enter = fireEvent.keyDown(firstRow, { key: "Enter" });
        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
        expect(enter).toBe(false); // preventDefault çağrıldı → sayfa kaymaz

        const space = fireEvent.keyDown(firstRow, { key: " " });
        expect(onRowClick).toHaveBeenCalledTimes(2);
        expect(space).toBe(false);
    });

    it("ilgisiz tuş satırı tetiklemez", () => {
        const onRowClick = vi.fn();
        const { container } = render(
            <DataTable columns={columns} rows={rows} rowKey={r => r.id} onRowClick={onRowClick} />,
        );
        fireEvent.keyDown(container.querySelector("tbody tr") as HTMLElement, { key: "a" });
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it("rowAriaLabel satıra aria-label basar; verilmezse attribute yok", () => {
        const { container, rerender } = render(
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={r => r.id}
                onRowClick={() => {}}
                rowAriaLabel={r => `${r.name} detayını gör`}
            />,
        );
        const bodyRows = container.querySelectorAll("tbody tr");
        expect(bodyRows[0].getAttribute("aria-label")).toBe("Alfa detayını gör");
        expect(bodyRows[1].getAttribute("aria-label")).toBe("Beta detayını gör");

        rerender(
            <DataTable columns={columns} rows={rows} rowKey={r => r.id} onRowClick={() => {}} />,
        );
        expect(container.querySelector("tbody tr")!.getAttribute("aria-label")).toBeNull();
    });

    it("onRowClick yokken satır odaklanabilir DEĞİL (tabIndex/aria-label yok)", () => {
        const { container } = render(
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={r => r.id}
                rowAriaLabel={r => r.name}
            />,
        );
        const firstRow = container.querySelector("tbody tr") as HTMLElement;
        expect(firstRow.getAttribute("tabindex")).toBeNull();
        expect(firstRow.getAttribute("aria-label")).toBeNull();
    });

    it("rowStyle satır <tr>'ye uygulanır (örn. pasif kaydı soluklaştırma)", () => {
        const { container } = render(
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={r => r.id}
                rowStyle={r => ({ opacity: r.qty > 15 ? 1 : 0.55 })}
            />,
        );
        const bodyRows = container.querySelectorAll("tbody tr");
        expect((bodyRows[0] as HTMLElement).style.opacity).toBe("0.55");
        expect((bodyRows[1] as HTMLElement).style.opacity).toBe("1");
    });

    it("rowStyle ve onRowClick birlikte: cursor pointer korunur + stil biner", () => {
        const { container } = render(
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={r => r.id}
                onRowClick={() => {}}
                rowStyle={() => ({ opacity: 0.5 })}
            />,
        );
        const firstRow = container.querySelector("tbody tr") as HTMLElement;
        expect(firstRow.style.cursor).toBe("pointer");
        expect(firstRow.style.opacity).toBe("0.5");
    });

    it("footer hem dolu hem boş durumda render edilir", () => {
        const footer = <div>FOOTER</div>;
        const { rerender } = render(
            <DataTable columns={columns} rows={rows} rowKey={r => r.id} footer={footer} />,
        );
        expect(screen.getByText("FOOTER")).toBeTruthy();
        rerender(
            <DataTable columns={columns} rows={[]} rowKey={r => r.id} emptyMessage="boş" footer={footer} />,
        );
        expect(screen.getByText("FOOTER")).toBeTruthy();
    });
});
