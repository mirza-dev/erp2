"use client";

import Link from "next/link";
import { memo } from "react";
import useSWR from "swr";
import { Wrench } from "lucide-react";
import { usePermissions } from "@/lib/auth/use-permissions";

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("maintenance count failed");
    return res.json() as Promise<{ count: number }>;
};

const MaintenanceIncidentIndicator = memo(function MaintenanceIncidentIndicator() {
    const { internalOperator } = usePermissions();
    const { data } = useSWR(
        internalOperator ? "/api/maintenance/incidents/count" : null,
        fetcher,
        { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
    );
    const count = data?.count ?? 0;
    if (!internalOperator || count < 1) return null;

    return (
        <Link
            href="/dashboard/settings/email-deliveries"
            aria-label={`${count} açık bakım kaydı`}
            title={`${count} açık bakım kaydı`}
            style={{
                height: "30px",
                minWidth: "30px",
                padding: "0 8px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                borderRadius: "7px",
                border: "var(--line-width) solid var(--warning-border)",
                background: "var(--warning-bg)",
                color: "var(--warning-text)",
                textDecoration: "none",
                fontSize: "11px",
                fontWeight: 650,
            }}
        >
            <Wrench size={14} aria-hidden="true" />
            {count}
        </Link>
    );
});

export default MaintenanceIncidentIndicator;
