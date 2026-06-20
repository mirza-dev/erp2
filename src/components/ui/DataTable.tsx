import type { CSSProperties, ReactNode } from "react";

export interface DataTableColumn<T> {
    key: string;
    header: ReactNode;
    /** Hücre + başlık hizalaması. Default: left. */
    align?: "left" | "center" | "right";
    /** Sabit kolon genişliği (örn. "36px"). */
    width?: string;
    cell: (row: T) => ReactNode;
    /** Edge-case başlık stili (örn. checkbox kolonu tighter padding). */
    headerStyle?: CSSProperties;
    /** Edge-case hücre stili. */
    cellStyle?: CSSProperties;
}

export interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    /** rows boşken gösterilecek içerik. */
    emptyMessage?: ReactNode;
    /** Tablonun altına (kart içinde) render edilir — örn. <Pagination/>. */
    footer?: ReactNode;
    /**
     * Satıra tıklayınca çağrılır (örn. detay sayfasına gitme). Verilirse satır
     * `cursor: pointer` alır. Satır içinde gezinmeyi tetiklememesi gereken
     * öğeler (checkbox, link) kendi onClick'inde `e.stopPropagation()` yapmalı.
     */
    onRowClick?: (row: T) => void;
    /**
     * Tablo için minimum genişlik (örn. "700px"). Dar ekranda tablo bu genişliğin
     * altına inmez; DataTable tabloyu `overflow-x: auto` ile sarar (yatay kaydırma).
     */
    minWidth?: string;
    /**
     * Satır bazlı ek stil (örn. pasif kaydı soluklaştırma `opacity`). `onRowClick`
     * `cursor: pointer`'ının üstüne biner. Verilmezse satıra ek stil uygulanmaz.
     */
    rowStyle?: (row: T) => CSSProperties;
}

const thStyle: CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: "var(--font-table-heading-weight)",
    color: "var(--text-secondary)",
    borderBottom: "var(--line-width) solid var(--surface-border)",
};

const tdStyle: CSSProperties = {
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: "var(--font-table-cell-weight)",
    borderBottom: "var(--line-width) solid var(--border-tertiary)",
    color: "var(--text-primary)",
    lineHeight: 1.4,
};

/**
 * Generic liste tablosu. Kolon tanımı + satır verisi alır; başlık, boş durum,
 * hizalama ve hover'ı (globals.css `.erp-data-table` kuralı) tek yerden yönetir.
 * Seçim/sıralama mantığı caller'da kalır — checkbox vb. `header`/`cell` içinde verilir.
 */
export default function DataTable<T>({
    columns,
    rows,
    rowKey,
    emptyMessage,
    footer,
    onRowClick,
    minWidth,
    rowStyle,
}: DataTableProps<T>) {
    if (rows.length === 0) {
        return (
            <>
                <div
                    style={{
                        padding: "32px",
                        textAlign: "center",
                        color: "var(--text-tertiary)",
                        fontSize: "13px",
                    }}
                >
                    {emptyMessage ?? "Kayıt bulunamadı."}
                </div>
                {footer}
            </>
        );
    }

    return (
        <>
            <div style={{ overflowX: "auto" }}>
            <table
                className="erp-data-table"
                style={{ width: "100%", borderCollapse: "collapse", ...(minWidth ? { minWidth } : {}) }}
            >
                <thead>
                    <tr style={{ background: "var(--table-header-bg)" }}>
                        {columns.map(col => (
                            <th
                                key={col.key}
                                style={{
                                    ...thStyle,
                                    textAlign: col.align ?? "left",
                                    ...(col.width ? { width: col.width } : {}),
                                    ...col.headerStyle,
                                }}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr
                            key={rowKey(row)}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                            style={{
                                ...(onRowClick ? { cursor: "pointer" } : {}),
                                ...rowStyle?.(row),
                            }}
                        >
                            {columns.map(col => (
                                <td
                                    key={col.key}
                                    style={{
                                        ...tdStyle,
                                        textAlign: col.align ?? "left",
                                        ...(col.width ? { width: col.width } : {}),
                                        ...col.cellStyle,
                                    }}
                                >
                                    {col.cell(row)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
            {footer}
        </>
    );
}
