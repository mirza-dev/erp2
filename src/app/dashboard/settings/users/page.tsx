"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { createClient } from "@/lib/supabase/client";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import Button from "@/components/ui/Button";
import { Pencil, Plus, Trash2 } from "lucide-react";

interface User {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    roles: Role[];
}

// Atanabilir roller (viewer dahil; normalize backend'de viewer-dedup yapar)
const ASSIGNABLE_ROLES = ROLES;

function RoleCheckboxes({
    selected,
    onToggle,
    disabled,
}: {
    selected: Role[];
    onToggle: (role: Role) => void;
    disabled?: boolean;
}) {
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {ASSIGNABLE_ROLES.map((r) => {
                const checked = selected.includes(r);
                return (
                    <label
                        key={r}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            cursor: disabled ? "not-allowed" : "pointer",
                            padding: "3px 8px",
                            border: `0.5px solid ${checked ? "var(--accent-border)" : "var(--border-tertiary)"}`,
                            background: checked ? "var(--accent-bg)" : "transparent",
                            borderRadius: "6px",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => onToggle(r)}
                            aria-label={`${ROLE_LABELS[r]} rolü`}
                        />
                        {ROLE_LABELS[r]}
                    </label>
                );
            })}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "7px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
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
    const isDemo = useIsDemo();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRoles, setNewRoles] = useState<Role[]>(["viewer"]);
    const [submitting, setSubmitting] = useState(false);
    const [currentEmail, setCurrentEmail] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [editingRolesId, setEditingRolesId] = useState<string | null>(null);
    const [editRolesDraft, setEditRolesDraft] = useState<Role[]>([]);
    const [savingRoles, setSavingRoles] = useState(false);

    const toggleNewRole = (r: Role) =>
        setNewRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
    const toggleEditRole = (r: Role) =>
        setEditRolesDraft(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

    const startEditRoles = (user: User) => {
        setEditingRolesId(user.id);
        setEditRolesDraft(user.roles.length ? user.roles : ["viewer"]);
    };

    const handleSaveRoles = async (user: User) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setSavingRoles(true);
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roles: editRolesDraft }),
            });
            const data = await res.json();
            if (res.ok) {
                toast({ type: "success", message: "Roller güncellendi." });
                setEditingRolesId(null);
                await fetchUsers();
            } else {
                toast({ type: "error", message: data.error || "Roller güncellenemedi." });
            }
        } catch {
            toast({ type: "error", message: "Beklenmeyen bir hata oluştu." });
        } finally {
            setSavingRoles(false);
        }
    };

    const fetchUsers = useCallback(async () => {
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
    }, [toast]);

    useEffect(() => {
        // Mevcut kullanıcının emailini al (kendini silmeyi engellemek için)
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setCurrentEmail(data.user?.email ?? null);
        });
        fetchUsers();
    }, [fetchUsers]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setSubmitting(true);
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: newEmail, password: newPassword, roles: newRoles }),
            });
            const data = await res.json();
            if (res.ok) {
                toast({ type: "success", message: `Kullanıcı oluşturuldu: ${data.email}` });
                setNewEmail("");
                setNewPassword("");
                setNewRoles(["viewer"]);
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
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
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
                <Button
                    size="cta"
                    leftIcon={!showForm ? <Plus size={15} /> : undefined}
                    onClick={() => setShowForm(prev => !prev)}
                    disabled={isDemo}
                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                >
                    {showForm ? "İptal" : "Kullanıcı Ekle"}
                </Button>
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
                        <span style={labelStyle}>Roller</span>
                        <RoleCheckboxes selected={newRoles} onToggle={toggleNewRole} disabled={isDemo} />
                    </div>
                    <div>
                        <Button
                            type="submit"
                            disabled={submitting}
                            loading={submitting}
                        >
                            Oluştur
                        </Button>
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
                                {["E-posta", "Roller", "Son Giriş", "Oluşturulma", ""].map((h) => (
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
                                                minWidth: "220px",
                                            }}
                                        >
                                            {editingRolesId === user.id ? (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                                    <RoleCheckboxes selected={editRolesDraft} onToggle={toggleEditRole} disabled={isDemo} />
                                                    <div style={{ display: "flex", gap: "8px" }}>
                                                        <Button
                                                            size="xs"
                                                            onClick={() => handleSaveRoles(user)}
                                                            disabled={isDemo || savingRoles}
                                                        >
                                                            {savingRoles ? "Kaydediliyor..." : "Kaydet"}
                                                        </Button>
                                                        <Button
                                                            variant="secondary"
                                                            size="xs"
                                                            onClick={() => setEditingRolesId(null)}
                                                        >
                                                            İptal
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                                    {user.roles.map((r) => (
                                                        <span
                                                            key={r}
                                                            style={{
                                                                fontSize: "11px", color: "var(--text-secondary)",
                                                                background: "var(--bg-tertiary)", border: "0.5px solid var(--border-tertiary)",
                                                                padding: "1px 7px", borderRadius: "4px",
                                                            }}
                                                        >
                                                            {ROLE_LABELS[r] ?? r}
                                                        </span>
                                                    ))}
                                                    <Button
                                                        variant="secondary"
                                                        size="xs"
                                                        leftIcon={<Pencil size={13} />}
                                                        onClick={() => startEditRoles(user)}
                                                        disabled={isDemo}
                                                        title={isDemo ? DEMO_DISABLED_TOOLTIP : "Rolleri düzenle"}
                                                        aria-label={`${user.email} rollerini düzenle`}
                                                    >
                                                        Düzenle
                                                    </Button>
                                                </div>
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
                                            <Button
                                                variant="dangerSoft"
                                                size="xs"
                                                leftIcon={<Trash2 size={13} />}
                                                onClick={() => handleDelete(user)}
                                                disabled={isDemo || isSelf || deletingId === user.id}
                                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                            >
                                                {deletingId === user.id ? "Siliniyor..." : "Sil"}
                                            </Button>
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
