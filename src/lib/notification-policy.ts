import type { NotificationTypeKey } from "@/lib/notification-types";
import type { Role } from "@/lib/auth/permissions";

export const NOTIFICATION_ROLE_MATRIX: Record<NotificationTypeKey, readonly Role[]> = {
    stock_critical: ["purchasing", "production", "admin"],
    order_pending: ["sales", "admin"],
    order_shipped: ["sales", "production", "admin"],
    sync_error: ["accounting", "admin"],
};

export function isEligibleForNotification(
    type: NotificationTypeKey,
    roles: readonly Role[],
    internalOperator = false,
): boolean {
    if (type === "sync_error" && internalOperator) return true;
    return roles.some(role => NOTIFICATION_ROLE_MATRIX[type].includes(role));
}

export function eligibleNotificationTypes(
    roles: readonly Role[],
    internalOperator = false,
): NotificationTypeKey[] {
    return (Object.keys(NOTIFICATION_ROLE_MATRIX) as NotificationTypeKey[])
        .filter(type => isEligibleForNotification(type, roles, internalOperator));
}
