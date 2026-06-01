"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getUserInitials } from "@/lib/user-display";

interface UserProfileSummary {
    fullName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
}

export default function UserAvatarLink() {
    const [profile, setProfile] = useState<UserProfileSummary | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/settings/user/profile");
                if (!res.ok) return;
                const data = await res.json() as UserProfileSummary;
                if (!cancelled) setProfile(data);
            } catch {
                // Topbar profil fetch'i başarısızsa avatar fallback ile kalır.
            }
        })();
        return () => { cancelled = true; };
    }, []);

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
                background: "linear-gradient(145deg, var(--accent-bg), var(--bg-tertiary))",
                border: "0.5px solid var(--accent-border)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.02)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--accent-text)",
                textDecoration: "none",
                letterSpacing: 0,
                flexShrink: 0,
            }}
        >
            {initials}
        </Link>
    );
}
