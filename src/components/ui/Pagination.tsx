"use client";

import { CSSProperties, ReactNode } from "react";
import { buildPageWindow } from "@/lib/pagination-helpers";

export interface PaginationProps {
    currentPage:  number;
    totalPages:   number;
    totalItems:   number;
    pageSize:     number;
    onPageChange: (page: number) => void;
    /** "ürün" | "sipariş" | "müşteri" … default "kayıt" */
    itemLabel?:   string;
}

const buttonBase: CSSProperties = {
    minWidth: "32px",
    height: "32px",
    padding: "0 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.08s, border-color 0.08s, color 0.08s",
    background: "transparent",
    color: "var(--text-secondary)",
    border: "0.5px solid var(--border-tertiary)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
};

const buttonActive: CSSProperties = {
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    borderColor: "var(--accent-border)",
};

const buttonDisabled: CSSProperties = {
    cursor: "not-allowed",
    opacity: 0.4,
};

function PageButton({
    children,
    onClick,
    active,
    disabled,
    ariaLabel,
    ariaCurrent,
}: {
    children:     ReactNode;
    onClick:      () => void;
    active?:      boolean;
    disabled?:    boolean;
    ariaLabel:    string;
    ariaCurrent?: "page";
}) {
    const style: CSSProperties = {
        ...buttonBase,
        ...(active ? buttonActive : {}),
        ...(disabled ? buttonDisabled : {}),
    };
    return (
        <button
            type="button"
            aria-label={ariaLabel}
            aria-current={ariaCurrent}
            disabled={disabled}
            onClick={onClick}
            style={style}
        >
            {children}
        </button>
    );
}

export default function Pagination({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    itemLabel = "kayıt",
}: PaginationProps) {
    if (totalPages <= 1) return null;

    const windowed = buildPageWindow(currentPage, totalPages);
    const firstIndex = (currentPage - 1) * pageSize + 1;
    const lastIndex = Math.min(currentPage * pageSize, totalItems);

    return (
        <nav
            aria-label="Sayfalama"
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                fontSize: "12px",
                color: "var(--text-secondary)",
                borderTop: "0.5px solid var(--border-tertiary)",
                background: "var(--bg-primary)",
                flexWrap: "wrap",
                gap: "12px",
            }}
        >
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {firstIndex}-{lastIndex} / {totalItems} {itemLabel}
            </span>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                <PageButton
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    ariaLabel="Önceki sayfa"
                >
                    ‹ Önceki
                </PageButton>
                {windowed.map((p, i) =>
                    p === "…" ? (
                        <span
                            key={`ellipsis-${i}`}
                            aria-hidden="true"
                            style={{ padding: "0 6px", color: "var(--text-tertiary)" }}
                        >
                            …
                        </span>
                    ) : (
                        <PageButton
                            key={p}
                            onClick={() => onPageChange(p)}
                            active={p === currentPage}
                            ariaLabel={`Sayfa ${p}`}
                            ariaCurrent={p === currentPage ? "page" : undefined}
                        >
                            {p}
                        </PageButton>
                    ),
                )}
                <PageButton
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    ariaLabel="Sonraki sayfa"
                >
                    Sonraki ›
                </PageButton>
            </div>
        </nav>
    );
}
