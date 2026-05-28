/**
 * Voice V3 — pure helpers for note merging.
 *
 * Bu dosya SERVER bağımlılığı içermez (Anthropic SDK, OPENAI env vs. yok).
 * Production page (client) bu dosyadan value import edebilir.
 * voice-service.ts'ten ayrı tutuldu çünkü oradaki Anthropic SDK + env init
 * client bundle'a sızmamalı.
 */

/**
 * fireNotes ("fire: N adet" gibi) bilgisini mevcut not metnine doğal Türkçe
 * akışla ekler. DB'ye scrap_qty olarak yazılmaz; UI'da kullanıcı görsün diye
 * notlar alanında human-readable kalır.
 *
 * Kurallar:
 *   - note boş, fireNotes boş → ""
 *   - note dolu, fireNotes boş → note (değişmez)
 *   - note boş, fireNotes dolu → fireNotes
 *   - ikisi dolu → `${note} · ${fireNotes}` (orta nokta ayraç)
 *   - fireNotes hâlihazırda note içinde geçiyorsa duplicate etme (case-insensitive)
 */
export function mergeFireIntoNote(note: string, fireNotes: string): string {
    const n = (note || "").trim();
    const f = (fireNotes || "").trim();
    if (!f) return n;
    if (!n) return f;
    if (n.toLowerCase().includes(f.toLowerCase())) return n;
    return `${n} · ${f}`;
}
