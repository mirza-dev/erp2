import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
    type Role,
    type Permission,
    parseRoles,
    permissionsForRoles,
    primaryRole,
    normalizeRole,
} from "@/lib/auth/permissions";

export type { Role, Permission };

function adminEmailsFromEnv(): string[] {
    return (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map(e => e.trim())
        .filter(Boolean);
}

/**
 * Kullanıcının kanonik rol dizisi (çoklu rol). Yetki kaynağı YALNIZ
 * `app_metadata` (server-only). user yoksa ["viewer"].
 */
export async function getCurrentUserRoles(_req?: NextRequest): Promise<Role[]> {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return ["viewer"];
    return parseRoles(user.app_metadata, user.email, adminEmailsFromEnv());
}

/** Kullanıcının effective permission seti (admin → hepsi; çoklu rol → union). */
export async function getCurrentUserPermissions(req?: NextRequest): Promise<Set<Permission>> {
    return permissionsForRoles(await getCurrentUserRoles(req));
}

/**
 * Geçerli kullanıcının id'si (audit actor için). Oturum yoksa null.
 * Yetki kararı vermez — yalnız "kim sildi" izini taşımak için.
 */
export async function getCurrentUserId(_req?: NextRequest): Promise<string | null> {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    return user?.id ?? null;
}

// ── Tek-getUser auth context (kalıcı performans turu Faz 1) ─────────────
//
// Sorun: guard (requirePermission → getUser) + aynı istekte created_by için
// ikinci bir supabase.auth.getUser() = istek başına 2-3 Supabase Auth
// round-trip'i. React.cache() route handler'larda memoize ETMEZ (React render
// scope'u yok) → açık context kalıbı: route başında TEK resolveAuthContext(),
// guard + actor bilgisi aynı sonuçtan okunur.

export interface AuthContext {
    user: User | null;
    userId: string | null;
    roles: Role[];
    perms: Set<Permission>;
}

/** TEK createClient + TEK getUser ile {user, roles, perms} çözer. */
export async function resolveAuthContext(): Promise<AuthContext> {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    const roles: Role[] = user
        ? parseRoles(user.app_metadata, user.email, adminEmailsFromEnv())
        : ["viewer"];
    return {
        user: user ?? null,
        userId: user?.id ?? null,
        roles,
        perms: permissionsForRoles(roles),
    };
}

/**
 * resolveAuthContext sonucu üzerinden permission guard — requirePermission ile
 * birebir aynı karar (EN AZ BİR permission) ve aynı 403 gövdesi; ek auth
 * çağrısı YAPMAZ.
 */
export function requirePermissionFor(
    ctx: AuthContext,
    allowed: Permission | Permission[],
): NextResponse | null {
    const need = Array.isArray(allowed) ? allowed : [allowed];
    if (need.some(p => ctx.perms.has(p))) return null;
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
}

/**
 * resolveAuthContext sonucu üzerinden rol guard'ı — requireRole ile birebir
 * aynı karar (çoklu-rol kesişimi + "purchaser" legacy normalize) ve aynı 403
 * gövdesi; ek auth çağrısı YAPMAZ.
 */
export function requireRoleFor(
    ctx: AuthContext,
    allowed: (Role | "purchaser")[],
): NextResponse | null {
    const allowedNorm = allowed
        .map(normalizeRole)
        .filter((r): r is Role => r !== null);
    if (ctx.roles.some(r => allowedNorm.includes(r))) return null;
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
}

/**
 * Backward-compat tekil rol. Mevcut testler bunu mock'luyor + requireRole
 * bunun üzerinden çalışıyor. Çoklu rolde "primary" döner (admin > op > viewer).
 */
export async function getCurrentUserRole(req?: NextRequest): Promise<Role> {
    return primaryRole(await getCurrentUserRoles(req));
}

/**
 * Permission bazlı guard (Faz 3+ tercih edilen yol). allowed permission'ların
 * EN AZ BİRİNE sahip değilse 403. Çoklu rol union'ı doğru şekilde değerlendirir.
 */
export async function requirePermission(
    req: NextRequest,
    allowed: Permission | Permission[],
): Promise<NextResponse | null> {
    const need = Array.isArray(allowed) ? allowed : [allowed];
    const perms = await getCurrentUserPermissions(req);
    if (need.some(p => perms.has(p))) return null;
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
}

/** Rol bazlı guard. Kullanıcının rollerinden biri allowed listesindeyse geçer. */
export async function requireAnyRole(req: NextRequest, allowed: Role[]): Promise<NextResponse | null> {
    const allowedNorm = allowed
        .map(normalizeRole)
        .filter((r): r is Role => r !== null);
    const roles = await getCurrentUserRoles(req);
    if (roles.some(r => allowedNorm.includes(r))) return null;
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
}

/**
 * Geriye-uyum köprüsü (Faz 3'te requirePermission'a göç edecek). 14 mevcut
 * callsite `requireRole(req, ["admin","purchaser"])` çağırıyor.
 *
 * ÇOKLU-ROL DOĞRU: kullanıcının TÜM rolleri (getCurrentUserRoles) ile allowed
 * listesi kesişimine bakar — `["sales","purchasing"]` kullanıcı sıradan
 * bağımsız olarak `["admin","purchasing"]` guard'ından geçer. (Eski tekil
 * primaryRole yaklaşımı sıra-bağımlı 403 üretiyordu.)
 *
 * Çift normalize: hem allowed hem kullanıcı rolleri "purchaser"→"purchasing".
 * Param tipi legacy `"purchaser"` literal'ini tolere eder (callsite'lar Faz 3'e
 * kadar dokunulmaz).
 */
export async function requireRole(req: NextRequest, allowed: (Role | "purchaser")[]): Promise<NextResponse | null> {
    const allowedNorm = allowed
        .map(normalizeRole)
        .filter((r): r is Role => r !== null);
    const roles = await getCurrentUserRoles(req);
    if (roles.some(r => allowedNorm.includes(r))) return null;
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
}
