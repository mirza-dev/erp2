import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
    type Permission,
    type Role,
    parseRoles,
    permissionsForRoles,
} from "@/lib/auth/permissions";

export interface InternalAccessContext {
    authenticated: boolean;
    roles: Role[];
    permissions: Set<Permission>;
    internalOperator: boolean;
}

function emailsFromEnv(value: string | undefined): Set<string> {
    return new Set(
        (value ?? "")
            .split(",")
            .map(email => email.trim().toLowerCase())
            .filter(Boolean),
    );
}

export function parseInternalOperatorEmails(value = process.env.INTERNAL_OPERATOR_EMAILS): Set<string> {
    return emailsFromEnv(value);
}

export function hasInternalOperatorAccess(
    email: string | null | undefined,
    permissions: Set<Permission>,
    allowlist = process.env.INTERNAL_OPERATOR_EMAILS,
): boolean {
    if (!email || !permissions.has("view_settings")) return false;
    return parseInternalOperatorEmails(allowlist).has(email.trim().toLowerCase());
}

/**
 * Bakım alanlarının tek server-side erişim kaynağı.
 *
 * INTERNAL_OPERATOR_EMAILS boşsa fail-closed çalışır. Müşteriye atanabilen bir
 * rol kullanılmaz; allowlist ve view_settings birlikte zorunludur.
 */
export async function getInternalAccessContext(): Promise<InternalAccessContext> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const roles: Role[] = ["viewer"];
        return {
            authenticated: false,
            roles,
            permissions: permissionsForRoles(roles),
            internalOperator: false,
        };
    }

    const adminEmails = Array.from(emailsFromEnv(process.env.ADMIN_EMAILS));
    const roles = parseRoles(user.app_metadata, user.email, adminEmails);
    const permissions = permissionsForRoles(roles);

    return {
        authenticated: true,
        roles,
        permissions,
        internalOperator: hasInternalOperatorAccess(user.email, permissions),
    };
}

export async function requireInternalOperator(): Promise<NextResponse | null> {
    const access = await getInternalAccessContext();
    if (!access.authenticated) {
        return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
    }
    if (!access.internalOperator) {
        return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
    }
    return null;
}
