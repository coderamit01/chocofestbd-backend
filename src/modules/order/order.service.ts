import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { Prisma } from "../../generated/prisma/client";
import { OrderStatus, PaymentMethod, PaymentStatus, ProductStatus, UserRole } from "../../generated/prisma/enums";
import { getStockError, inStockWhere, stockSelect } from "../../helpers/stock";
import { getPagination, paginationMeta } from "../../shared/pagination";
import { couponService } from "../coupon/coupon.service";
import { getSetting, settingService } from "../setting/setting.service";
import { notify } from "../notification/notification.service";
import { locationService } from "../location/location.service";
import type {
    AdminCreateOrderPayload,
    BulkOrderStatusPayload,
    GetPaymentsQuery,
    OrderCountsQuery,
    OrderFilters,
    PaymentVerificationStatus,
    RecordRefundPayload,
    RejectPaymentPayload,
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

const formatTaka = (amount: Decimal) => `৳${amount.toFixed(2)}`;

const notifyNewOrder = (order: {
    id: string;
    orderNumber: string;
    total: Decimal;
    paymentMethod: PaymentMethod;
    paymentTransactionId: string | null;
    recipientName: string;
    recipientPhone: string;
    items: { quantity: number }[];
}) => {
    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const advance = isAdvancePayment(order.paymentMethod);
    const payment = advance
        ? `${paymentLabels[order.paymentMethod]} · TrxID ${order.paymentTransactionId ?? "-"}`
        : paymentLabels[order.paymentMethod];

    return notify(advance ? "order.paymentPending" : "order.created", {
        title: advance ? `New order ${order.orderNumber}: verify payment` : `New order ${order.orderNumber}`,
        message: `${formatTaka(order.total)} · ${payment}\n${order.recipientName} (${order.recipientPhone}) · ${itemCount} item${itemCount === 1 ? "" : "s"}`,
        link: `/admin/orders/${order.id}`,
        data: { orderId: order.id, orderNumber: order.orderNumber },
    });
};

const notifyStockLevels = async (lines: PricedLine[]) => {
    try {
        const managed = lines.filter((line) => line.manageStock);

        if (!managed.length) return;

        const products = await prisma.product.findMany({
            where: { id: { in: managed.map((line) => line.productId) } },
            select: { id: true, name: true, sku: true, stock: true, lowStockThreshold: true },
        });

        for (const product of products) {
            const sold = managed.find((line) => line.productId === product.id)?.quantity ?? 0;
            const before = product.stock + sold;
            const common = {
                link: `/admin/products/${product.id}`,
                data: { productId: product.id, sku: product.sku, stock: product.stock },
            };

            if (product.stock <= 0) {
                await notify("stock.out", {
                    ...common,
                    title: `Out of stock: ${product.name}`,
                    message: `${product.sku} has no stock left. It can no longer be ordered.`,
                });
            } else if (product.stock <= product.lowStockThreshold && before > product.lowStockThreshold) {
                await notify("stock.low", {
                    ...common,
                    title: `Low stock: ${product.name}`,
                    message: `${product.sku} has only ${product.stock} left (alert level ${product.lowStockThreshold}).`,
                });
            }
        }
    } catch (error) {
        console.error("Failed to check stock levels for notifications:", error);
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
    invoiceNumber: true,
    recipientName: true,
    recipientPhone: true,
    recipientEmail: true,
    district: true,
    area: true,
    deliveryZoneName: true,
    couponCode: true,
    subtotal: true,
    discountAmount: true,
    deliveryCharge: true,
    paymentSender: true,
    paymentTransactionId: true,
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

const loadInvoiceStore = async () => {
    const { value, images } = await settingService.getSettingGroup("general");

    return { store: value, logo: images.logo ?? null };
};

type InvoiceStore = Awaited<ReturnType<typeof loadInvoiceStore>>;

const buildInvoice = async (order: InvoiceOrder & { invoiceNumber: string }) =>
    toInvoice(order, await loadInvoiceStore());

const toInvoice = (order: InvoiceOrder & { invoiceNumber: string }, { store, logo }: InvoiceStore) => {
    return {
        id: order.id,
        invoiceNumber: order.invoiceNumber,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        orderDate: order.createdAt,
        issuedAt: order.confirmedAt ?? order.createdAt,
        deliveredAt: order.deliveredAt,
        store: {
            name: store.storeName,
            logo,
            phone: store.phone,
            whatsapp: store.whatsapp,
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

const PAYMENT_REJECTED_NOTE = "Payment rejected";
const REFUND_NOTE = /^Refund ৳(\d+(?:\.\d+)?) recorded/;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const percentChange = (current: number, previous: number) =>
    previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

const withInvoiceNumber = <T extends { orderNumber: string; invoiceNumber: string | null }>(order: T, prefix: string) => ({
    ...order,
    invoiceNumber: order.invoiceNumber ?? buildInvoiceNumber(prefix, order.orderNumber),
});

const digitsOnly = (value: string) => value.replace(/[-\s]/g, "");

const orderSearchFilter = (searchTerm: string): Prisma.OrderWhereInput => {
    const digits = digitsOnly(searchTerm);
    const phoneTerm = /^\+?\d+$/.test(digits) ? digits.replace(/^\+?88/, "") : searchTerm;

    return {
        OR: [
            { orderNumber: { contains: searchTerm, mode: "insensitive" } },
            { invoiceNumber: { contains: searchTerm, mode: "insensitive" } },
            { recipientPhone: { contains: phoneTerm } },
            { recipientName: { contains: searchTerm, mode: "insensitive" } },
            { recipientEmail: { contains: searchTerm, mode: "insensitive" } },
            { paymentTransactionId: { contains: searchTerm, mode: "insensitive" } },
            { paymentSender: { contains: phoneTerm } },
        ],
    };
};

const buildOrderWhere = (filters: OrderFilters): Prisma.OrderWhereInput => {
    const createdAt = buildDateFilter(filters.from, filters.to);

    return {
        ...(filters.status && { status: filters.status }),
        ...(filters.paymentStatus && { paymentStatus: filters.paymentStatus }),
        ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
        ...(filters.deliveryZone && { deliveryZoneName: { equals: filters.deliveryZone, mode: "insensitive" } }),
        ...(filters.district && { district: { equals: filters.district, mode: "insensitive" } }),
        ...(filters.coupon === "yes" && { couponCode: { not: null } }),
        ...(filters.coupon === "no" && { couponCode: null }),
        ...(createdAt && { createdAt }),
        ...(filters.searchTerm && orderSearchFilter(filters.searchTerm)),
    };
};

const verificationOf = (order: {
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    paymentVerifiedAt: Date | null;
}): PaymentVerificationStatus | null => {
    if (order.paymentMethod === PaymentMethod.COD) return null;
    if (order.paymentStatus !== PaymentStatus.UNPAID) return "VERIFIED";

    return order.paymentVerifiedAt ? "REJECTED" : "PENDING";
};

const verificationWhere: Record<PaymentVerificationStatus, Prisma.OrderWhereInput> = {
    PENDING: {
        paymentStatus: PaymentStatus.UNPAID,
        paymentVerifiedAt: null,
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
    },
    VERIFIED: { paymentStatus: { not: PaymentStatus.UNPAID } },
    REJECTED: { paymentStatus: PaymentStatus.UNPAID, paymentVerifiedAt: { not: null } },
};

const rejectReasonOf = (note: string | null | undefined) => {
    if (!note?.startsWith(PAYMENT_REJECTED_NOTE)) return null;

    return note.slice(PAYMENT_REJECTED_NOTE.length).replace(/^\s*[—:-]\s*/, "").trim() || null;
};

const refundedAmountOf = (order: { total: Decimal; paymentStatus: PaymentStatus; statusHistory: { note: string | null }[] }) => {
    const recorded = order.statusHistory.reduce((sum, entry) => {
        const match = entry.note?.match(REFUND_NOTE);
        return match ? sum.add(match[1]!) : sum;
    }, new Decimal(0));

    if (order.paymentStatus === PaymentStatus.REFUNDED && recorded.isZero()) return order.total;

    return Decimal.min(recorded, order.total);
};

const userNames = async (ids: (string | null | undefined)[]) => {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];

    if (!unique.length) return new Map<string, string>();

    const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });

    return new Map(users.map((user) => [user.id, user.name]));
};

const dhakaDayStart = (offsetDays = 0) => {
    const local = new Date(Date.now() + BD_OFFSET_MS);
    const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BD_OFFSET_MS;

    return new Date(midnight + offsetDays * DAY_MS);
};

const paymentListSelect = {
    id: true,
    orderNumber: true,
    status: true,
    recipientName: true,
    paymentMethod: true,
    paymentStatus: true,
    paymentSender: true,
    paymentTransactionId: true,
    paymentVerifiedAt: true,
    paymentVerifiedById: true,
    total: true,
    createdAt: true,
    statusHistory: {
        where: { note: { startsWith: PAYMENT_REJECTED_NOTE } },
        select: { note: true },
        orderBy: { createdAt: "desc" },
        take: 1,
    },
} satisfies Prisma.OrderSelect;

type PaymentListOrder = Prisma.OrderGetPayload<{ select: typeof paymentListSelect }>;

const toPaymentRows = async (orders: PaymentListOrder[]) => {
    const names = await userNames(orders.map((order) => order.paymentVerifiedById));

    return orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        recipientName: order.recipientName,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        sender: order.paymentSender,
        transactionId: order.paymentTransactionId,
        amount: order.total,
        submittedAt: order.createdAt,
        verification: verificationOf(order) ?? "PENDING",
        verifiedAt: order.paymentVerifiedAt,
        verifiedBy: order.paymentVerifiedById ? (names.get(order.paymentVerifiedById) ?? null) : null,
        rejectReason: rejectReasonOf(order.statusHistory[0]?.note),
    }));
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

        const maintenance = await getSetting("maintenance");

        if (maintenance.storeClosed) {
            throw new AppError(maintenance.closedMessage || "We are not taking orders right now. Please check back soon", 503);
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

        void notifyNewOrder(result.order);
        void notifyStockLevels(lines);

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

        const cancelled = await changeOrderStatus(
            orderId,
            {
                status: OrderStatus.CANCELLED,
                cancelReason: payload.reason ?? "Cancelled by customer",
                restock: true,
            },
            userId,
            userId,
        );

        void notify("order.cancelledByCustomer", {
            title: `Order ${cancelled.orderNumber} cancelled by customer`,
            message: `${formatTaka(cancelled.total)} · ${cancelled.recipientName} (${cancelled.recipientPhone})\nReason: ${payload.reason ?? "Not given"}`,
            link: `/admin/orders/${orderId}`,
            data: { orderId, orderNumber: cancelled.orderNumber },
        });

        return cancelled;
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
        const where = buildOrderWhere(query);

        const [orders, total, numbering] = await Promise.all([
            prisma.order.findMany({
                where,
                select: adminOrderListSelect,
                orderBy: orderSortOrders[query.sort],
                ...getPagination(query),
            }),
            prisma.order.count({ where }),
            getSetting("numbering"),
        ]);

        return {
            orders: orders.map((order) => withInvoiceNumber(order, numbering.invoicePrefix)),
            meta: paginationMeta(query, total),
        };
    },

    getOrderStatusCounts: async (filters: OrderCountsQuery = {}) => {
        const groups = await prisma.order.groupBy({
            by: ["status"],
            where: buildOrderWhere(filters),
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
            select: {
                ...adminOrderSelect,
                user: {
                    select: { id: true, name: true, email: true, phone: true, _count: { select: { orders: true } } },
                },
            },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        const productIds = order.items.map((item) => item.productId).filter((id): id is string => !!id);

        const [numbering, zone, products, names, rejected] = await Promise.all([
            getSetting("numbering"),
            prisma.deliveryZone.findUnique({
                where: { name: order.deliveryZoneName },
                select: { charge: true, estimatedDays: true },
            }),
            prisma.product.findMany({
                where: { id: { in: productIds } },
                select: { id: true, category: { select: { name: true } } },
            }),
            userNames([order.paymentVerifiedById]),
            prisma.orderStatusHistory.findFirst({
                where: { orderId: order.id, note: { startsWith: PAYMENT_REJECTED_NOTE } },
                select: { note: true },
                orderBy: { createdAt: "desc" },
            }),
        ]);

        const categories = new Map(products.map((product) => [product.id, product.category.name]));
        const placedBy = order.statusHistory[0]?.changedBy;
        const { user, ...rest } = order;
        const email = user?.email && !user.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`) ? user.email : null;

        return {
            ...withInvoiceNumber(rest, numbering.invoicePrefix),
            user: user && { id: user.id, name: user.name, email, phone: user.phone },
            customerOrderCount: user?._count.orders ?? 1,
            items: order.items.map((item) => ({
                ...item,
                categoryName: item.productId ? (categories.get(item.productId) ?? null) : null,
            })),
            source: placedBy && placedBy.role !== UserRole.CUSTOMER ? "staff" : "website",
            deliveryZone: { name: order.deliveryZoneName, estimatedDays: zone?.estimatedDays ?? null },
            nextStatuses: allowedNextStatuses[order.status],
            refundedAmount: refundedAmountOf(order),
            paymentVerification: {
                status: verificationOf(order),
                verifiedAt: order.paymentVerifiedAt,
                verifiedBy: order.paymentVerifiedById ? (names.get(order.paymentVerifiedById) ?? null) : null,
                rejectReason: rejectReasonOf(rejected?.note),
            },
        };
    },

    getOrderSummary: async () => {
        const now = Date.now();
        const countBy = (createdAt?: Prisma.DateTimeFilter) =>
            prisma.order.groupBy({ by: ["status"], ...(createdAt && { where: { createdAt } }), _count: { _all: true } });

        const [totals, current, previous] = await Promise.all([
            countBy(),
            countBy({ gte: new Date(now - WEEK_MS) }),
            countBy({ gte: new Date(now - 2 * WEEK_MS), lt: new Date(now - WEEK_MS) }),
        ]);

        const pick = (groups: typeof totals, status?: OrderStatus) =>
            groups.filter((group) => !status || group.status === status).reduce((sum, group) => sum + group._count._all, 0);

        const metric = (status?: OrderStatus) => ({
            value: pick(totals, status),
            change: percentChange(pick(current, status), pick(previous, status)),
        });

        return {
            total: metric(),
            pending: metric(OrderStatus.PENDING),
            shipped: metric(OrderStatus.SHIPPED),
            delivered: metric(OrderStatus.DELIVERED),
        };
    },

    getOrderFilterOptions: async () => {
        const [zones, orderZones, districts] = await Promise.all([
            prisma.deliveryZone.findMany({
                where: { isActive: true },
                select: { name: true },
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            }),
            prisma.order.groupBy({ by: ["deliveryZoneName"], _count: { _all: true } }),
            prisma.order.groupBy({
                by: ["district"],
                _count: { _all: true },
                orderBy: { _count: { district: "desc" } },
                take: 30,
            }),
        ]);

        return {
            zones: [...new Set([...zones.map((zone) => zone.name), ...orderZones.map((zone) => zone.deliveryZoneName)])],
            districts: districts.map((group) => group.district),
        };
    },

    getOrderFormOptions: async () => {
        const [zones, products] = await Promise.all([
            prisma.deliveryZone.findMany({
                where: { isActive: true },
                select: { id: true, name: true, charge: true, estimatedDays: true },
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            }),
            prisma.product.findMany({
                where: { status: ProductStatus.ACTIVE, deletedAt: null, ...inStockWhere },
                select: { id: true, name: true, sku: true, price: true, discountPrice: true, stock: true, manageStock: true },
                orderBy: { name: "asc" },
                take: 500,
            }),
        ]);

        return {
            zones,
            products: products.map((product) => ({
                id: product.id,
                name: product.name,
                sku: product.sku,
                price:
                    product.discountPrice !== null && product.discountPrice.lt(product.price)
                        ? product.discountPrice
                        : product.price,
                stock: product.manageStock ? product.stock : null,
            })),
            districts: locationService.getDistricts().map((district) => ({
                name: district.name,
                areas: locationService.getThanas(district.name).map((thana) => thana.name),
            })),
        };
    },

    searchCustomers: async (searchTerm: string | undefined) => {
        if (!searchTerm) return [];

        const digits = digitsOnly(searchTerm).replace(/^\+?88/, "");
        const customers = await prisma.user.findMany({
            where: {
                role: UserRole.CUSTOMER,
                deletedAt: null,
                isBanned: false,
                OR: [
                    { name: { contains: searchTerm, mode: "insensitive" } },
                    ...(/^\d{3,}$/.test(digits) ? [{ phone: { contains: digits } }] : []),
                ],
            },
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                _count: { select: { orders: true } },
                addresses: {
                    select: { address: true, district: true, area: true, deliveryZoneId: true },
                    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
                    take: 1,
                },
            },
            orderBy: { name: "asc" },
            take: 6,
        });

        return customers.map(({ _count, addresses, email, ...customer }) => ({
            ...customer,
            email: email.endsWith(`@${GUEST_EMAIL_DOMAIN}`) ? null : email,
            orderCount: _count.orders,
            address: addresses[0] ?? null,
        }));
    },

    createAdminOrder: async (payload: AdminCreateOrderPayload, adminId: string) => {
        const existing = await prisma.user.findUnique({
            where: { phone: payload.recipientPhone },
            select: { id: true, isBanned: true, deletedAt: true },
        });

        if (existing && (existing.isBanned || existing.deletedAt)) {
            throw new AppError("This phone number is blocked from placing orders", 403);
        }

        const lines = await priceItems(mergeItems(payload.items));
        const zone = await findActiveZone(payload.deliveryZoneId);
        const totals = await calculateTotals(lines, zone, payload.couponCode, existing?.id, payload.recipientPhone);
        const orderNumber = await generateOrderNumber();

        const order = await prisma.$transaction(async (tx) => {
            const customer = await findOrCreateGuestCustomer(
                tx,
                payload.recipientName,
                payload.recipientPhone,
                payload.email,
            );

            if (totals.coupon) {
                await useCoupon(tx, totals.coupon.id);
            }

            await reduceStock(tx, lines);

            const created = await tx.order.create({
                data: {
                    orderNumber,
                    userId: customer.userId,
                    recipientName: payload.recipientName,
                    recipientPhone: payload.recipientPhone,
                    recipientEmail: payload.email ?? null,
                    address: payload.address,
                    district: payload.district,
                    area: payload.area,
                    deliveryZoneName: zone.name,
                    customerNote: payload.customerNote ?? null,
                    subtotal: totals.subtotal,
                    discountAmount: totals.discountAmount,
                    deliveryCharge: totals.deliveryCharge ?? 0,
                    total: totals.total,
                    couponCode: totals.coupon?.code ?? null,
                    couponId: totals.coupon?.id ?? null,
                    paymentMethod: payload.paymentMethod,
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
                        create: { status: OrderStatus.PENDING, note: "Order placed by staff", changedById: adminId },
                    },
                },
                select: orderSelect,
            });

            if (customer.isNew) {
                await tx.address.create({
                    data: {
                        userId: customer.userId,
                        recipientName: payload.recipientName,
                        recipientPhone: payload.recipientPhone,
                        address: payload.address,
                        district: payload.district,
                        area: payload.area,
                        deliveryZoneId: zone.id,
                        isDefault: true,
                    },
                });
            }

            return created;
        });

        void notifyStockLevels(lines);

        return order;
    },

    bulkUpdateStatus: async (payload: BulkOrderStatusPayload, adminId: string) => {
        const orders = await prisma.order.findMany({
            where: { id: { in: payload.orderIds } },
            select: { id: true, orderNumber: true },
        });

        const failed: { orderNumber: string; message: string }[] = [];
        let updated = 0;

        for (const order of orders) {
            try {
                await changeOrderStatus(
                    order.id,
                    {
                        status: payload.status,
                        note: payload.note,
                        cancelReason:
                            payload.status === OrderStatus.CANCELLED ? (payload.note ?? "Cancelled by staff") : undefined,
                        restock: true,
                    },
                    adminId,
                );
                updated += 1;
            } catch (error) {
                failed.push({
                    orderNumber: order.orderNumber,
                    message: error instanceof AppError ? error.message : "Could not update this order",
                });
            }
        }

        return { updated, failed };
    },

    getPayments: async (query: GetPaymentsQuery) => {
        const where: Prisma.OrderWhereInput = {
            AND: [
                { paymentMethod: query.paymentMethod ?? { not: PaymentMethod.COD } },
                query.verification
                    ? verificationWhere[query.verification]
                    : { OR: Object.values(verificationWhere) },
                ...(query.searchTerm ? [orderSearchFilter(query.searchTerm)] : []),
            ],
        };

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                select: paymentListSelect,
                orderBy: { createdAt: "desc" },
                ...getPagination(query),
            }),
            prisma.order.count({ where }),
        ]);

        return { payments: await toPaymentRows(orders), meta: paginationMeta(query, total) };
    },

    getPendingPayments: async (limit: number) => {
        const where: Prisma.OrderWhereInput = {
            paymentMethod: { not: PaymentMethod.COD },
            ...verificationWhere.PENDING,
        };

        const [orders, total] = await Promise.all([
            prisma.order.findMany({ where, select: paymentListSelect, orderBy: { createdAt: "desc" }, take: limit }),
            prisma.order.count({ where }),
        ]);

        return { payments: await toPaymentRows(orders), total };
    },

    getPaymentSummary: async () => {
        const advance = { paymentMethod: { not: PaymentMethod.COD } };
        const today = { gte: dhakaDayStart() };
        const yesterday = { gte: dhakaDayStart(-1), lt: dhakaDayStart() };
        const verified = (paymentVerifiedAt: Prisma.DateTimeFilter) =>
            prisma.order.count({ where: { ...advance, ...verificationWhere.VERIFIED, paymentVerifiedAt } });
        const rejected = (paymentVerifiedAt: Prisma.DateTimeFilter) =>
            prisma.order.count({ where: { ...advance, paymentStatus: PaymentStatus.UNPAID, paymentVerifiedAt } });

        const [awaiting, verifiedToday, verifiedYesterday, rejectedToday, rejectedYesterday] = await Promise.all([
            prisma.order.aggregate({
                where: { ...advance, ...verificationWhere.PENDING },
                _count: { _all: true },
                _sum: { total: true },
            }),
            verified(today),
            verified(yesterday),
            rejected(today),
            rejected(yesterday),
        ]);

        return {
            awaiting: awaiting._count._all,
            amountToVerify: awaiting._sum.total ?? new Decimal(0),
            verifiedToday: { value: verifiedToday, change: percentChange(verifiedToday, verifiedYesterday) },
            rejectedToday: { value: rejectedToday, change: percentChange(rejectedToday, rejectedYesterday) },
        };
    },

    rejectPayment: async (orderId: string, payload: RejectPaymentPayload, adminId: string) => {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, status: true, paymentMethod: true, paymentStatus: true, paymentVerifiedAt: true },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.paymentMethod === PaymentMethod.COD) {
            throw new AppError("Cash on delivery orders have no advance payment to reject", 400);
        }

        if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.RETURNED) {
            throw new AppError(`Cannot change payment of a ${order.status.toLowerCase()} order`, 400);
        }

        if (order.paymentStatus !== PaymentStatus.UNPAID) {
            throw new AppError("Only unpaid payments can be rejected", 400);
        }

        if (order.paymentVerifiedAt) {
            throw new AppError("This payment has already been rejected", 400);
        }

        return prisma.$transaction(async (tx) => {
            const updated = await tx.order.updateMany({
                where: { id: order.id, paymentStatus: PaymentStatus.UNPAID, paymentVerifiedAt: null },
                data: { paymentVerifiedAt: new Date(), paymentVerifiedById: adminId },
            });

            if (updated.count === 0) {
                throw new AppError("This order was just updated by someone else. Please refresh", 409);
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: order.status,
                    note: payload.reason ? `${PAYMENT_REJECTED_NOTE} — ${payload.reason}` : PAYMENT_REJECTED_NOTE,
                    changedById: adminId,
                },
            });

            return tx.order.findUniqueOrThrow({ where: { id: order.id }, select: adminOrderSelect });
        });
    },

    recordRefund: async (orderId: string, payload: RecordRefundPayload, adminId: string) => {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                status: true,
                total: true,
                paymentStatus: true,
                statusHistory: { select: { note: true } },
            },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.paymentStatus !== PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED) {
            throw new AppError("Only paid orders can be refunded", 400);
        }

        const refunded = refundedAmountOf(order);
        const remaining = order.total.sub(refunded);
        const amount = new Decimal(payload.amount).toDecimalPlaces(2);

        if (amount.gt(remaining)) {
            throw new AppError(`Refund cannot be more than ${formatTaka(remaining)}`, 400);
        }

        const paymentStatus = refunded.add(amount).gte(order.total) ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

        return prisma.$transaction(async (tx) => {
            const updated = await tx.order.updateMany({
                where: { id: order.id, paymentStatus: order.paymentStatus },
                data: { paymentStatus },
            });

            if (updated.count === 0) {
                throw new AppError("This order was just updated by someone else. Please refresh", 409);
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: order.status,
                    note: `Refund ৳${amount.toFixed(2)} recorded${payload.reference ? ` · Ref ${payload.reference}` : ""}`,
                    changedById: adminId,
                },
            });

            return tx.order.findUniqueOrThrow({ where: { id: order.id }, select: adminOrderSelect });
        });
    },

    getAdminInvoice: async (orderId: string) => {
        const [order, numbering, store] = await Promise.all([
            prisma.order.findUnique({ where: { id: orderId }, select: invoiceSelect }),
            getSetting("numbering"),
            loadInvoiceStore(),
        ]);

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        return toInvoice(withInvoiceNumber(order, numbering.invoicePrefix), store);
    },

    getAdminInvoices: async (orderIds: string[]) => {
        const [orders, numbering, store] = await Promise.all([
            prisma.order.findMany({ where: { id: { in: orderIds } }, select: invoiceSelect }),
            getSetting("numbering"),
            loadInvoiceStore(),
        ]);

        const byId = new Map(orders.map((order) => [order.id, order]));

        return orderIds
            .map((id) => byId.get(id))
            .filter((order): order is InvoiceOrder => !!order)
            .map((order) => toInvoice(withInvoiceNumber(order, numbering.invoicePrefix), store));
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
