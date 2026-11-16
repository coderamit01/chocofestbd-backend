import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { Prisma } from "../../generated/prisma/client";
import { OrderStatus, PaymentMethod, PaymentStatus, ProductStatus, UserRole } from "../../generated/prisma/enums";
import { getStockError, stockSelect } from "../../helpers/stock";
import { getPagination, paginationMeta } from "../../shared/pagination";
import { couponService } from "../coupon/coupon.service";
import { getSetting, settingService } from "../setting/setting.service";
import type {
    CancelMyOrderPayload,
    CheckoutItem,
    CheckoutPayload,
    CheckoutPreviewPayload,
    GetAllOrdersQuery,
    GetMyOrdersQuery,
    OrderSortOption,
    TrackOrderQuery,
    UpdateAdminNotePayload,
    UpdateOrderStatusPayload,
    UpdatePaymentStatusPayload,
} from "./order.validation";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type Tx = Prisma.TransactionClient;

const GUEST_EMAIL_DOMAIN = "guest.chocofestbd.com";

const orderSelect = {
    id: true,
    orderNumber: true,
    status: true,
    paymentMethod: true,
    paymentStatus: true,
    paymentSender: true,
    paymentTransactionId: true,
    recipientName: true,
    recipientPhone: true,
    recipientEmail: true,
    address: true,
    district: true,
    area: true,
    deliveryZoneName: true,
    customerNote: true,
    couponCode: true,
    subtotal: true,
    discountAmount: true,
    deliveryCharge: true,
    total: true,
    createdAt: true,
    items: {
        select: {
            id: true,
            productId: true,
            productName: true,
            productSku: true,
            productImage: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
            discountAmount: true,
        },
    },
} satisfies Prisma.OrderSelect;

type PricedLine = {
    productId: string;
    productName: string;
    productSku: string;
    productImage: string | null;
    manageStock: boolean;
    unitPrice: Decimal;
    quantity: number;
    lineTotal: Decimal;
};

type Zone = { id: string; name: string; charge: Decimal; estimatedDays: string | null };

