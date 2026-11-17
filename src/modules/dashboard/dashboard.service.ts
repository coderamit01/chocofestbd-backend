import { prisma } from "../../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { OrderStatus, UserRole } from "../../generated/prisma/enums";
import {
    DEFAULT_RANGE_DAYS,
    EXCLUDED_REVENUE_STATUSES,
    STORE_TIMEZONE,
    STORE_UTC_OFFSET_MS,
} from "./dashboard.constant";
import type { DateRangeQuery, SalesChartQuery } from "./dashboard.validation";

const DAY_MS = 24 * 60 * 60 * 1000;

type ResolvedRange = {
    from: string; // YYYY-MM-DD (store local)
    to: string; // YYYY-MM-DD (store local, inclusive)
    start: Date; // UTC instant, inclusive
    end: Date; // UTC instant, exclusive
};

const todayLocal = () => new Date(Date.now() + STORE_UTC_OFFSET_MS).toISOString().slice(0, 10);

const addDays = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// Local midnight in Dhaka → UTC instant
const localDateToUtc = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - STORE_UTC_OFFSET_MS);

const resolveRange = (query: DateRangeQuery): ResolvedRange => {
    const to = query.to ?? todayLocal();
    const from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));

    return { from, to, start: localDateToUtc(from), end: localDateToUtc(addDays(to, 1)) };
};

// Same length, right before the current range
const previousRange = (range: ResolvedRange): ResolvedRange => {
    const days = Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS);
    const to = addDays(range.from, -1);
    const from = addDays(to, -(days - 1));

    return { from, to, start: localDateToUtc(from), end: localDateToUtc(addDays(to, 1)) };
};

const toNumber = (value: Prisma.Decimal | number | null | undefined) => (value ? Number(value) : 0);

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

const percentChange = (current: number, previous: number) =>
    previous === 0 ? null : round(((current - previous) / previous) * 100, 1);

const getPeriodStats = async (range: ResolvedRange) => {
    const createdAt = { gte: range.start, lt: range.end };

    const [byStatus, newCustomers] = await Promise.all([
        prisma.order.groupBy({
            by: ["status"],
            where: { createdAt },
            _count: { _all: true },
            _sum: { total: true, discountAmount: true },
        }),
        prisma.user.count({ where: { role: UserRole.CUSTOMER, createdAt } }),
    ]);

    let orders = 0;
    let validOrders = 0;
    let revenue = 0;
    let deliveredRevenue = 0;
    let discountGiven = 0;
    let cancelledOrReturned = 0;

    for (const row of byStatus) {
        const count = row._count._all;
        const total = toNumber(row._sum.total);
        orders += count;

        if (EXCLUDED_REVENUE_STATUSES.includes(row.status)) {
            cancelledOrReturned += count;
            continue;
        }

        validOrders += count;
        revenue += total;
        discountGiven += toNumber(row._sum.discountAmount);
        if (row.status === OrderStatus.DELIVERED) deliveredRevenue += total;
    }

    return {
        revenue: round(revenue),
        deliveredRevenue: round(deliveredRevenue),
        orders,
        averageOrderValue: validOrders ? round(revenue / validOrders) : 0,
        newCustomers,
        discountGiven: round(discountGiven),
        cancelRate: orders ? round((cancelledOrReturned / orders) * 100, 1) : 0,
    };
};

const getSummary = async (query: DateRangeQuery) => {
    const range = resolveRange(query);
    const prevRange = previousRange(range);

    const [current, previous, pendingOrders] = await Promise.all([
        getPeriodStats(range),
        getPeriodStats(prevRange),
        prisma.order.count({ where: { status: OrderStatus.PENDING } }),
    ]);

    const metrics = Object.fromEntries(
        (Object.keys(current) as (keyof typeof current)[]).map((key) => [
            key,
            { value: current[key], previous: previous[key], change: percentChange(current[key], previous[key]) },
        ]),
    ) as Record<keyof typeof current, { value: number; previous: number; change: number | null }>;

    return {
        range: { from: range.from, to: range.to },
        previousRange: { from: prevRange.from, to: prevRange.to },
        ...metrics,
        pendingOrders,
    };
};

type SalesChartRow = { date: string; orders: number; validOrders: number; revenue: number };

const getSalesChart = async (query: SalesChartQuery) => {
    const range = resolveRange(query);
    const unit = query.groupBy;
    const step = `1 ${unit}`;
    const excluded = Prisma.join(EXCLUDED_REVENUE_STATUSES.map((status) => Prisma.sql`${status}::"OrderStatus"`));

    // Timestamps are passed as plain UTC strings to avoid driver timezone conversion
    const startUtc = range.start.toISOString().replace("T", " ").replace("Z", "");
    const endUtc = range.end.toISOString().replace("T", " ").replace("Z", "");

    const rows = await prisma.$queryRaw<SalesChartRow[]>`
        SELECT
            to_char(b.bucket, 'YYYY-MM-DD') AS "date",
            COUNT(o.id)::int AS "orders",
            (COUNT(o.id) FILTER (WHERE o.status NOT IN (${excluded})))::int AS "validOrders",
            COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN (${excluded})), 0)::float8 AS "revenue"
        FROM generate_series(
            date_trunc(${unit}, ${range.from}::timestamp),
            date_trunc(${unit}, ${range.to}::timestamp),
            ${step}::interval
        ) AS b(bucket)
        LEFT JOIN orders o
            ON o."createdAt" >= ${startUtc}::timestamp
            AND o."createdAt" < ${endUtc}::timestamp
            AND date_trunc(${unit}, (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${STORE_TIMEZONE}) = b.bucket
        GROUP BY b.bucket
        ORDER BY b.bucket
    `;

    return {
        range: { from: range.from, to: range.to },
        groupBy: unit,
        points: rows.map((row) => ({
            date: row.date,
            orders: row.orders,
            revenue: round(row.revenue),
            averageOrderValue: row.validOrders ? round(row.revenue / row.validOrders) : 0,
        })),
    };
};

export const dashboardService = {
    getSummary,
    getSalesChart,
};
