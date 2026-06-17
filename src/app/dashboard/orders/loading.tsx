// Satış Siparişleri — RSC veri çekilirken (ilk yük / segment geçişi) iskelet.
// Inline-style + CSS-var konvansiyonu; animasyon yok (proje kuralı: yalnız
// hover/progress'te transition — burada statik düşük-opaklık placeholder).

const bar = (w: string, h = "12px"): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: "4px",
    background: "var(--bg-tertiary)",
    opacity: 0.6,
});

export default function OrdersLoading() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} aria-busy="true" aria-label="Siparişler yükleniyor">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={bar("180px", "20px")} />
                    <div style={bar("220px")} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <div style={bar("90px", "32px")} />
                    <div style={bar("120px", "32px")} />
                </div>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: "16px" }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={bar("64px")} />
                    ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <div style={bar("200px", "30px")} />
                    <div style={bar("110px", "30px")} />
                </div>
            </div>

            {/* Table */}
            <div
                style={{
                    background: "var(--surface-raised)",
                    border: "var(--line-width) solid var(--surface-border)",
                    borderRadius: "6px",
                    boxShadow: "var(--surface-shadow-sm)",
                    overflow: "hidden",
                }}
            >
                <div style={{ padding: "12px 14px", borderBottom: "var(--line-width) solid var(--surface-border)", background: "var(--table-header-bg)" }}>
                    <div style={bar("40%")} />
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                    <div
                        key={i}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "16px",
                            padding: "13px 14px",
                            borderBottom: "var(--line-width) solid var(--border-tertiary)",
                        }}
                    >
                        <div style={bar("120px")} />
                        <div style={bar("160px")} />
                        <div style={bar("80px")} />
                        <div style={bar("70px")} />
                        <div style={bar("90px")} />
                    </div>
                ))}
            </div>
        </div>
    );
}
