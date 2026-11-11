import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { ProductStatus } from "../../generated/prisma/enums";
import { getPagination, paginationMeta } from "../../shared/pagination";
import type { AddToWishlistPayload, GetWishlistQuery, MergeWishlistPayload } from "./wishlist.validation";

const wishlistSelect = {
    id: true,
    createdAt: true,
    product: {
        select: {
            id: true,
            name: true,
            slug: true,
            image: true,
            price: true,
            discountPrice: true,
            stock: true,
        },
    },
} satisfies Prisma.WishlistSelect;

const liveProduct: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE, deletedAt: null };

export const wishlistService = {
    addToWishlist: async (userId: string, payload: AddToWishlistPayload) => {
        const product = await prisma.product.findFirst({
            where: { ...liveProduct, id: payload.productId },
            select: { id: true },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        return prisma.wishlist.upsert({
            where: { userId_productId: { userId, productId: payload.productId } },
            create: { userId, productId: payload.productId },
            update: {},
            select: wishlistSelect,
        });
    },

    getMyWishlist: async (userId: string, query: GetWishlistQuery) => {
        const where: Prisma.WishlistWhereInput = { userId, product: liveProduct };

        const [wishlist, total] = await prisma.$transaction([
            prisma.wishlist.findMany({
                where,
                select: wishlistSelect,
                orderBy: { createdAt: "desc" },
                ...getPagination(query),
            }),
            prisma.wishlist.count({ where }),
        ]);

        return { wishlist, meta: paginationMeta(query, total) };
    },

    getMyWishlistProductIds: async (userId: string) => {
        const items = await prisma.wishlist.findMany({
            where: { userId, product: liveProduct },
            select: { productId: true },
        });

        return items.map((item) => item.productId);
    },

    removeFromWishlist: async (userId: string, productId: string) => {
        const result = await prisma.wishlist.deleteMany({
            where: { userId, productId },
        });

        if (result.count === 0) {
            throw new AppError("This product is not in your wishlist", 404);
        }
    },

    mergeWishlist: async (userId: string, payload: MergeWishlistPayload) => {
        const products = await prisma.product.findMany({
            where: { ...liveProduct, id: { in: payload.productIds } },
            select: { id: true },
        });

        const result = await prisma.wishlist.createMany({
            data: products.map((product) => ({ userId, productId: product.id })),
            skipDuplicates: true,
        });

        return {
            added: result.count,
            skipped: payload.productIds.length - result.count,
        };
    },
};
