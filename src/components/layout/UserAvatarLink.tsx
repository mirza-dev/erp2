"use client";

import Link from "next/link";
import { getUserInitials } from "@/lib/user-display";
import { useUserProfile } from "@/lib/shared-hooks";

export default function UserAvatarLink() {
    // Perf Faz 4: paylaşılan SWR hook'u — dashboard/settings ile aynı key.
    // Fetch hatasında profile undefined kalır → avatar fallback (eski davranış).
    const { profile } = useUserProfile();

    const initials = getUserInitials(profile?.fullName, profile?.email);
    const label = profile?.fullName || profile?.email || "Profil ve ayarlar";

    return (
        <Link
            href="/dashboard/settings?tab=kullanici"
            aria-label="Profil ve ayarlar"
            title={label}
            style={{
                width: "30px",
                height: "30px",
                borderRadius: "50%",
                background: "linear-gradient(145deg, var(--accent-bg-strong), var(--bg-tertiary))",
                border: "0.5px solid var(--accent-border)",
                boxShadow: "inset 0 1px 0 var(--highlight-inset)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--accent-text)",
                textDecoration: "none",
                letterSpacing: 0,
                flexShrink: 0,
                transition: "border-color 0.14s ease, background 0.14s ease, color 0.14s ease",
            }}
        >
            {initials}
        </Link>
    );
}
