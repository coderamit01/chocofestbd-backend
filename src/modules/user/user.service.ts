import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { OrderStatus, UserRole } from "../../generated/prisma/enums";
import { AppError } from "../../helpers/AppError";
import { paginationMeta, getPagination, type PaginationQuery } from "../../shared/pagination";
import { deleteFile, getFileUrl, uploadFile } from "../../lib/storage";
import type { AdjustPointsPayload, GetAllUsersQuery, GetCustomersQuery, UpdateUserPayload } from "./user.validation";
import { IActor } from "./user.interface";
import { DAY_MS, NON_REVENUE_STATUSES, lastWeekRanges, monthToDateRanges, percentChange, toNumber } from "../../shared/periods";

const OPEN_ORDER_STATUSES: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.PACKED,
    OrderStatus.SHIPPED,
];

const customerRowSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    phoneVerified: true,
    image: true,
    isBanned: true,
    points: true,
    createdAt: true,
} satisfies Prisma.UserSelect;

const customerProfileSelect = {
    ...customerRowSelect,
    emailVerified: true,
    updatedAt: true,
    sessions: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
    addresses: {
        select: {
            id: true,
            label: true,
            recipientName: true,
            recipientPhone: true,
            address: true,
            district: true,
            area: true,
            isDefault: true,
            deliveryZone: { select: { name: true } },
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    },
    wishlist: {
        select: {
            id: true,
            createdAt: true,
            product: { select: { id: true, name: true, slug: true, image: true, price: true, discountPrice: true } },
        },
        orderBy: { createdAt: "desc" },
    },
    reviews: {
        select: {
            id: true,
            rating: true,
            comment: true,
            status: true,
            createdAt: true,
            product: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
    },
    cart: {
        select: {
            updatedAt: true,
            items: {
                select: {
                    id: true,
                    quantity: true,
                    updatedAt: true,
                    product: { select: { id: true, name: true, image: true, price: true, discountPrice: true } },
                },
                orderBy: { createdAt: "asc" },
            },
        },
    },
    _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

type OrderStats = { orderCount: number; totalSpent: number };

const customerWhere = (query: GetCustomersQuery): Prisma.UserWhereInput => {
    const { searchTerm, status, hasOrders, joinedWithinDays } = query;
    const phoneTerm = searchTerm?.replace(/[\s-]/g, "");

    return {
        role: UserRole.CUSTOMER,
        deletedAt: null,
        ...(status && { isBanned: status === "banned" }),
        ...(hasOrders !== undefined && { orders: hasOrders ? { some: {} } : { none: {} } }),
        ...(joinedWithinDays && { createdAt: { gte: new Date(Date.now() - joinedWithinDays * DAY_MS) } }),
        ...(searchTerm && {
            OR: [
                { name: { contains: searchTerm, mode: "insensitive" } },
                { email: { contains: searchTerm, mode: "insensitive" } },
                ...(phoneTerm ? [{ phone: { contains: phoneTerm } }] : []),
            ],
        }),
    };
};

const customerOrderStats = async (userIds: string[]) => {
    const stats = new Map<string, OrderStats>();
    if (!userIds.length) return stats;

    const [counts, sums] = await Promise.all([
        prisma.order.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: { _all: true } }),
        prisma.order.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: { notIn: NON_REVENUE_STATUSES } },
            _sum: { total: true },
        }),
    ]);

    for (const row of counts) {
        if (row.userId) stats.set(row.userId, { orderCount: row._count._all, totalSpent: 0 });
    }

    for (const row of sums) {
        if (!row.userId) continue;
        const current = stats.get(row.userId) ?? { orderCount: 0, totalSpent: 0 };
        stats.set(row.userId, { ...current, totalSpent: toNumber(row._sum.total) });
    }

    return stats;
};

const withOrderStats = <T extends { id: string }>(user: T, stats: Map<string, OrderStats>) => ({
    ...user,
    ...(stats.get(user.id) ?? { orderCount: 0, totalSpent: 0 }),
});

