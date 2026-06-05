"use client";

import type { CSSProperties } from "react";

export type UnderlinedFilterTabItem<Key extends string> = {
    key: Key;
    label: string;
    count?: number | string | null;
};

type UnderlinedFilterTabsProps<Key extends string> = {
    items: readonly UnderlinedFilterTabItem<Key>[];
    activeKey: Key;
    onChange: (key: Key) => void;
    ariaLabel: string;
    style?: CSSProperties;
};

export default function UnderlinedFilterTabs<Key extends string>({
    items,
    activeKey,
    onChange,
    ariaLabel,
    style,
}: UnderlinedFilterTabsProps<Key>) {
    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            style={{
                display: "flex",
                gap: 0,
                borderBottom: "var(--line-width) solid var(--border-tertiary)",
                overflowX: "auto",
                overflowY: "hidden",
                maxWidth: "100%",
                scrollbarWidth: "thin",
                ...style,
            }}
        >
            {items.map((item) => {
                const active = item.key === activeKey;
                const label = item.count === undefined || item.count === null
                    ? item.label
                    : `${item.label} (${item.count})`;

                return (
                    <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(item.key)}
                        style={{
                            fontSize: "12px",
                            fontWeight: active ? 600 : "var(--font-ui-weight)",
                            padding: "8px 14px",
                            border: "none",
                            borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                            background: "transparent",
                            color: active ? "var(--accent-text)" : "var(--text-interactive-muted)",
                            cursor: "pointer",
                            marginBottom: "-1px",
                            whiteSpace: "nowrap",
                            flex: "0 0 auto",
                        }}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
