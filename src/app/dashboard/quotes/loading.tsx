// Teklifler — RSC veri çekilirken iskelet (orders/loading emsali).
const bar = (w: string, h = "12px"): React.CSSProperties => ({
    width: w, height: h, borderRadius: "4px", background: "var(--bg-tertiary)", opacity: 0.6,
});

export default function QuotesLoading() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} aria-busy="true" aria-label="Teklifler yükleniyor">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={bar("120px", "18px")} />
                    <div style={bar("180px")} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <div style={bar("90px", "32px")} />
                    <div style={bar("110px", "32px")} />
                </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: "16px" }}>
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} style={bar("60px")} />)}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <div style={bar("200px", "30px")} />
                    <div style={bar("110px", "30px")} />
                </div>
            </div>
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--border-tertiary)", background: "var(--bg-secondary)" }}>
                    <div style={bar("40%")} />
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "13px 14px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
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
