import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { OrderStatus, PaymentMethod, PaymentStatus } from "../../generated/prisma/enums";
import type { MarkDeliveredPayload, MarkFailedPayload } from "./rider.validation";

const FAILED_NOTE_PREFIX = "Delivery failed: ";
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDhakaDay = (now: Date) =>
    new Date(Math.floor((now.getTime() + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS);

const stopSelect = {
    id: true,
    orderNumber: true,
    recipientName: true,
    recipientPhone: true,
    address: true,
    area: true,
    district: true,
    customerNote: true,
    total: true,
    paymentMethod: true,
    paymentStatus: true,
    status: true,
    createdAt: true,
} satisfies Prisma.OrderSelect;

type StopOrder = Prisma.OrderGetPayload<{ select: typeof stopSelect }>;

type StopOutcome = { result: "DELIVERED" | "FAILED"; reason: string | null; collected: string; at: Date };

const isCashDue = (order: Pick<StopOrder, "paymentMethod" | "paymentStatus">) =>
    order.paymentMethod === PaymentMethod.COD && order.paymentStatus === PaymentStatus.UNPAID;

const failedSinceWhere = (since: Date): Prisma.OrderStatusHistoryWhereInput => ({
    status: OrderStatus.SHIPPED,
    note: { startsWith: FAILED_NOTE_PREFIX },
    createdAt: { gte: since },
});

const toStop = (order: StopOrder, outcome: StopOutcome | null) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    address: [order.address, order.area, order.district].filter(Boolean).join(", "),
    note: order.customerNote,
    paymentMethod: order.paymentMethod,
    amountToCollect: outcome ? outcome.collected : isCashDue(order) ? order.total.toFixed(2) : "0.00",
    result: outcome?.result ?? null,
    failReason: outcome?.reason ?? null,
    completedAt: outcome?.at ?? null,
    createdAt: order.createdAt,
});

const findShippedOrder = async (orderId: string) => {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: stopSelect });

    if (!order) {
        throw new AppError("Order not found", 404);
    }

    if (order.status !== OrderStatus.SHIPPED) {
        throw new AppError(`This order is ${order.status.toLowerCase()}, not out for delivery`, 400);
    }

    return order;
};

const formatTaka = (amount: Prisma.Decimal) => `৳${Math.round(amount.toNumber()).toLocaleString("en-IN")}`;

export const riderService = {
    getMyDeliveries: async (riderId: string) => {
        const since = startOfDhakaDay(new Date());

        const [shipped, history] = await Promise.all([
            prisma.order.findMany({
                where: {
                    status: OrderStatus.SHIPPED,
                    statusHistory: { none: failedSinceWhere(since) },
                },
                select: stopSelect,
                orderBy: { createdAt: "asc" },
            }),
            prisma.orderStatusHistory.findMany({
                where: {
                    changedById: riderId,
                    createdAt: { gte: since },
                    OR: [{ status: OrderStatus.DELIVERED }, failedSinceWhere(since)],
                },
                select: { orderId: true, status: true, note: true, createdAt: true, order: { select: stopSelect } },
                orderBy: { createdAt: "asc" },
            }),
        ]);

        const done = new Map<string, { order: StopOrder; outcome: StopOutcome }>();

        history.forEach((entry) => {
            const delivered = entry.status === OrderStatus.DELIVERED;

            if (delivered && entry.order.status !== OrderStatus.DELIVERED) return;

            done.set(entry.orderId, {
                order: entry.order,
                outcome: {
                    result: delivered ? "DELIVERED" : "FAILED",
                    reason: delivered ? null : (entry.note ?? "").slice(FAILED_NOTE_PREFIX.length) || null,
                    collected:
                        (delivered && entry.order.paymentMethod === PaymentMethod.COD) || (!delivered && isCashDue(entry.order))
                            ? entry.order.total.toFixed(2)
                            : "0.00",
                    at: entry.createdAt,
                },
            });
        });

        const todo = shipped.filter((order) => !done.has(order.id)).map((order) => toStop(order, null));
        const completed = [...done.values()].map(({ order, outcome }) => toStop(order, outcome));

        return [...todo, ...completed].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },

    markDelivered: async (orderId: string, riderId: string, payload: MarkDeliveredPayload) => {
        const order = await findShippedOrder(orderId);
        const cashDue = isCashDue(order);

        if (cashDue && !payload.cashCollected) {
            throw new AppError("Confirm that you collected the cash before marking this order delivered", 400);
        }

        const data: Prisma.OrderUpdateManyMutationInput = { status: OrderStatus.DELIVERED, deliveredAt: new Date() };

        if (order.paymentMethod === PaymentMethod.COD) {
            data.paymentStatus = PaymentStatus.PAID;
        }

        await prisma.$transaction(async (tx) => {
            const updated = await tx.order.updateMany({
                where: { id: order.id, status: OrderStatus.SHIPPED },
                data,
            });

            if (updated.count === 0) {
                throw new AppError("This order was just updated by someone else. Please refresh", 409);
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: OrderStatus.DELIVERED,
                    note: cashDue ? `Order delivered · ${formatTaka(order.total)} cash collected by rider` : "Order delivered",
                    changedById: riderId,
                },
            });
        });
    },

    markFailed: async (orderId: string, riderId: string, payload: MarkFailedPayload) => {
        const order = await findShippedOrder(orderId);

        const alreadyReported = await prisma.orderStatusHistory.findFirst({
            where: { orderId: order.id, ...failedSinceWhere(startOfDhakaDay(new Date())) },
            select: { id: true },
        });

        if (alreadyReported) {
            throw new AppError("A failed delivery was already reported for this order today", 409);
        }

        await prisma.orderStatusHistory.create({
            data: {
                orderId: order.id,
                status: OrderStatus.SHIPPED,
                note: `${FAILED_NOTE_PREFIX}${payload.reason}`,
                changedById: riderId,
            },
        });
    },
};
