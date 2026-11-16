import { NotificationSeverity, UserRole } from "../../generated/prisma/enums";

const ADMINS = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
const ORDER_TEAM = [...ADMINS, UserRole.MANAGER, UserRole.ORDER_HANDLER];
const CATALOG_TEAM = [...ADMINS, UserRole.MANAGER];

export const NOTIFICATION_TYPES = {
    "order.created": { label: "New order", roles: ORDER_TEAM, severity: NotificationSeverity.INFO },
    "order.paymentPending": { label: "Payment needs verification", roles: ORDER_TEAM, severity: NotificationSeverity.WARNING },
    "order.cancelledByCustomer": { label: "Order cancelled by customer", roles: ORDER_TEAM, severity: NotificationSeverity.WARNING },
    "stock.low": { label: "Low stock", roles: CATALOG_TEAM, severity: NotificationSeverity.WARNING },
    "stock.out": { label: "Out of stock", roles: CATALOG_TEAM, severity: NotificationSeverity.CRITICAL },
    "review.pending": { label: "Review waiting for approval", roles: ADMINS, severity: NotificationSeverity.INFO },
    "system.error": { label: "Server error", roles: ADMINS, severity: NotificationSeverity.CRITICAL },
} as const satisfies Record<string, { label: string; roles: UserRole[]; severity: NotificationSeverity }>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

export const STAFF_ROLES = Object.values(UserRole).filter((role) => role !== UserRole.CUSTOMER);
