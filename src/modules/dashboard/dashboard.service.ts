import { prisma } from "../../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { OrderStatus, ProductStatus, ReviewStatus, UserRole } from "../../generated/prisma/enums";
import { orderService } from "../order/order.service";
import {
    DEFAULT_RANGE_DAYS,
    EXCLUDED_REVENUE_STATUSES,
    OVERVIEW_LIST_LIMIT,
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
    const seriesEnd = unit === "hour" ? `${range.to} 23:00:00` : range.to;
    const labelFormat = unit === "hour" ? 'YYYY-MM-DD"T"HH24:00' : "YYYY-MM-DD";

    const rows = await prisma.$queryRaw<SalesChartRow[]>`
        SELECT
            to_char(b.bucket, ${labelFormat}) AS "date",
            COUNT(o.id)::int AS "orders",
            (COUNT(o.id) FILTER (WHERE o.status NOT IN (${excluded})))::int AS "validOrders",
            COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN (${excluded})), 0)::float8 AS "revenue"
        FROM generate_series(
            date_trunc(${unit}, ${range.from}::timestamp),
            date_trunc(${unit}, ${seriesEnd}::timestamp),
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

const lowStockWhere: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: { not: ProductStatus.ARCHIVED },
    manageStock: true,
    stock: { lte: prisma.product.fields.lowStockThreshold },
};

const activeCouponWhere = (now: Date): Prisma.CouponWhereInput => ({
    isActive: true,
    deletedAt: null,
    AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
});

const getOverview = async (query: DateRangeQuery) => {
    const range = resolveRange(query);
    const createdAt = { gte: range.start, lt: range.end };
    const now = new Date();

    const [
        byStatus,
        byMethod,
        byDistrict,
        itemGroups,
        recentOrders,
        pendingPayments,
        lowStock,
        lowStockCount,
        reviews,
        reviewCount,
        coupons,
    ] = await Promise.all([
        prisma.order.groupBy({ by: ["status"], where: { createdAt }, _count: { _all: true } }),
        prisma.order.groupBy({ by: ["paymentMethod"], where: { createdAt }, _count: { _all: true } }),
        prisma.order.groupBy({
            by: ["district"],
            where: { createdAt },
            _count: { _all: true },
            orderBy: { _count: { district: "desc" } },
        }),
        prisma.orderItem.groupBy({
            by: ["productId"],
            where: { productId: { not: null }, order: { createdAt, status: { notIn: EXCLUDED_REVENUE_STATUSES } } },
            _sum: { lineTotal: true, quantity: true },
        }),
        prisma.order.findMany({
            select: {
                id: true,
                orderNumber: true,
                recipientName: true,
                recipientPhone: true,
                total: true,
                status: true,
                paymentMethod: true,
                paymentStatus: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 8,
        }),
        orderService.getPendingPayments(4),
        prisma.product.findMany({
            where: lowStockWhere,
            select: { id: true, name: true, stock: true, lowStockThreshold: true },
            orderBy: { stock: "asc" },
            take: 4,
        }),
        prisma.product.count({ where: lowStockWhere }),
        prisma.productReview.findMany({
            where: { status: ReviewStatus.PENDING },
            select: { id: true, rating: true, comment: true, user: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 3,
        }),
        prisma.productReview.count({ where: { status: ReviewStatus.PENDING } }),
        prisma.coupon.findMany({
            where: activeCouponWhere(now),
            select: {
                id: true,
                code: true,
                discountType: true,
                discountValue: true,
                usedCount: true,
                usageLimit: true,
            },
            orderBy: { usedCount: "desc" },
            take: 3,
        }),
    ]);

    const productIds = itemGroups.map((group) => group.productId).filter((id): id is string => !!id);
    const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, image: true, category: { select: { name: true } } },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    const sales = itemGroups
        .map((group) => ({
            product: group.productId ? productMap.get(group.productId) : undefined,
            units: group._sum.quantity ?? 0,
            revenue: toNumber(group._sum.lineTotal),
        }))
        .filter((row): row is typeof row & { product: NonNullable<typeof row.product> } => !!row.product);

    const categoryRevenue = new Map<string, number>();
    for (const row of sales) {
        const name = row.product.category.name;
        categoryRevenue.set(name, (categoryRevenue.get(name) ?? 0) + row.revenue);
    }

    const statusCounts = Object.fromEntries(Object.values(OrderStatus).map((status) => [status, 0])) as Record<
        OrderStatus,
        number
    >;
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    const totalOrders = byMethod.reduce((sum, row) => sum + row._count._all, 0);
    const topDistricts = byDistrict.slice(0, OVERVIEW_LIST_LIMIT);
    const otherDistricts = byDistrict.slice(OVERVIEW_LIST_LIMIT).reduce((sum, row) => sum + row._count._all, 0);

    return {
        range: { from: range.from, to: range.to },
        statusCounts,
        paymentMethods: byMethod
            .map((row) => ({
                method: row.paymentMethod,
                orders: row._count._all,
                share: totalOrders ? round((row._count._all / totalOrders) * 100, 1) : 0,
            }))
            .sort((a, b) => b.orders - a.orders),
        topCategories: [...categoryRevenue]
            .map(([name, revenue]) => ({ name, revenue: round(revenue) }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, OVERVIEW_LIST_LIMIT),
        districts: [
            ...topDistricts.map((row) => ({ district: row.district, orders: row._count._all })),
            ...(otherDistricts ? [{ district: "Others", orders: otherDistricts }] : []),
        ],
        topProducts: [...sales]
            .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
            .slice(0, OVERVIEW_LIST_LIMIT)
            .map((row) => ({
                id: row.product.id,
                name: row.product.name,
                image: row.product.image,
                units: row.units,
                revenue: round(row.revenue),
            })),
        recentOrders: recentOrders.map((order) => ({ ...order, total: toNumber(order.total) })),
        pendingPayments: { total: pendingPayments.total, items: pendingPayments.payments },
        lowStock: { total: lowStockCount, items: lowStock },
        pendingReviews: {
            total: reviewCount,
            items: reviews.map((review) => ({
                id: review.id,
                rating: review.rating,
                comment: review.comment,
                customerName: review.user.name,
            })),
        },
        activeCoupons: coupons.map((coupon) => ({ ...coupon, discountValue: toNumber(coupon.discountValue) })),
    };
};

export const dashboardService = {
    getSummary,
    getSalesChart,
    getOverview,
};
