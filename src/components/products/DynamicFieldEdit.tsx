"use client";

import type { ProductTypeFieldRow } from "@/lib/database.types";

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "5px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    width: "100%",
};

const fieldRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    alignItems: "center",
    gap: "10px",
    padding: "8px 0",
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
};

export function FieldEdit({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div style={fieldRowStyle}>
            <span style={labelStyle}>{label}</span>
            <div>{children}</div>
        </div>
    );
}

export function DynamicFieldEdit({
    field,
    value,
    onChange,
}: {
    field: ProductTypeFieldRow;
    value: unknown;
    onChange: (v: unknown) => void;
}) {
    const label = `${field.label_tr}${field.required ? " *" : ""}`;
    const ariaLabel = field.label_tr;
    const help = field.help_text || field.placeholder || undefined;

    if (field.field_type === "boolean") {
        return (
            <FieldEdit label={label}>
                <input
                    type="checkbox"
                    checked={value === true}
                    onChange={e => onChange(e.target.checked)}
                    aria-label={ariaLabel}
                    style={{ width: "16px", height: "16px", accentColor: "var(--accent)", cursor: "pointer" }}
                />
                {help && <span style={{ fontSize: "11px", color: "var(--text-tertiary)", marginLeft: "8px" }}>{help}</span>}
            </FieldEdit>
        );
    }

    if (field.field_type === "select") {
        return (
            <FieldEdit label={label}>
                <select
                    value={typeof value === "string" ? value : ""}
                    onChange={e => onChange(e.target.value)}
                    aria-label={ariaLabel}
                    style={inputStyle}
                >
                    <option value="">— seçiniz —</option>
                    {(field.options ?? []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            </FieldEdit>
        );
    }

    if (field.field_type === "multiselect") {
        const selected: string[] = Array.isArray(value) ? value.map(String) : [];
        const toggle = (opt: string) => {
            if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
            else onChange([...selected, opt]);
        };
        return (
            <FieldEdit label={label}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }} role="group" aria-label={ariaLabel}>
                    {(field.options ?? []).map(opt => {
                        const isOn = selected.includes(opt);
                        return (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => toggle(opt)}
                                aria-pressed={isOn}
                                style={{
                                    fontSize: "11px",
                                    padding: "3px 10px",
                                    border: `0.5px solid ${isOn ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                    borderRadius: "12px",
                                    background: isOn ? "var(--accent-bg)" : "transparent",
                                    color: isOn ? "var(--accent-text)" : "var(--text-secondary)",
                                    cursor: "pointer",
                                    fontWeight: isOn ? 600 : 400,
                                }}
                            >
                                {opt}
                            </button>
                        );
                    })}
                </div>
            </FieldEdit>
        );
    }

    if (field.field_type === "longtext") {
        return (
            <FieldEdit label={label}>
                <textarea
                    value={typeof value === "string" ? value : ""}
                    onChange={e => onChange(e.target.value)}
                    aria-label={ariaLabel}
                    placeholder={field.placeholder ?? undefined}
                    rows={3}
                    style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
                />
            </FieldEdit>
        );
    }

    if (field.field_type === "number") {
        return (
            <FieldEdit label={label}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                        type="number"
                        value={value == null || value === "" ? "" : String(value)}
                        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
                        aria-label={ariaLabel}
                        placeholder={field.placeholder ?? undefined}
                        style={inputStyle}
                    />
                    {field.unit && (
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                            {field.unit}
                        </span>
                    )}
                </div>
            </FieldEdit>
        );
    }

    if (field.field_type === "date") {
        return (
            <FieldEdit label={label}>
                <input
                    type="date"
                    value={typeof value === "string" ? value : ""}
                    onChange={e => onChange(e.target.value)}
                    aria-label={ariaLabel}
                    style={inputStyle}
                />
            </FieldEdit>
        );
    }

    // Default: text
    return (
        <FieldEdit label={label}>
            <input
                type="text"
                value={typeof value === "string" ? value : value == null ? "" : String(value)}
                onChange={e => onChange(e.target.value)}
                aria-label={ariaLabel}
                placeholder={field.placeholder ?? undefined}
                style={inputStyle}
            />
        </FieldEdit>
    );
}
