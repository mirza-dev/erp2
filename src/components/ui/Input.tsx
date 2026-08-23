import type {
    CSSProperties,
    InputHTMLAttributes,
    SelectHTMLAttributes,
    TextareaHTMLAttributes,
} from "react";

/**
 * Form alanı boyutu — repodaki mevcut padding varyasyonlarının karşılığı.
 * `sm` 5px/8px · `md` 6px/10px (baskın, default) · `lg` 8px/10px.
 */
export type FieldSize = "sm" | "md" | "lg";

const SIZE_PADDING: Record<FieldSize, string> = {
    sm: "5px 8px",
    md: "6px 10px",
    lg: "8px 10px",
};

/**
 * Input/Select/Textarea ortak taban stili.
 *
 * TOKEN NOTU: input'lara özel `--input-bg` / `--input-border` kullanılır — premium
 * light theme (`f550e83`) bu token'ları getirmişti ama repodaki 18 yerel
 * `inputStyle` sabitinin çoğu `--bg-tertiary` / `--border-secondary` üzerinde
 * kalmıştı. Koyu temada bu ikisi neredeyse aynı (#22252c), aydınlıkta farklı
 * (#f8fbfe vs #f3f6fa) — drift tam bu yüzden fark edilmemişti. Kenarlık da
 * `0.5px` hardcode yerine `var(--line-width)` (1px).
 *
 * Bilinçli olarak DAHİL EDİLMEYENLER (mevcut görünümü değiştirmemek için):
 * `fontWeight` (--font-ui-weight = 500; yalnız 3 dosyada vardı), textarea
 * `resize`, select `cursor`, `fontFamily`. Bunlar gerekiyorsa `style` ile geçilir.
 */
function fieldStyle(size: FieldSize): CSSProperties {
    return {
        width: "100%",
        boxSizing: "border-box",
        fontSize: "13px",
        padding: SIZE_PADDING[size],
        border: "var(--line-width) solid var(--input-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--input-bg)",
        color: "var(--text-primary)",
    };
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    /** Alan boyutu (padding ekseni). Default `md`. */
    inputSize?: FieldSize;
}

/**
 * Metin tipi form alanı (text/number/date/email/search…).
 *
 * `checkbox` / `radio` için KULLANMA — taban stil `width: 100%` ve metin alanı
 * padding'i uygular; kutucuklar kendi inline stiliyle kalır.
 *
 * `style` en sona merge edilir → çağıran her zaman override edebilir.
 */
export default function Input({ inputSize = "md", style, ...rest }: InputProps) {
    return <input {...rest} style={{ ...fieldStyle(inputSize), ...style }} />;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    /** Alan boyutu (padding ekseni). Default `md`. */
    inputSize?: FieldSize;
}

/** Çok satırlı metin alanı — Input ile aynı taban stil. */
export function Textarea({ inputSize = "md", style, ...rest }: TextareaProps) {
    return <textarea {...rest} style={{ ...fieldStyle(inputSize), ...style }} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    /** Alan boyutu (padding ekseni). Default `md`. */
    inputSize?: FieldSize;
}

/** Açılır liste — Input ile aynı taban stil (repodaki mevcut kullanım da öyleydi). */
export function Select({ inputSize = "md", style, ...rest }: SelectProps) {
    return <select {...rest} style={{ ...fieldStyle(inputSize), ...style }} />;
}
