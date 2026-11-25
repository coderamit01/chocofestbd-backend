import { OrderStatus, UserRole } from "../../generated/prisma/enums";

export const DASHBOARD_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];

// Orders in these statuses don't count as revenue
export const EXCLUDED_REVENUE_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.RETURNED];

// Bangladesh is UTC+6 with no DST
export const STORE_TIMEZONE = "Asia/Dhaka";
export const STORE_UTC_OFFSET_MS = 6 * 60 * 60 * 1000;

export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 731;

export const GROUP_BY_VALUES = ["hour", "day", "week", "month"] as const;
export const MAX_HOURLY_RANGE_DAYS = 31;
export const OVERVIEW_LIST_LIMIT = 5;
export type GroupBy = (typeof GROUP_BY_VALUES)[number];