const customerLoyalty = async (until: Date) => {
    const rows = await prisma.order.groupBy({
        by: ["userId"],
        where: {
            createdAt: { lt: until },
            status: { notIn: NON_REVENUE_STATUSES },
            user: { role: UserRole.CUSTOMER, deletedAt: null },
        },
        _count: { _all: true },
        _sum: { total: true },
    });

    const buyers = rows.filter((row) => row.userId);
    const repeat = buyers.filter((row) => row._count._all >= 2).length;
    const revenue = buyers.reduce((sum, row) => sum + toNumber(row._sum.total), 0);

    return {
        repeatRate: buyers.length ? Math.round((repeat / buyers.length) * 100) : 0,
        averageLifetimeValue: buyers.length ? Math.round(revenue / buyers.length) : 0,
    };
};


const userSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    phoneVerified: true,
    emailVerified: true,
    image: true,
    role: true,
    isBanned: true,
    points: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.UserSelect;

export const userService = {
    getAllUsers: async (
        query: GetAllUsersQuery,
        filter: Prisma.UserWhereInput = {},
        orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: "desc" },
    ) => {
        const { searchTerm } = query;

        const where: Prisma.UserWhereInput = {
            deletedAt: null,
            ...filter,
            ...(searchTerm && {
                OR: [
                    { name: { contains: searchTerm, mode: "insensitive" } },
                    { email: { contains: searchTerm, mode: "insensitive" } },
                    { phone: { contains: searchTerm } },
                ],
            }),
        };

        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({
                where,
                select: userSelect,
                orderBy,
                ...getPagination(query),
            }),
            prisma.user.count({ where }),
        ]);

        return { users, meta: paginationMeta(query, total) };
    },

    getAllCustomers: async (query: GetCustomersQuery) => {
        const where = customerWhere(query);

        if (query.sortBy === "spent") {
            const matches = await prisma.user.findMany({ where, select: { id: true, createdAt: true } });
            const stats = await customerOrderStats(matches.map((user) => user.id));
            const direction = query.sortOrder === "asc" ? 1 : -1;
            const sorted = [...matches].sort(
                (a, b) =>
                    ((stats.get(a.id)?.totalSpent ?? 0) - (stats.get(b.id)?.totalSpent ?? 0)) * direction ||
                    b.createdAt.getTime() - a.createdAt.getTime(),
            );
            const { skip, take } = getPagination(query);
            const pageIds = sorted.slice(skip, skip + take).map((user) => user.id);
            const users = await prisma.user.findMany({ where: { id: { in: pageIds } }, select: customerRowSelect });
            const byId = new Map(users.map((user) => [user.id, user]));

            return {
                users: pageIds.flatMap((id) => {
                    const user = byId.get(id);
                    return user ? [withOrderStats(user, stats)] : [];
                }),
                meta: paginationMeta(query, matches.length),
            };
        }

        const orderBy: Prisma.UserOrderByWithRelationInput[] =
            query.sortBy === "orders"
                ? [{ orders: { _count: query.sortOrder } }, { createdAt: "desc" }]
                : [{ createdAt: query.sortOrder }];

        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({ where, select: customerRowSelect, orderBy, ...getPagination(query) }),
            prisma.user.count({ where }),
        ]);
        const stats = await customerOrderStats(users.map((user) => user.id));

        return { users: users.map((user) => withOrderStats(user, stats)), meta: paginationMeta(query, total) };
    },

    getCustomerSummary: async () => {
        const now = new Date();
        const { weekAgo } = lastWeekRanges(now);
        const month = monthToDateRanges(now);
        const base: Prisma.UserWhereInput = { role: UserRole.CUSTOMER, deletedAt: null };

        const [total, totalWeekAgo, newThisMonth, newLastMonth, current, previous] = await Promise.all([
            prisma.user.count({ where: base }),
            prisma.user.count({ where: { ...base, createdAt: { lt: weekAgo } } }),
            prisma.user.count({ where: { ...base, createdAt: month.current } }),
            prisma.user.count({ where: { ...base, createdAt: month.previous } }),
            customerLoyalty(now),
            customerLoyalty(weekAgo),
        ]);

        return {
            totalCustomers: { value: total, change: percentChange(total, totalWeekAgo) },
            newThisMonth: { value: newThisMonth, change: percentChange(newThisMonth, newLastMonth) },
            repeatRate: { value: current.repeatRate, change: percentChange(current.repeatRate, previous.repeatRate) },
            averageLifetimeValue: {
                value: current.averageLifetimeValue,
                change: percentChange(current.averageLifetimeValue, previous.averageLifetimeValue),
            },
        };
    },

    getCustomerProfile: async (userId: string) => {
        const customer = await prisma.user.findFirst({
            where: { id: userId, role: UserRole.CUSTOMER, deletedAt: null },
            select: customerProfileSelect,
        });

        if (!customer) {
            throw new AppError("Customer not found", 404);
        }

        const [revenue, lastOrder, openOrders] = await Promise.all([
            prisma.order.aggregate({
                where: { userId, status: { notIn: NON_REVENUE_STATUSES } },
                _sum: { total: true },
                _count: { _all: true },
            }),
            prisma.order.findFirst({ where: { userId }, select: { createdAt: true }, orderBy: { createdAt: "desc" } }),
            prisma.order.findMany({
                where: { userId, status: { in: OPEN_ORDER_STATUSES } },
                select: { orderNumber: true },
                orderBy: { createdAt: "desc" },
                take: 3,
            }),
        ]);

        const { sessions, cart, _count, ...profile } = customer;
        const lifetimeValue = toNumber(revenue._sum.total);
        const cartItems = cart?.items ?? [];
        const cartUpdatedAt = [cart?.updatedAt, ...cartItems.map((item) => item.updatedAt)]
            .filter((value): value is Date => !!value)
            .sort((a, b) => b.getTime() - a.getTime())[0];

        return {
            ...profile,
            lastSeenAt: sessions[0]?.updatedAt ?? null,
            stats: {
                orderCount: _count.orders,
                lifetimeValue,
                averageOrderValue: revenue._count._all ? Math.round(lifetimeValue / revenue._count._all) : 0,
                lastOrderAt: lastOrder?.createdAt ?? null,
            },
            openOrders: openOrders.map((order) => order.orderNumber),
            cart: {
                updatedAt: cartUpdatedAt ?? null,
                items: cartItems.map(({ updatedAt: _updatedAt, ...item }) => item),
            },
        };
    },

    getCustomerOrders: async (userId: string, query: PaginationQuery) => {
        const exists = await prisma.user.findFirst({
            where: { id: userId, role: UserRole.CUSTOMER, deletedAt: null },
            select: { id: true },
        });

        if (!exists) {
            throw new AppError("Customer not found", 404);
        }

        const where: Prisma.OrderWhereInput = { userId };

        const [orders, total] = await prisma.$transaction([
            prisma.order.findMany({
                where,
                select: {
                    id: true,
                    orderNumber: true,
                    createdAt: true,
                    total: true,
                    paymentMethod: true,
                    status: true,
                    items: { select: { quantity: true } },
                },
                orderBy: { createdAt: "desc" },
                ...getPagination(query),
            }),
            prisma.order.count({ where }),
        ]);

        return {
            orders: orders.map(({ items, ...order }) => ({
                ...order,
                itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
            })),
            meta: paginationMeta(query, total),
        };
    },

    adjustCustomerPoints: async (userId: string, payload: AdjustPointsPayload) => {
        const customer = await prisma.user.findFirst({
            where: { id: userId, role: UserRole.CUSTOMER, deletedAt: null },
            select: { points: true },
        });

        if (!customer) {
            throw new AppError("Customer not found", 404);
        }

        if (customer.points + payload.delta < 0) {
            throw new AppError("Can’t remove more than the balance", 400);
        }

        return prisma.user.update({
            where: { id: userId },
            data: { points: { increment: payload.delta } },
            select: { id: true, points: true },
        });
    },

    getTrashedUsers: async (query: GetAllUsersQuery) => {
        return userService.getAllUsers(query, { deletedAt: { not: null } }, { deletedAt: "desc" });
    },

    getUserById: async (userId: string) => {
        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: userSelect,
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        return user;
    },

    updateUser: async (actor: IActor, userId: string, payload: UpdateUserPayload, file: Express.Multer.File | undefined) => {
        if (!file && Object.keys(payload).length === 0) {
            throw new AppError("Provide at least one field or an image to update", 400);
        }

        const target = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: { role: true, phone: true, imageKey: true },
        });

        if (!target) {
            throw new AppError("User not found", 404);
        }

        if (actor.id === userId) {
            if (payload.role !== undefined && payload.role !== target.role) {
                throw new AppError("You cannot change your own role", 403);
            }
            if (payload.isBanned === true) {
                throw new AppError("You cannot ban your own account", 403);
            }
        }

        if (target.role === UserRole.SUPER_ADMIN && payload.role !== undefined && payload.role !== UserRole.SUPER_ADMIN) {
            const superAdminCount = await prisma.user.count({
                where: { role: UserRole.SUPER_ADMIN, deletedAt: null },
            });

            if (superAdminCount <= 1) {
                throw new AppError("The last super admin cannot be demoted", 409);
            }
        }

        if (actor.role === UserRole.ADMIN) {
            if (target.role === UserRole.SUPER_ADMIN) {
                throw new AppError("Admin cannot update a super admin", 403);
            }
            if (payload.role === UserRole.SUPER_ADMIN) {
                throw new AppError("Admin cannot assign the super admin role", 403);
            }
        }

        if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.ADMIN) {
            if (actor.id !== userId) {
                throw new AppError("You can only update your own profile", 403);
            }
            if (payload.role !== undefined || payload.isBanned !== undefined) {
                throw new AppError("You cannot update role or ban status", 403);
            }
        }

        const phoneChanged = payload.phone !== undefined && payload.phone !== target.phone;

        if (phoneChanged && payload.phone) {
            const phoneTaken = await prisma.user.findFirst({
                where: { phone: payload.phone, NOT: { id: userId } },
                select: { id: true },
            });

            if (phoneTaken) {
                throw new AppError("An account with this phone number already exists", 409);
            }
        }

        const roleChanged = payload.role !== undefined && payload.role !== target.role;
        const signOutUser = roleChanged || payload.isBanned === true;

        const uploaded = file ? await uploadFile(file, "users") : null;

        let user;
        try {
            [user] = await prisma.$transaction([
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        ...payload,
                        ...(phoneChanged && { phoneVerified: false }),
                        ...(uploaded && { image: getFileUrl(uploaded.key), imageKey: uploaded.key }),
                    },
                    select: userSelect,
                }),
                ...(signOutUser ? [prisma.session.deleteMany({ where: { userId } })] : []),
            ]);
        } catch (error) {
            if (uploaded) await deleteFile(uploaded.key);
            throw error;
        }

        if (uploaded && target.imageKey) {
            await deleteFile(target.imageKey);
        }

        return user;
    },

    moveToTrash: async (actor: IActor, userId: string) => {
        if (actor.id === userId) {
            throw new AppError("You cannot move your own account to trash", 400);
        }

        const target = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: { role: true },
        });

        if (!target) {
            throw new AppError("User not found", 404);
        }

        if (actor.role === UserRole.ADMIN && target.role === UserRole.SUPER_ADMIN) {
            throw new AppError("Admin cannot move a super admin to trash", 403);
        }

        await prisma.$transaction([
            prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
            prisma.session.deleteMany({ where: { userId } }),
        ]);
    },

    restoreUser: async (actor: IActor, userId: string) => {
        const target = await prisma.user.findFirst({
            where: { id: userId, deletedAt: { not: null } },
            select: { role: true },
        });

        if (!target) {
            throw new AppError("User not found in trash", 404);
        }

        if (actor.role === UserRole.ADMIN && target.role === UserRole.SUPER_ADMIN) {
            throw new AppError("Admin cannot restore a super admin", 403);
        }

        return prisma.user.update({
            where: { id: userId },
            data: { deletedAt: null },
            select: userSelect,
        });
    },

    hardDeleteUser: async (actor: IActor, userId: string) => {
        if (actor.id === userId) {
            throw new AppError("You cannot delete your own account", 400);
        }

        const target = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        if (!target) {
            throw new AppError("User not found", 404);
        }

        await prisma.user.delete({ where: { id: userId } });
    },
}