const mergeItems = (items: CheckoutItem[]) => {
    const quantities = new Map<string, number>();

    for (const item of items) {
        quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

    return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
};

const resolveItems = async (userId: string | undefined, items: CheckoutItem[] | undefined) => {
    if (items?.length) {
        return { items: mergeItems(items), fromCart: false };
    }

    if (!userId) {
        throw new AppError("Add at least one item", 400);
    }

    const cartItems = await prisma.cartItem.findMany({
        where: { cart: { userId } },
        select: { productId: true, quantity: true },
    });

    if (!cartItems.length) {
        throw new AppError("Your cart is empty", 400);
    }

    return { items: cartItems, fromCart: true };
};

const priceItems = async (items: CheckoutItem[]): Promise<PricedLine[]> => {
    const products = await prisma.product.findMany({
        where: { id: { in: items.map((item) => item.productId) } },
        select: {
            id: true,
            name: true,
            sku: true,
            image: true,
            price: true,
            discountPrice: true,
            status: true,
            deletedAt: true,
            ...stockSelect,
        },
    });

    const byId = new Map(products.map((product) => [product.id, product]));

    return items.map((item) => {
        const product = byId.get(item.productId);

        if (!product || product.status !== ProductStatus.ACTIVE || product.deletedAt) {
            throw new AppError(`${product?.name ?? "A product in your order"} is no longer available`, 400);
        }

        const stockError = getStockError(product, item.quantity);

        if (stockError) {
            throw new AppError(`${product.name}: ${stockError}`, 400);
        }

        const onSale = product.discountPrice !== null && product.discountPrice.lt(product.price);
        const unitPrice = onSale ? product.discountPrice! : product.price;

        return {
            productId: product.id,
            productName: product.name,
            productSku: product.sku,
            productImage: product.image,
            manageStock: product.manageStock,
            unitPrice,
            quantity: item.quantity,
            lineTotal: unitPrice.mul(item.quantity),
        };
    });
};

const findActiveZone = async (deliveryZoneId: string): Promise<Zone> => {
    const zone = await prisma.deliveryZone.findFirst({
        where: { id: deliveryZoneId, isActive: true },
        select: { id: true, name: true, charge: true, estimatedDays: true },
    });

    if (!zone) {
        throw new AppError("Delivery zone not found", 404);
    }

    return zone;
};

const findSavedAddress = async (userId: string | undefined, addressId: string) => {
    if (!userId) {
        throw new AppError("Log in to use a saved address", 401);
    }

    const address = await prisma.address.findFirst({
        where: { id: addressId, userId },
        select: {
            recipientName: true,
            recipientPhone: true,
            address: true,
            district: true,
            area: true,
            deliveryZoneId: true,
        },
    });

    if (!address) {
        throw new AppError("Address not found", 404);
    }

    return address;
};

const calculateTotals = async (
    lines: PricedLine[],
    zone: Zone | null,
    couponCode: string | undefined,
    userId: string | undefined,
    phone: string | undefined,
) => {
    const subtotal = lines.reduce((sum, line) => sum.add(line.lineTotal), new Decimal(0));
    const itemDiscounts = new Map<string, Decimal>();
    let discountAmount = new Decimal(0);
    let deliveryCharge = zone ? zone.charge : null;
    let coupon: { id: string; code: string; discountType: string } | null = null;

    if (couponCode) {
        const result = await couponService.calculateDiscount(
            {
                code: couponCode,
                items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
                ...(phone && { phone }),
                ...(zone && { deliveryCharge: zone.charge.toFixed(2) }),
            },
            userId,
        );

        coupon = result.coupon;
        discountAmount = new Decimal(result.discountAmount);

        for (const item of result.items) {
            itemDiscounts.set(item.productId, new Decimal(item.discountAmount));
        }

        if (result.freeDelivery && deliveryCharge) {
            deliveryCharge = new Decimal(0);
        }
    }

    const total = subtotal.sub(discountAmount).add(deliveryCharge ?? 0);

    return { subtotal, discountAmount, deliveryCharge, total, coupon, itemDiscounts };
};

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

const bdDateCode = () => {
    const bd = new Date(Date.now() + BD_OFFSET_MS);

    return [bd.getUTCFullYear() % 100, bd.getUTCMonth() + 1, bd.getUTCDate()]
        .map((part) => String(part).padStart(2, "0"))
        .join("");
};

const buildInvoiceNumber = (invoicePrefix: string, orderNumber: string) =>
    `${invoicePrefix}-${orderNumber.slice(orderNumber.indexOf("-") + 1)}`;

const generateOrderNumber = async () => {
    const { orderPrefix } = await getSetting("numbering");
    const date = bdDateCode();

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const orderNumber = `${orderPrefix}-${date}-${randomInt(10000, 100000)}`;
        const used = await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } });

        if (!used) return orderNumber;
    }

    throw new AppError("Could not create an order number. Please try again", 500);
};

const findOrCreateGuestCustomer = async (tx: Tx, name: string, phone: string, email: string | undefined) => {
    const existing = await tx.user.findUnique({
        where: { phone },
        select: { id: true, isBanned: true, deletedAt: true },
    });

    if (existing) {
        if (existing.isBanned || existing.deletedAt) {
            throw new AppError("This phone number cannot place orders. Please contact us", 403);
        }

        return { userId: existing.id, isNew: false };
    }

    const emailTaken = email ? await tx.user.findUnique({ where: { email }, select: { id: true } }) : null;
    const user = await tx.user.create({
        data: {
            id: randomUUID(),
            name,
            phone,
            email: email && !emailTaken ? email : `${phone}@${GUEST_EMAIL_DOMAIN}`,
            role: UserRole.CUSTOMER,
        },
        select: { id: true },
    });

    return { userId: user.id, isNew: true };
};

