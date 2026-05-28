"use client";

/**
 * Faz 3a — Drop zone for AI import.
 *
 * Drop scope sınırlı — sadece bu component'in <div>'i (sayfa-wide overlay yok,
 * diğer file input'larla event çakışması yok).
 *
 * Pure helpers live in @/lib/import-file-helpers.
 */
import { useState, useRef } from "react";
import { CLASSIFIER_ACCEPT } from "@/lib/import-file-helpers";

export interface DropZoneProps {
    onFiles: (files: File[]) => void;
    disabled?: boolean;
    disabledTooltip?: string;
}

export default function DropZone({ onFiles, disabled, disabledTooltip }: DropZoneProps) {
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const handleFiles = (list: FileList | null) => {
        if (!list || list.length === 0) return;
        if (disabled) return;
        onFiles(Array.from(list));
    };

    return (
        <div
            onDragOver={e => {
                e.preventDefault();
                if (!disabled) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
            }}
            aria-label="Dosya bırakma alanı"
            aria-disabled={disabled}
            style={{
                padding: "32px 24px",
                border: `1.5px dashed ${dragOver && !disabled ? "var(--accent-border)" : "var(--border-secondary)"}`,
                borderRadius: "10px",
                background: dragOver && !disabled ? "var(--accent-bg)" : "var(--bg-secondary)",
                textAlign: "center",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                transition: "background 0.15s, border-color 0.15s",
            }}
            onClick={() => !disabled && inputRef.current?.click()}
            title={disabled ? disabledTooltip : undefined}
        >
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>📥</div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                {dragOver ? "Dosyayı bırak" : "Dosyaları sürükle bırak"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                veya tıklayarak seç · PDF / PNG / JPEG / WebP / Excel / CSV · max 10 MB
            </div>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={CLASSIFIER_ACCEPT}
                onChange={e => {
                    handleFiles(e.target.files);
                    // Aynı dosyayı tekrar seçebilmek için input'u reset
                    if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={disabled}
                aria-label="Dosya seç"
                style={{ display: "none" }}
            />
        </div>
    );
}
