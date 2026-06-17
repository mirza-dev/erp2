// Cariler — RSC veri çekilirken iskelet.
const bar = (w: string, h = "12px"): React.CSSProperties => ({
    width: w, height: h, borderRadius: "4px", background: "var(--bg-tertiary)", opacity: 0.6,
});

export default function CustomersLoading() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} aria-busy="true" aria-label="Cariler yükleniyor">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={bar("90px", "18px")} />
                    <div style={bar("160px")} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <div style={bar("220px", "30px")} />
                    <div style={bar("120px", "30px")} />
                </div>
            </div>
            <div style={{ display: "flex", gap: "16px" }}>
                {Array.from({ length: 3 }).map((_, i) => <div key={i} style={bar("60px")} />)}
            </div>
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--border-tertiary)", background: "var(--bg-secondary)" }}>
                    <div style={bar("40%")} />
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "13px 14px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                        <div style={bar("160px")} />
                        <div style={bar("60px")} />
                        <div style={bar("160px")} />
                        <div style={bar("90px")} />
                    </div>
                ))}
            </div>
        </div>
    );
}