const reduceStock = async (tx: Tx, lines: PricedLine[]) => {
    for (const line of lines) {
        if (!line.manageStock) {
            await tx.product.update({
                where: { id: line.productId },
                data: { soldCount: { increment: line.quantity } },
            });
            continue;
        }

        const result = await tx.product.updateMany({
            where: { id: line.productId, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity }, soldCount: { increment: line.quantity } },
        });

        if (result.count === 0) {
            throw new AppError(`${line.productName} just went out of stock. Please update your order`, 409);
        }
    }
};

const useCoupon = async (tx: Tx, couponId: string) => {
    const updated = await tx.$executeRaw`
        UPDATE "coupons"
        SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
        WHERE "id" = ${couponId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
    `;

    if (updated === 0) {
        throw new AppError("This coupon has reached its usage limit", 409);
    }
};

const orderListSelect = {
    id: true,
    orderNumber: true,
    status: true,
    paymentMethod: true,
    paymentStatus: true,
    total: true,
    createdAt: true,
    items: {
        select: { productName: true, productImage: true, quantity: true },
    },
} satisfies Prisma.OrderSelect;

const customerOrderSelect = {
    ...orderSelect,
    invoiceNumber: true,
    cancelReason: true,
    confirmedAt: true,
    deliveredAt: true,
    cancelledAt: true,
    updatedAt: true,
    statusHistory: {
        select: { status: true, note: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    },
} satisfies Prisma.OrderSelect;

const trackOrderSelect = {
    orderNumber: true,
    status: true,
    paymentMethod: true,
    paymentStatus: true,
    deliveryZoneName: true,
    total: true,
    createdAt: true,
    items: {
        select: { productName: true, productImage: true, quantity: true, lineTotal: true },
    },
    statusHistory: {
        select: { status: true, note: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    },
} satisfies Prisma.OrderSelect;

const adminOrderListSelect = {
    ...orderListSelect,
    recipientName: true,
    recipientPhone: true,
    district: true,
    area: true,
    couponCode: true,
    user: { select: { id: true, name: true } },
} satisfies Prisma.OrderSelect;

const adminOrderSelect = {
    ...customerOrderSelect,
    adminNote: true,
    couponId: true,
    paymentVerifiedAt: true,
    paymentVerifiedById: true,
    user: { select: { id: true, name: true, email: true, phone: true } },
    statusHistory: {
        select: {
            id: true,
            status: true,
            note: true,
            createdAt: true,
            changedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
    },
} satisfies Prisma.OrderSelect;

const orderSortOrders: Record<OrderSortOption, Prisma.OrderOrderByWithRelationInput> = {
    newest: { createdAt: "desc" },
    oldest: { createdAt: "asc" },
    highest: { total: "desc" },
    lowest: { total: "asc" },
};

const allowedNextStatuses: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    [OrderStatus.PROCESSING]: [OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    [OrderStatus.PACKED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
    [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
    [OrderStatus.RETURNED]: [],
    [OrderStatus.CANCELLED]: [],
};

const statusNotes: Partial<Record<OrderStatus, string>> = {
    [OrderStatus.CONFIRMED]: "Order confirmed",
    [OrderStatus.PROCESSING]: "Order is being processed",
    [OrderStatus.PACKED]: "Order packed",
    [OrderStatus.SHIPPED]: "Order shipped",
    [OrderStatus.DELIVERED]: "Order delivered",
    [OrderStatus.RETURNED]: "Order returned",
    [OrderStatus.CANCELLED]: "Order cancelled",
};

const paymentSettingKeys = {
    [PaymentMethod.COD]: "cod",
    [PaymentMethod.BKASH]: "bkash",
    [PaymentMethod.NAGAD]: "nagad",
    [PaymentMethod.ROCKET]: "rocket",
    [PaymentMethod.BANK_TRANSFER]: "bankTransfer",
} as const;

const paymentLabels: Record<PaymentMethod, string> = {
    [PaymentMethod.COD]: "Cash on delivery",
    [PaymentMethod.SSLCOMMERZ]: "SSLCommerz",
    [PaymentMethod.BKASH]: "bKash",
    [PaymentMethod.NAGAD]: "Nagad",
    [PaymentMethod.ROCKET]: "Rocket",
    [PaymentMethod.BANK_TRANSFER]: "Bank transfer",
};

const ensurePaymentMethodAvailable = async (method: keyof typeof paymentSettingKeys) => {
    const payment = await getSetting("payment");

    if (!payment[paymentSettingKeys[method]].enabled) {
        throw new AppError(`${paymentLabels[method]} is not available right now`, 400);
    }
};

const ensureTransactionUnused = async (method: PaymentMethod, transactionId: string | undefined) => {
    if (!transactionId) return;

    const existing = await prisma.order.findFirst({
        where: { paymentMethod: method, paymentTransactionId: transactionId },
        select: { id: true },
    });

    if (existing) {
        throw new AppError("This transaction id has already been used", 409);
    }
};

const isAdvancePayment = (method: PaymentMethod) => method !== PaymentMethod.COD;

const statusesNeedingPayment: OrderStatus[] = [
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.PACKED,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
];

const invoiceSelect = {
    id: true,
    orderNumber: true,
    invoiceNumber: true,
    status: true,
    createdAt: true,
    confirmedAt: true,
    deliveredAt: true,
    recipientName: true,
    recipientPhone: true,
    recipientEmail: true,
    address: true,
    area: true,
    district: true,
    deliveryZoneName: true,
    customerNote: true,
    couponCode: true,
    subtotal: true,
    discountAmount: true,
    deliveryCharge: true,
    total: true,
    paymentMethod: true,
    paymentStatus: true,
    paymentTransactionId: true,
    paymentVerifiedAt: true,
    items: {
        select: {
            productName: true,
            productSku: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
            discountAmount: true,
        },
        orderBy: { createdAt: "asc" },
    },
} satisfies Prisma.OrderSelect;

type InvoiceOrder = Prisma.OrderGetPayload<{ select: typeof invoiceSelect }>;

const buildInvoice = async (order: InvoiceOrder & { invoiceNumber: string }) => {
    const { value: store, images } = await settingService.getSettingGroup("general");

    return {
        invoiceNumber: order.invoiceNumber,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        orderDate: order.createdAt,
        issuedAt: order.confirmedAt ?? order.createdAt,
        deliveredAt: order.deliveredAt,
        store: {
            name: store.storeName,
            logo: images.logo ?? null,
            phone: store.phone,
            email: store.email,
            address: store.address,
        },
        billTo: {
            name: order.recipientName,
            phone: order.recipientPhone,
            email: order.recipientEmail,
            address: order.address,
            area: order.area,
            district: order.district,
        },
        items: order.items.map((item) => ({
            name: item.productName,
            sku: item.productSku,
            unitPrice: item.unitPrice.toFixed(2),
            quantity: item.quantity,
            discountAmount: item.discountAmount.toFixed(2),
            lineTotal: item.lineTotal.toFixed(2),
        })),
        summary: {
            subtotal: order.subtotal.toFixed(2),
            discountAmount: order.discountAmount.toFixed(2),
            couponCode: order.couponCode,
            deliveryCharge: order.deliveryCharge.toFixed(2),
            deliveryZoneName: order.deliveryZoneName,
            total: order.total.toFixed(2),
        },
        payment: {
            method: order.paymentMethod,
            methodLabel: paymentLabels[order.paymentMethod],
            status: order.paymentStatus,
            transactionId: order.paymentTransactionId,
            paidAt: order.paymentMethod === PaymentMethod.COD ? order.deliveredAt : order.paymentVerifiedAt,
        },
        customerNote: order.customerNote,
    };
};

const BD_OFFSET = "+06:00";
const DAY_MS = 24 * 60 * 60 * 1000;

const buildDateFilter = (from: string | undefined, to: string | undefined) => {
    if (!from && !to) return undefined;

    return {
        ...(from && { gte: new Date(`${from}T00:00:00${BD_OFFSET}`) }),
        ...(to && { lt: new Date(new Date(`${to}T00:00:00${BD_OFFSET}`).getTime() + DAY_MS) }),
    };
};

const releaseStock = async (tx: Tx, orderId: string, restock: boolean) => {
    const items = await tx.orderItem.findMany({
        where: { orderId, productId: { not: null } },
        select: { productId: true, quantity: true },
    });

    for (const item of items) {
        await tx.$executeRaw`
            UPDATE "products"
            SET "soldCount" = GREATEST("soldCount" - ${item.quantity}, 0),
                "stock" = CASE WHEN "manageStock" AND ${restock} THEN "stock" + ${item.quantity} ELSE "stock" END,
                "updatedAt" = NOW()
            WHERE "id" = ${item.productId}
        `;
    }
};

const releaseCoupon = async (tx: Tx, couponId: string) => {
    await tx.$executeRaw`
        UPDATE "coupons"
        SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = NOW()
        WHERE "id" = ${couponId}
    `;
};

type StatusChange = {
    status: OrderStatus;
    note?: string | undefined;
    cancelReason?: string | undefined;
    restock: boolean;
};

const changeOrderStatus = async (orderId: string, change: StatusChange, changedById: string, ownerId?: string) => {
    const order = await prisma.order.findFirst({
        where: { id: orderId, ...(ownerId && { userId: ownerId }) },
        select: {
            id: true,
            orderNumber: true,
            invoiceNumber: true,
            status: true,
            paymentMethod: true,
            paymentStatus: true,
            couponId: true,
        },
    });

    if (!order) {
        throw new AppError("Order not found", 404);
    }

    if (order.status === change.status) {
        throw new AppError(`Order is already ${change.status.toLowerCase()}`, 400);
    }

    if (!allowedNextStatuses[order.status].includes(change.status)) {
        throw new AppError(
            `Cannot change order from ${order.status.toLowerCase()} to ${change.status.toLowerCase()}`,
            400,
        );
    }

    if (
        isAdvancePayment(order.paymentMethod) &&
        order.paymentStatus !== PaymentStatus.PAID &&
        statusesNeedingPayment.includes(change.status)
    ) {
        throw new AppError("Verify the payment and mark it as paid before confirming this order", 400);
    }

    const now = new Date();
    const data: Prisma.OrderUpdateManyMutationInput = { status: change.status };

    if (change.status === OrderStatus.CONFIRMED) {
        data.confirmedAt = now;
        data.invoiceNumber =
            order.invoiceNumber ?? buildInvoiceNumber((await getSetting("numbering")).invoicePrefix, order.orderNumber);
    }

    if (change.status === OrderStatus.DELIVERED) {
        data.deliveredAt = now;

        if (order.paymentMethod === PaymentMethod.COD) {
            data.paymentStatus = PaymentStatus.PAID;
        }
    }

    if (change.status === OrderStatus.CANCELLED) {
        data.cancelledAt = now;
        data.cancelReason = change.cancelReason ?? null;
    }

    const isReleased = change.status === OrderStatus.CANCELLED || change.status === OrderStatus.RETURNED;

    if (isReleased && order.paymentStatus === PaymentStatus.PAID) {
        data.paymentStatus = PaymentStatus.REFUNDED;
    }

    return prisma.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
            where: { id: order.id, status: order.status },
            data,
        });

        if (updated.count === 0) {
            throw new AppError("This order was just updated by someone else. Please refresh", 409);
        }

        await tx.orderStatusHistory.create({
            data: {
                orderId: order.id,
                status: change.status,
                note: change.note ?? change.cancelReason ?? statusNotes[change.status] ?? null,
                changedById,
            },
        });

        if (isReleased) {
            await releaseStock(tx, order.id, change.restock);

            if (order.couponId) {
                await releaseCoupon(tx, order.couponId);
            }
        }

        return tx.order.findUniqueOrThrow({
            where: { id: order.id },
            select: ownerId ? customerOrderSelect : adminOrderSelect,
        });
    });
};

export const orderService = {
    previewCheckout: async (payload: CheckoutPreviewPayload, userId: string | undefined) => {
        const { items } = await resolveItems(userId, payload.items);
        const lines = await priceItems(items);

        let zone: Zone | null = null;

        if (payload.addressId) {
            const address = await findSavedAddress(userId, payload.addressId);
            zone = await findActiveZone(address.deliveryZoneId);
        } else if (payload.deliveryZoneId) {
            zone = await findActiveZone(payload.deliveryZoneId);
        }

        const totals = await calculateTotals(lines, zone, payload.couponCode, userId, payload.phone);

        return {
            items: lines.map((line) => ({
                productId: line.productId,
                productName: line.productName,
                productImage: line.productImage,
                unitPrice: line.unitPrice.toFixed(2),
                quantity: line.quantity,
                lineTotal: line.lineTotal.toFixed(2),
                discountAmount: (totals.itemDiscounts.get(line.productId) ?? new Decimal(0)).toFixed(2),
            })),
            deliveryZone: zone && { id: zone.id, name: zone.name, estimatedDays: zone.estimatedDays },
            coupon: totals.coupon,
            subtotal: totals.subtotal.toFixed(2),
            discountAmount: totals.discountAmount.toFixed(2),
            deliveryCharge: totals.deliveryCharge?.toFixed(2) ?? null,
            total: totals.total.toFixed(2),
        };
    },

    placeOrder: async (payload: CheckoutPayload, sessionUserId: string | undefined) => {
        if (sessionUserId) {
            const user = await prisma.user.findUnique({
                where: { id: sessionUserId },
                select: { isBanned: true, deletedAt: true },
            });

            if (!user || user.isBanned || user.deletedAt) {
                throw new AppError("Your account cannot place orders. Please contact us", 403);
            }
        }

        await ensurePaymentMethodAvailable(payload.paymentMethod);
        await ensureTransactionUnused(payload.paymentMethod, payload.paymentTransactionId);

        const shipping = payload.addressId
            ? await findSavedAddress(sessionUserId, payload.addressId)
            : payload.shipping!;

        const { items, fromCart } = await resolveItems(sessionUserId, payload.items);
        const lines = await priceItems(items);
        const zone = await findActiveZone(shipping.deliveryZoneId);
        const totals = await calculateTotals(
            lines,
            zone,
            payload.couponCode,
            sessionUserId,
            shipping.recipientPhone,
        );
        const orderNumber = await generateOrderNumber();

        const result = await prisma.$transaction(async (tx) => {
            const customer = sessionUserId
                ? { userId: sessionUserId, isNew: false }
                : await findOrCreateGuestCustomer(tx, shipping.recipientName, shipping.recipientPhone, payload.email);

            if (totals.coupon) {
                await useCoupon(tx, totals.coupon.id);
            }

            await reduceStock(tx, lines);

            const order = await tx.order.create({
                data: {
                    orderNumber,
                    userId: customer.userId,
                    recipientName: shipping.recipientName,
                    recipientPhone: shipping.recipientPhone,
                    recipientEmail: payload.email ?? null,
                    address: shipping.address,
                    district: shipping.district,
                    area: shipping.area,
                    deliveryZoneName: zone.name,
                    customerNote: payload.customerNote ?? null,
                    subtotal: totals.subtotal,
                    discountAmount: totals.discountAmount,
                    deliveryCharge: totals.deliveryCharge ?? 0,
                    total: totals.total,
                    couponCode: totals.coupon?.code ?? null,
                    couponId: totals.coupon?.id ?? null,
                    paymentMethod: payload.paymentMethod,
                    paymentSender: payload.paymentSender ?? null,
                    paymentTransactionId: payload.paymentTransactionId ?? null,
                    items: {
                        create: lines.map((line) => ({
                            productId: line.productId,
                            productName: line.productName,
                            productSku: line.productSku,
                            productImage: line.productImage,
                            unitPrice: line.unitPrice,
                            quantity: line.quantity,
                            lineTotal: line.lineTotal,
                            discountAmount: totals.itemDiscounts.get(line.productId) ?? 0,
                        })),
                    },
                    statusHistory: {
                        create: { status: OrderStatus.PENDING, note: "Order placed", changedById: customer.userId },
                    },
                },
                select: orderSelect,
            });

            if (customer.isNew || (sessionUserId && payload.shipping && payload.saveAddress)) {
                const addressCount = await tx.address.count({ where: { userId: customer.userId } });

                if (addressCount < 10) {
                    await tx.address.create({
                        data: {
                            userId: customer.userId,
                            recipientName: shipping.recipientName,
                            recipientPhone: shipping.recipientPhone,
                            address: shipping.address,
                            district: shipping.district,
                            area: shipping.area,
                            deliveryZoneId: zone.id,
                            isDefault: addressCount === 0,
                        },
                    });
                }
            }

            if (sessionUserId && fromCart) {
                await tx.cartItem.deleteMany({
                    where: { cart: { userId: sessionUserId }, productId: { in: lines.map((line) => line.productId) } },
                });
            }

            return { order, accountCreated: customer.isNew };
        });

        return result;
    },

    getMyOrders: async (userId: string, query: GetMyOrdersQuery) => {
        const where: Prisma.OrderWhereInput = {
            userId,
            ...(query.status && { status: query.status }),
        };

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                select: orderListSelect,
                orderBy: { createdAt: "desc" },
                ...getPagination(query),
            }),
            prisma.order.count({ where }),
        ]);

        return { orders, meta: paginationMeta(query, total) };
    },

    getMyOrderById: async (userId: string, orderId: string) => {
        const order = await prisma.order.findFirst({
            where: { id: orderId, userId },
            select: customerOrderSelect,
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        return order;
    },

    getMyOrderInvoice: async (userId: string, orderId: string) => {
        const order = await prisma.order.findFirst({
            where: { id: orderId, userId },
            select: invoiceSelect,
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (!order.invoiceNumber) {
            throw new AppError("The invoice will be available after your order is confirmed", 400);
        }

        return buildInvoice({ ...order, invoiceNumber: order.invoiceNumber });
    },

    cancelMyOrder: async (userId: string, orderId: string, payload: CancelMyOrderPayload) => {
        const order = await prisma.order.findFirst({
            where: { id: orderId, userId },
            select: { status: true },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.status !== OrderStatus.PENDING) {
            throw new AppError("This order can no longer be cancelled. Please contact us", 400);
        }

        return changeOrderStatus(
            orderId,
            {
                status: OrderStatus.CANCELLED,
                cancelReason: payload.reason ?? "Cancelled by customer",
                restock: true,
            },
            userId,
            userId,
        );
    },

    trackOrder: async (query: TrackOrderQuery) => {
        const order = await prisma.order.findFirst({
            where: { orderNumber: query.orderNumber, recipientPhone: query.phone },
            select: trackOrderSelect,
        });

        if (!order) {
            throw new AppError("No order found with this order number and phone", 404);
        }

        return order;
    },

    getAllOrders: async (query: GetAllOrdersQuery) => {
        const createdAt = buildDateFilter(query.from, query.to);
        const where: Prisma.OrderWhereInput = {
            ...(query.status && { status: query.status }),
            ...(query.paymentStatus && { paymentStatus: query.paymentStatus }),
            ...(createdAt && { createdAt }),
            ...(query.searchTerm && {
                OR: [
                    { orderNumber: { contains: query.searchTerm, mode: "insensitive" } },
                    { invoiceNumber: { contains: query.searchTerm, mode: "insensitive" } },
                    { recipientPhone: { contains: query.searchTerm } },
                    { recipientName: { contains: query.searchTerm, mode: "insensitive" } },
                    { recipientEmail: { contains: query.searchTerm, mode: "insensitive" } },
                    { paymentTransactionId: { contains: query.searchTerm, mode: "insensitive" } },
                    { paymentSender: { contains: query.searchTerm } },
                ],
            }),
        };

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                select: adminOrderListSelect,
                orderBy: orderSortOrders[query.sort],
                ...getPagination(query),
            }),
            prisma.order.count({ where }),
        ]);

        return { orders, meta: paginationMeta(query, total) };
    },

    getOrderStatusCounts: async () => {
        const groups = await prisma.order.groupBy({
            by: ["status"],
            _count: { _all: true },
        });

        const counts = Object.fromEntries(Object.values(OrderStatus).map((status) => [status, 0])) as Record<
            OrderStatus,
            number
        >;

        for (const group of groups) {
            counts[group.status] = group._count._all;
        }

        return { ...counts, ALL: groups.reduce((sum, group) => sum + group._count._all, 0) };
    },

    getOrderById: async (orderId: string) => {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: adminOrderSelect,
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        return order;
    },

    updateOrderStatus: async (orderId: string, payload: UpdateOrderStatusPayload, adminId: string) => {
        return changeOrderStatus(orderId, payload, adminId);
    },

    updatePaymentStatus: async (orderId: string, payload: UpdatePaymentStatusPayload, adminId: string) => {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, status: true, paymentMethod: true, paymentStatus: true },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.RETURNED) {
            throw new AppError(`Cannot change payment of a ${order.status.toLowerCase()} order`, 400);
        }

        if (order.paymentStatus === payload.paymentStatus) {
            throw new AppError(`Payment is already ${payload.paymentStatus.toLowerCase()}`, 400);
        }

        if (order.paymentStatus !== PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.UNPAID) {
            throw new AppError("This payment has been refunded and cannot be changed here", 400);
        }

        if (
            payload.paymentStatus === PaymentStatus.UNPAID &&
            isAdvancePayment(order.paymentMethod) &&
            statusesNeedingPayment.includes(order.status)
        ) {
            throw new AppError("Cancel the order instead of marking a confirmed advance payment as unpaid", 400);
        }

        const isPaid = payload.paymentStatus === PaymentStatus.PAID;

        return prisma.$transaction(async (tx) => {
            const updated = await tx.order.updateMany({
                where: { id: order.id, paymentStatus: order.paymentStatus, status: order.status },
                data: {
                    paymentStatus: payload.paymentStatus,
                    paymentVerifiedAt: isPaid ? new Date() : null,
                    paymentVerifiedById: isPaid ? adminId : null,
                },
            });

            if (updated.count === 0) {
                throw new AppError("This order was just updated by someone else. Please refresh", 409);
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: order.status,
                    note: payload.note ?? (isPaid ? "Payment marked as paid" : "Payment marked as unpaid"),
                    changedById: adminId,
                },
            });

            return tx.order.findUniqueOrThrow({ where: { id: order.id }, select: adminOrderSelect });
        });
    },

    updateAdminNote: async (orderId: string, payload: UpdateAdminNotePayload) => {
        const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        return prisma.order.update({
            where: { id: orderId },
            data: { adminNote: payload.adminNote },
            select: adminOrderSelect,
        });
    },
};
