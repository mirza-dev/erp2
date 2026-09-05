"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { createClient } from "@/lib/supabase/client";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import Button from "@/components/ui/Button";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { fieldStyle, labelStyle as sharedLabelStyle } from "@/components/ui/Input";
import { MIN_PASSWORD_LENGTH, checkPasswordPolicy } from "@/lib/auth/password-policy";
import Modal from "@/components/ui/Modal";
import SectionHeader from "@/components/ui/SectionHeader";

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

// Ortak form alanı stili — token tek kaynaktan (`--input-bg`/`--input-border`/
// `--line-width`). Eskiden burada 0.5px + `--border-secondary` + `--bg-tertiary`
// vardı; koyu temada fark görünmüyordu ama AYDINLIK temada her form ekranı
// farklı duruyordu (2026-08-24 tespiti).
const inputStyle: React.CSSProperties = fieldStyle("lg");

const labelStyle: React.CSSProperties = { ...sharedLabelStyle(), display: "block", marginBottom: "4px" };

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
    // Şifre sıfırlama (madde #4): self-servis akış e-postaya bağlı, bu değil.
    const [resetUser, setResetUser] = useState<User | null>(null);
    const [resetPassword, setResetPassword] = useState("");
    const [resetError, setResetError] = useState<string | null>(null);
    const [resetting, setResetting] = useState(false);

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

    const openReset = (user: User) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setResetUser(user);
        setResetPassword("");
        setResetError(null);
    };

    const handleResetPassword = async () => {
        if (!resetUser) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        // Sunucu otoriter; bu yalnız UX aynası (aynı fonksiyon, kopya eşik yok).
        const policyError = checkPasswordPolicy(resetPassword, { email: resetUser.email });
        if (policyError) { setResetError(policyError); return; }

        setResetting(true);
        setResetError(null);
        try {
            const res = await fetch(`/api/admin/users/${resetUser.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: resetPassword }),
            });
            if (res.ok) {
                toast({ type: "success", message: `${resetUser.email} için şifre güncellendi.` });
                setResetUser(null);
                setResetPassword("");
            } else {
                const data = await res.json().catch(() => null);
                setResetError(data?.error || "Şifre güncellenemedi.");
            }
        } catch {
            setResetError("Beklenmeyen bir hata oluştu.");
        } finally {
            setResetting(false);
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

    const userColumns: DataTableColumn<User>[] = [
        {
            key: "email",
            header: "E-posta",
            cell: user => (
                <>
                    {user.email}
                    {user.email === currentEmail && (
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
                </>
            ),
        },
        {
            key: "roles",
            header: "Roller",
            cellStyle: { minWidth: "220px", color: "var(--text-secondary)" },
            cell: user => editingRolesId === user.id ? (
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
            ),
        },
        {
            key: "lastSignIn",
            header: "Son Giriş",
            cellStyle: { fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" },
            cell: user => formatDate(user.last_sign_in_at),
        },
        {
            key: "createdAt",
            header: "Oluşturulma",
            cellStyle: { fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" },
            cell: user => formatDate(user.created_at),
        },
        {
            key: "action",
            header: "",
            align: "right",
            cell: user => {
                const isSelf = user.email === currentEmail;
                return (
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <Button
                            variant="secondary"
                            size="xs"
                            leftIcon={<KeyRound size={13} />}
                            onClick={() => openReset(user)}
                            disabled={isDemo}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Kullanıcı için yeni şifre belirle"}
                        >
                            Şifre sıfırla
                        </Button>
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
                    </div>
                );
            },
        },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <PageHeader
                title="Kullanıcılar"
                subtitle="Sisteme erişim yetkisi olan hesaplar"
                actions={<Button
                    size="cta"
                    leftIcon={!showForm ? <Plus size={15} /> : undefined}
                    onClick={() => setShowForm(prev => !prev)}
                    disabled={isDemo}
                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                >
                    {showForm ? "İptal" : "Kullanıcı Ekle"}
                </Button>}
            />

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
                            <span style={labelStyle}>Şifre (min. {MIN_PASSWORD_LENGTH} karakter)</span>
                            <input
                                type="password"
                                required
                                minLength={MIN_PASSWORD_LENGTH}
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
                    <DataTable
                        columns={userColumns}
                        rows={users}
                        rowKey={user => user.id}
                    />
                )}
            </div>

            {/* Şifre sıfırlama — madde #4'ün e-postadan BAĞIMSIZ kolu.
                Self-servis akış (login → /sifre-yenile) e-posta teslimine bağlı;
                bu yol hiçbir dış servise bağlı değil. */}
            {resetUser && (
                <Modal
                    onClose={() => setResetUser(null)}
                    labelledBy="sifre-sifirla-baslik"
                    dismissible={!resetting}
                >
                    <SectionHeader variant="dialog" id="sifre-sifirla-baslik">
                        Şifre sıfırla
                    </SectionHeader>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0 }}>
                        <strong style={{ color: "var(--text-primary)" }}>{resetUser.email}</strong> için yeni bir
                        şifre belirleyin. Kullanıcıya bu şifreyi güvenli bir yoldan iletin; ilk girişinden
                        sonra Ayarlar &rarr; Kullanıcı Profili&apos;nden kendisi değiştirebilir.
                    </p>

                    {resetError && (
                        <div role="alert" style={{ fontSize: "12.5px", lineHeight: 1.5, color: "var(--danger)" }}>
                            {resetError}
                        </div>
                    )}

                    <label htmlFor="sifirla-yeni-sifre" style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>
                        Yeni şifre (min. {MIN_PASSWORD_LENGTH} karakter)
                    </label>
                    <input
                        id="sifirla-yeni-sifre"
                        type="password"
                        autoComplete="new-password"
                        value={resetPassword}
                        onChange={(e) => { setResetPassword(e.target.value); setResetError(null); }}
                        style={fieldStyle("lg")}
                    />

                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <Button variant="secondary" onClick={() => setResetUser(null)} disabled={resetting}>
                            Vazgeç
                        </Button>
                        <Button variant="primary" onClick={handleResetPassword} disabled={resetting || !resetPassword}>
                            {resetting ? "Kaydediliyor..." : "Şifreyi güncelle"}
                        </Button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
