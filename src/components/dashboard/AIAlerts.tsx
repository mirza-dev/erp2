"use client";

import { memo } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-context";

const severityOrder = { critical: 0, warning: 1, info: 2 } as const;

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

function severityBorderColor(severity: "critical" | "warning" | "info"): string {
  if (severity === "critical") return "var(--danger)";
  if (severity === "warning") return "var(--warning)";
  return "var(--accent)";
}

function severityDotColor(severity: "critical" | "warning" | "info"): string {
  if (severity === "critical") return "var(--danger)";
  if (severity === "warning") return "var(--warning)";
  return "var(--accent)";
}

const AIAlerts = memo(function AIAlerts() {
  const { openAlerts, loading } = useData();

  if (loading) {
    return (
      <div
        style={{
          background: "var(--bg-primary)",
          border: "0.5px solid var(--accent-border)",
          borderRadius: "6px",
          padding: "16px",
        }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            style={{
              borderLeft: "3px solid var(--bg-tertiary)",
              paddingLeft: "10px",
              paddingTop: "8px",
              paddingBottom: "8px",
              marginBottom: i < 2 ? "8px" : 0,
              borderBottom: i < 2 ? "0.5px solid var(--border-tertiary)" : "none",
            }}
          >
            <div style={{ height: "13px", width: "70%", background: "var(--bg-tertiary)", borderRadius: "4px", marginBottom: "6px", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ height: "11px", width: "40%", background: "var(--bg-tertiary)", borderRadius: "4px", marginLeft: "12px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.15s" }} />
          </div>
        ))}
      </div>
    );
  }

  const top4 = [...openAlerts]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 4);

  return (
    <div
      style={{
        background: "var(--bg-primary)",
        border: "0.5px solid var(--accent-border)",
        borderRadius: "6px",
        padding: "16px",
      }}
    >
      {/* Başlık + "N açık" rozeti CollapsibleSection (dashboard) başlık çubuğunda — burada tekrarlanmaz */}

      {/* Empty state */}
      {openAlerts.length === 0 && (
        <div style={{ fontSize: "13px", color: "var(--success-text)", padding: "8px 0" }}>
          ✓ Aktif uyarı yok.
        </div>
      )}

      {/* Alert items */}
      {top4.map((alert, i) => (
        <div
          key={alert.id}
          style={{
            borderLeft: `3px solid ${severityBorderColor(alert.severity)}`,
            paddingLeft: "10px",
            paddingTop: "8px",
            paddingBottom: "8px",
            marginBottom: i < top4.length - 1 ? "8px" : 0,
            borderBottom: i < top4.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
            <span style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: severityDotColor(alert.severity),
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-primary)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {alert.title}
            </span>
          </div>
          {alert.description && (
            <div style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              marginLeft: "12px",
              marginBottom: "2px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {alert.description}
            </div>
          )}
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginLeft: "12px" }}>
            {relativeTime(alert.created_at)}
          </div>
        </div>
      ))}

      {/* Footer link */}
      {openAlerts.length > 0 && (
        <Link
          href="/dashboard/alerts"
          style={{
            display: "block",
            marginTop: "12px",
            fontSize: "12px",
            color: "var(--accent-text)",
            textDecoration: "none",
            textAlign: "center",
            padding: "6px",
            borderTop: "0.5px solid var(--border-tertiary)",
          }}
        >
          Tümünü Gör → ({openAlerts.length} açık uyarı)
        </Link>
      )}
    </div>
  );
});

export default AIAlerts;
