"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { isDemoMode } from "@/lib/demo-utils";
import { createClient } from "@/lib/supabase/client";

interface User {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
}

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "7px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--text-secondary)",
    marginBottom: "4px",
    display: "block",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
};

function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function UsersPage() {
    const { toast } = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [currentEmail, setCurrentEmail] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        // Mevcut kullanıcının emailini al (kendini silmeyi engellemek için)
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setCurrentEmail(data.user?.email ?? null);
        });
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/users");
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            } else {
                toast({ type: "error", message: "Kullanıcılar yüklenemedi." });
            }
        } catch {
            toast({ type: "error", message: "Kullanıcılar yüklenemedi." });
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isDemoMode()) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: newEmail, password: newPassword }),
            });
            const data = await res.json();
            if (res.ok) {
                toast({ type: "success", message: `Kullanıcı oluşturuldu: ${data.email}` });
                setNewEmail("");
                setNewPassword("");
                setShowForm(false);
                await fetchUsers();
            } else {
                toast({ type: "error", message: data.error || "Kullanıcı oluşturulamadı." });
            }
        } catch {
            toast({ type: "error", message: "Beklenmeyen bir hata oluştu." });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (user: User) => {
        if (isDemoMode()) return;
        if (user.email === currentEmail) {
            toast({ type: "error", message: "Kendi hesabınızı silemezsiniz." });
            return;
        }
        if (!confirm(`${user.email} adlı kullanıcıyı silmek istediğinize emin misiniz?`)) return;
        setDeletingId(user.id);
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
            if (res.ok) {
                toast({ type: "success", message: "Kullanıcı silindi." });
                await fetchUsers();
            } else {
                const data = await res.json();
                toast({ type: "error", message: data.error || "Kullanıcı silinemedi." });
            }
        } catch {
            toast({ type: "error", message: "Beklenmeyen bir hata oluştu." });
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <h1 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Kullanıcılar
                    </h1>
                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px", marginBottom: 0 }}>
                        Sisteme erişim yetkisi olan hesaplar
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(prev => !prev)}
                    style={{
                        padding: "7px 14px",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "#fff",
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: "7px",
                        cursor: "pointer",
                    }}
                >
                    {showForm ? "İptal" : "Kullanıcı Ekle"}
                </button>
            </div>

            {/* Add user form */}
            {showForm && (
                <form
                    onSubmit={handleCreate}
                    style={{
                        background: "var(--bg-primary)",
                        border: "0.5px solid var(--border-secondary)",
                        borderRadius: "10px",
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                    }}
                >
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                        Yeni Kullanıcı
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <label>
                            <span style={labelStyle}>E-posta</span>
                            <input
                                type="email"
                                required
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="kullanici@ornek.com"
                                style={inputStyle}
                            />
                        </label>
                        <label>
                            <span style={labelStyle}>Şifre (min. 8 karakter)</span>
                            <input
                                type="password"
                                required
                                minLength={8}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="••••••••"
                                style={inputStyle}
                            />
                        </label>
                    </div>
                    <div>
                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                padding: "7px 18px",
                                fontSize: "13px",
                                fontWeight: 500,
                                color: "#fff",
                                background: "var(--accent)",
                                border: "none",
                                borderRadius: "6px",
                                cursor: submitting ? "not-allowed" : "pointer",
                                opacity: submitting ? 0.6 : 1,
                            }}
                        >
                            {submitting ? "Oluşturuluyor..." : "Oluştur"}
                        </button>
                    </div>
                </form>
            )}

            {/* Users table */}
            <div
                style={{
                    background: "var(--bg-primary)",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "10px",
                    overflow: "hidden",
                }}
            >
                {loading ? (
                    <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
                        Yükleniyor...
                    </div>
                ) : users.length === 0 ? (
                    <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
                        Henüz kullanıcı yok.
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                {["E-posta", "Son Giriş", "Oluşturulma", ""].map((h) => (
                                    <th
                                        key={h}
                                        style={{
                                            padding: "9px 14px",
                                            fontSize: "11px",
                                            fontWeight: 500,
                                            color: "var(--text-tertiary)",
                                            borderBottom: "0.5px solid var(--border-tertiary)",
                                            textAlign: "left",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.04em",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => {
                                const isSelf = user.email === currentEmail;
                                return (
                                    <tr key={user.id}>
                                        <td
                                            style={{
                                                padding: "10px 14px",
                                                fontSize: "13px",
                                                color: "var(--text-primary)",
                                                borderBottom: "0.5px solid var(--border-tertiary)",
                                            }}
                                        >
                                            {user.email}
                                            {isSelf && (
                                                <span
                                                    style={{
                                                        marginLeft: "8px",
                                                        fontSize: "10px",
                                                        color: "var(--accent-text)",
                                                        background: "var(--accent-bg)",
                                                        padding: "1px 6px",
                                                        borderRadius: "4px",
                                                    }}
                                                >
                                                    siz
                                                </span>
                                            )}
                                        </td>
                                        <td
                                            style={{
                                                padding: "10px 14px",
                                                fontSize: "12px",
                                                color: "var(--text-secondary)",
                                                borderBottom: "0.5px solid var(--border-tertiary)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatDate(user.last_sign_in_at)}
                                        </td>
                                        <td
                                            style={{
                                                padding: "10px 14px",
                                                fontSize: "12px",
                                                color: "var(--text-secondary)",
                                                borderBottom: "0.5px solid var(--border-tertiary)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatDate(user.created_at)}
                                        </td>
                                        <td
                                            style={{
                                                padding: "10px 14px",
                                                borderBottom: "0.5px solid var(--border-tertiary)",
                                                textAlign: "right",
                                            }}
                                        >
                                            <button
                                                onClick={() => handleDelete(user)}
                                                disabled={isSelf || deletingId === user.id}
                                                style={{
                                                    padding: "4px 10px",
                                                    fontSize: "12px",
                                                    color: isSelf ? "var(--text-tertiary)" : "var(--danger-text)",
                                                    background: "transparent",
                                                    border: `0.5px solid ${isSelf ? "var(--border-tertiary)" : "var(--danger-border)"}`,
                                                    borderRadius: "5px",
                                                    cursor: isSelf ? "not-allowed" : "pointer",
                                                    opacity: deletingId === user.id ? 0.5 : 1,
                                                }}
                                            >
                                                {deletingId === user.id ? "Siliniyor..." : "Sil"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
