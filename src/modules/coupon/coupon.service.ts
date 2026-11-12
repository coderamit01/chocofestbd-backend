import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { Prisma } from "../../generated/prisma/client";
import { CouponScope, DiscountType, OrderStatus, ProductStatus } from "../../generated/prisma/enums";
import { paginationMeta, getPagination } from "../../shared/pagination";
import type {
    ApplyCouponPayload,
    CreateCouponPayload,
    GetAllCouponsQuery,
    UpdateCouponPayload,
} from "./coupon.validation";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const couponListSelect = {
    id: true,
    code: true,
    discountType: true,
    scope: true,
    discountValue: true,
    maxDiscountAmount: true,
    minOrderAmount: true,
    usageLimit: true,
    usageLimitPerUser: true,
    usedCount: true,
    startsAt: true,
    expiresAt: true,
    isActive: true,
    excludeSaleItems: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { products: true, categories: true, orders: true } },
} satisfies Prisma.CouponSelect;

const couponDetailSelect = {
    ...couponListSelect,
    products: { select: { product: { select: { id: true, name: true, slug: true, sku: true } } } },
    categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.CouponSelect;

type CouponRuleInput = {
    discountType: DiscountType;
    scope: CouponScope;
    discountValue: string;
    maxDiscountAmount: string | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    productCount: number;
    categoryCount: number;
};

const checkCouponRules = (rules: CouponRuleInput) => {
    const value = new Decimal(rules.discountValue);

    if (rules.discountType === DiscountType.PERCENTAGE && (value.lte(0) || value.gt(100))) {
        throw new AppError("Percentage discount must be more than 0 and at most 100", 400);
    }

    if (rules.discountType === DiscountType.FIXED && value.lte(0)) {
        throw new AppError("Fixed discount must be more than 0", 400);
    }

    if (rules.maxDiscountAmount !== null && rules.discountType !== DiscountType.PERCENTAGE) {
        throw new AppError("Max discount amount is only for percentage coupons", 400);
    }

    if (rules.startsAt && rules.expiresAt && rules.expiresAt <= rules.startsAt) {
        throw new AppError("Expiry date must be after the start date", 400);
    }

    if (rules.scope === CouponScope.PRODUCTS && rules.productCount === 0) {
        throw new AppError("Select at least one product for this coupon", 400);
    }

    if (rules.scope === CouponScope.CATEGORIES && rules.categoryCount === 0) {
        throw new AppError("Select at least one category for this coupon", 400);
    }
};

const checkLinkScope = (scope: CouponScope, productIds?: string[], categoryIds?: string[]) => {
    if (productIds?.length && scope !== CouponScope.PRODUCTS) {
        throw new AppError("Products can only be set when scope is PRODUCTS", 400);
    }

    if (categoryIds?.length && scope !== CouponScope.CATEGORIES) {
        throw new AppError("Categories can only be set when scope is CATEGORIES", 400);
    }
};

const ensureProductsExist = async (productIds: string[]) => {
    if (!productIds.length) return;

    const count = await prisma.product.count({ where: { id: { in: productIds }, deletedAt: null } });

    if (count !== productIds.length) {
        throw new AppError("One or more products were not found", 400);
    }
};

const ensureCategoriesExist = async (categoryIds: string[]) => {
    if (!categoryIds.length) return;

    const count = await prisma.category.count({ where: { id: { in: categoryIds }, deletedAt: null } });

    if (count !== categoryIds.length) {
        throw new AppError("One or more categories were not found", 400);
    }
};

const ensureCodeAvailable = async (code: string, excludeId?: string) => {
    const existing = await prisma.coupon.findFirst({
        where: { code, ...(excludeId && { NOT: { id: excludeId } }) },
        select: { deletedAt: true },
    });

    if (existing) {
        throw new AppError(
            existing.deletedAt ? "A coupon with this code already exists in trash" : "A coupon with this code already exists",
            409,
        );
    }
};

const findCouponOrThrow = async (couponId: string, trashed: boolean) => {
    const coupon = await prisma.coupon.findFirst({
        where: { id: couponId, deletedAt: trashed ? { not: null } : null },
        select: {
            id: true,
            code: true,
            discountType: true,
            scope: true,
            discountValue: true,
            maxDiscountAmount: true,
            startsAt: true,
            expiresAt: true,
            _count: { select: { products: true, categories: true } },
        },
    });

    if (!coupon) {
        throw new AppError(trashed ? "Coupon not found in trash" : "Coupon not found", 404);
    }

    return coupon;
};

const formatCoupon = <T extends { products?: { product: unknown }[]; categories?: { category: unknown }[] }>(coupon: T) => {
    const { products, categories, ...rest } = coupon;

    return {
        ...rest,
        ...(products && { products: products.map((item) => item.product) }),
        ...(categories && { categories: categories.map((item) => item.category) }),
    };
};

const expandCategoryIds = async (categoryIds: string[]) => {
    const all = await prisma.category.findMany({ where: { deletedAt: null }, select: { id: true, parentId: true } });
    const children = new Map<string, string[]>();

    for (const category of all) {
        if (!category.parentId) continue;
        children.set(category.parentId, [...(children.get(category.parentId) ?? []), category.id]);
    }

    const result = new Set(categoryIds);
    const queue = [...categoryIds];

    while (queue.length) {
        const id = queue.shift()!;

        for (const childId of children.get(id) ?? []) {
            if (!result.has(childId)) {
                result.add(childId);
                queue.push(childId);
            }
        }
    }

    return result;
};

const round = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export const couponService = {
    createCoupon: async (payload: CreateCouponPayload) => {
        const { productIds = [], categoryIds = [], ...data } = payload;
        const scope = data.scope ?? CouponScope.ALL;
        const discountValue = data.discountType === DiscountType.FREE_DELIVERY ? "0" : (data.discountValue ?? "0");

        checkLinkScope(scope, productIds, categoryIds);
        checkCouponRules({
            discountType: data.discountType,
            scope,
            discountValue,
            maxDiscountAmount: data.maxDiscountAmount ?? null,
            startsAt: data.startsAt ?? null,
            expiresAt: data.expiresAt ?? null,
            productCount: productIds.length,
            categoryCount: categoryIds.length,
        });

        await ensureCodeAvailable(data.code);
        await ensureProductsExist(productIds);
        await ensureCategoriesExist(categoryIds);

        const coupon = await prisma.coupon.create({
            data: {
                ...data,
                scope,
                discountValue,
                products: { create: productIds.map((productId) => ({ productId })) },
                categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
            },
            select: couponDetailSelect,
        });

        return formatCoupon(coupon);
    },

    getAllCoupons: async (
        query: GetAllCouponsQuery,
        scope: Prisma.CouponWhereInput = { deletedAt: null },
        orderBy: Prisma.CouponOrderByWithRelationInput = { createdAt: "desc" },
    ) => {
        const { isActive, discountType, scope: couponScope, searchTerm } = query;

        const where: Prisma.CouponWhereInput = {
            ...scope,
            ...(isActive !== undefined && { isActive }),
            ...(discountType && { discountType }),
            ...(couponScope && { scope: couponScope }),
            ...(searchTerm && { code: { contains: searchTerm, mode: "insensitive" } }),
        };

        const [coupons, total] = await prisma.$transaction([
            prisma.coupon.findMany({ where, select: couponListSelect, orderBy, ...getPagination(query) }),
            prisma.coupon.count({ where }),
        ]);

        return { coupons, meta: paginationMeta(query, total) };
    },

    getTrashedCoupons: async (query: GetAllCouponsQuery) => {
        return couponService.getAllCoupons(query, { deletedAt: { not: null } }, { deletedAt: "desc" });
    },

    getCouponById: async (couponId: string) => {
        const coupon = await prisma.coupon.findUnique({
            where: { id: couponId },
            select: couponDetailSelect,
        });

        if (!coupon) {
            throw new AppError("Coupon not found", 404);
        }

        return formatCoupon(coupon);
    },

    updateCoupon: async (couponId: string, payload: UpdateCouponPayload) => {
        const existing = await findCouponOrThrow(couponId, false);
        const { productIds, categoryIds, ...data } = payload;

        const discountType = data.discountType ?? existing.discountType;
        const scope = data.scope ?? existing.scope;
        const discountValue =
            discountType === DiscountType.FREE_DELIVERY
                ? "0"
                : (data.discountValue ?? existing.discountValue.toString());
        const maxDiscountAmount =
            data.maxDiscountAmount !== undefined ? data.maxDiscountAmount : (existing.maxDiscountAmount?.toString() ?? null);

        checkLinkScope(scope, productIds, categoryIds);

        const keepProducts = scope === CouponScope.PRODUCTS;
        const keepCategories = scope === CouponScope.CATEGORIES;

        checkCouponRules({
            discountType,
            scope,
            discountValue,
            maxDiscountAmount: discountType === DiscountType.PERCENTAGE ? maxDiscountAmount : (data.maxDiscountAmount ?? null),
            startsAt: data.startsAt !== undefined ? data.startsAt : existing.startsAt,
            expiresAt: data.expiresAt !== undefined ? data.expiresAt : existing.expiresAt,
            productCount: productIds?.length ?? existing._count.products,
            categoryCount: categoryIds?.length ?? existing._count.categories,
        });

        if (data.code && data.code !== existing.code) {
            await ensureCodeAvailable(data.code, couponId);
        }

        if (productIds) await ensureProductsExist(productIds);
        if (categoryIds) await ensureCategoriesExist(categoryIds);

        const coupon = await prisma.$transaction(async (tx) => {
            if (!keepProducts || productIds) {
                await tx.couponProduct.deleteMany({ where: { couponId } });
            }

            if (!keepCategories || categoryIds) {
                await tx.couponCategory.deleteMany({ where: { couponId } });
            }

            return tx.coupon.update({
                where: { id: couponId },
                data: {
                    ...data,
                    discountValue,
                    ...(discountType !== DiscountType.PERCENTAGE && { maxDiscountAmount: null }),
                    ...(keepProducts && productIds && { products: { create: productIds.map((productId) => ({ productId })) } }),
                    ...(keepCategories &&
                        categoryIds && { categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } }),
                },
                select: couponDetailSelect,
            });
        });

        return formatCoupon(coupon);
    },

    moveToTrash: async (couponId: string) => {
        await findCouponOrThrow(couponId, false);

        await prisma.coupon.update({
            where: { id: couponId },
            data: { deletedAt: new Date() },
        });
    },

    restoreCoupon: async (couponId: string) => {
        await findCouponOrThrow(couponId, true);

        const coupon = await prisma.coupon.update({
            where: { id: couponId },
            data: { deletedAt: null },
            select: couponDetailSelect,
        });

        return formatCoupon(coupon);
    },

    hardDeleteCoupon: async (couponId: string) => {
        const coupon = await prisma.coupon.findUnique({
            where: { id: couponId },
            select: { id: true, _count: { select: { orders: true } } },
        });

        if (!coupon) {
            throw new AppError("Coupon not found", 404);
        }

        if (coupon._count.orders > 0) {
            throw new AppError("This coupon is used in orders. Keep it in trash instead of deleting it", 409);
        }

        await prisma.coupon.delete({ where: { id: couponId } });
    },

    calculateDiscount: async (payload: ApplyCouponPayload, userId?: string) => {
        const coupon = await prisma.coupon.findFirst({
            where: { code: payload.code, isActive: true, deletedAt: null },
            select: {
                id: true,
                code: true,
                discountType: true,
                scope: true,
                discountValue: true,
                maxDiscountAmount: true,
                minOrderAmount: true,
                usageLimit: true,
                usageLimitPerUser: true,
                usedCount: true,
                startsAt: true,
                expiresAt: true,
                excludeSaleItems: true,
                products: { select: { productId: true } },
                categories: { select: { categoryId: true } },
            },
        });

        if (!coupon) {
            throw new AppError("Invalid coupon code", 404);
        }

        const now = new Date();

        if (coupon.startsAt && coupon.startsAt > now) {
            throw new AppError("This coupon is not active yet", 400);
        }

        if (coupon.expiresAt && coupon.expiresAt <= now) {
            throw new AppError("This coupon has expired", 400);
        }

        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            throw new AppError("This coupon has reached its usage limit", 400);
        }

        if (coupon.usageLimitPerUser !== null && (userId || payload.phone)) {
            const used = await prisma.order.count({
                where: {
                    couponId: coupon.id,
                    status: { not: OrderStatus.CANCELLED },
                    OR: [
                        ...(userId ? [{ userId }] : []),
                        ...(payload.phone ? [{ recipientPhone: payload.phone }] : []),
                    ],
                },
            });

            if (used >= coupon.usageLimitPerUser) {
                throw new AppError("You have already used this coupon", 400);
            }
        }

        const quantities = new Map<string, number>();

        for (const item of payload.items) {
            quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
        }

        const products = await prisma.product.findMany({
            where: { id: { in: [...quantities.keys()] }, status: ProductStatus.ACTIVE, deletedAt: null },
            select: { id: true, price: true, discountPrice: true, categoryId: true },
        });

        if (products.length !== quantities.size) {
            throw new AppError("One or more products are not available", 400);
        }

        const couponProductIds = new Set(coupon.products.map((item) => item.productId));
        const couponCategoryIds =
            coupon.scope === CouponScope.CATEGORIES
                ? await expandCategoryIds(coupon.categories.map((item) => item.categoryId))
                : new Set<string>();

        const lines = products.map((product) => {
            const onSale = product.discountPrice !== null && product.discountPrice.lt(product.price);
            const unitPrice = onSale ? product.discountPrice! : product.price;
            const lineTotal = unitPrice.mul(quantities.get(product.id)!);

            const inScope =
                coupon.scope === CouponScope.ALL ||
                (coupon.scope === CouponScope.PRODUCTS && couponProductIds.has(product.id)) ||
                (coupon.scope === CouponScope.CATEGORIES && couponCategoryIds.has(product.categoryId));

            return { productId: product.id, lineTotal, eligible: inScope && !(coupon.excludeSaleItems && onSale) };
        });

        const subtotal = lines.reduce((sum, line) => sum.add(line.lineTotal), new Decimal(0));
        const eligibleSubtotal = lines
            .filter((line) => line.eligible)
            .reduce((sum, line) => sum.add(line.lineTotal), new Decimal(0));

        if (coupon.minOrderAmount && subtotal.lt(coupon.minOrderAmount)) {
            throw new AppError(`Minimum order amount for this coupon is ${coupon.minOrderAmount.toString()}`, 400);
        }

        if (eligibleSubtotal.lte(0)) {
            throw new AppError("This coupon does not apply to the items in your cart", 400);
        }

        const freeDelivery = coupon.discountType === DiscountType.FREE_DELIVERY;
        let discountAmount = new Decimal(0);

        if (coupon.discountType === DiscountType.PERCENTAGE) {
            discountAmount = round(eligibleSubtotal.mul(coupon.discountValue).div(100));

            if (coupon.maxDiscountAmount && discountAmount.gt(coupon.maxDiscountAmount)) {
                discountAmount = coupon.maxDiscountAmount;
            }
        }

        if (coupon.discountType === DiscountType.FIXED) {
            discountAmount = Decimal.min(coupon.discountValue, eligibleSubtotal);
        }

        const eligibleLines = lines.filter((line) => line.eligible);
        let remaining = discountAmount;

        const items = lines.map((line) => {
            if (!line.eligible || discountAmount.isZero()) {
                return { productId: line.productId, lineTotal: line.lineTotal.toFixed(2), discountAmount: "0.00" };
            }

            const isLast = line === eligibleLines[eligibleLines.length - 1];
            const share = isLast ? remaining : round(discountAmount.mul(line.lineTotal).div(eligibleSubtotal));
            remaining = remaining.sub(share);

            return { productId: line.productId, lineTotal: line.lineTotal.toFixed(2), discountAmount: share.toFixed(2) };
        });

        const deliveryDiscount = freeDelivery && payload.deliveryCharge ? new Decimal(payload.deliveryCharge) : new Decimal(0);

        return {
            coupon: { id: coupon.id, code: coupon.code, discountType: coupon.discountType },
            subtotal: subtotal.toFixed(2),
            eligibleSubtotal: eligibleSubtotal.toFixed(2),
            discountAmount: discountAmount.toFixed(2),
            freeDelivery,
            deliveryDiscount: deliveryDiscount.toFixed(2),
            items,
        };
    },
};
