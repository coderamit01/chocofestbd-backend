import { Prisma } from "../generated/prisma/client";
import { OrderStatus } from "../generated/prisma/enums";

export const STORE_OFFSET_MS = 6 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const NON_REVENUE_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.RETURNED];

export const startOfStoreDay = (date: Date) =>
    new Date(Math.floor((date.getTime() + STORE_OFFSET_MS) / DAY_MS) * DAY_MS - STORE_OFFSET_MS);

export const startOfStoreMonth = (date: Date) => {
    const local = new Date(date.getTime() + STORE_OFFSET_MS);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - STORE_OFFSET_MS);
};

export const previousStoreMonth = (monthStart: Date) => {
    const local = new Date(monthStart.getTime() + STORE_OFFSET_MS);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - STORE_OFFSET_MS);
};

export const monthToDateRanges = (now: Date) => {
    const start = startOfStoreMonth(now);
    const previousStart = previousStoreMonth(start);
    const previousEnd = new Date(Math.min(previousStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));

    return { current: { gte: start, lt: now }, previous: { gte: previousStart, lt: previousEnd } };
};

export const lastWeekRanges = (now: Date) => {
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);

    return { current: { gte: weekAgo, lt: now }, previous: { gte: twoWeeksAgo, lt: weekAgo }, weekAgo };
};

export const percentChange = (current: number, previous: number) =>
    previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

export const toNumber = (value: Prisma.Decimal | number | null | undefined) => (value ? Number(value) : 0);

export const storeDateKey = (date: Date) => new Date(date.getTime() + STORE_OFFSET_MS).toISOString().slice(0, 10);
