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
