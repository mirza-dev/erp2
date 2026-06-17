// Satın Alma Siparişleri — RSC veri çekilirken iskelet.
const bar = (w: string, h = "12px"): React.CSSProperties => ({
    width: w, height: h, borderRadius: "4px", background: "var(--bg-tertiary)", opacity: 0.6,
});

export default function PurchaseOrdersLoading() {
    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto" }} aria-busy="true" aria-label="Siparişler yükleniyor">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={bar("220px", "20px")} />
                    <div style={bar("90px")} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <div style={bar("90px", "32px")} />
                    <div style={bar("120px", "32px")} />
                </div>
            </div>
            <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                {Array.from({ length: 6 }).map((_, i) => <div key={i} style={bar("66px")} />)}
            </div>
            <div style={{ marginBottom: "16px" }}><div style={bar("320px", "30px")} /></div>
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--border-tertiary)", background: "var(--bg-secondary)" }}>
                    <div style={bar("40%")} />
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "13px 14px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                        <div style={bar("110px")} />
                        <div style={bar("150px")} />
                        <div style={bar("80px")} />
                        <div style={bar("90px")} />
                        <div style={bar("70px")} />
                    </div>
                ))}
            </div>
        </div>
    );
}
