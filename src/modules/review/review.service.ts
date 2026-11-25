import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { OrderStatus, ProductStatus, ReviewStatus } from "../../generated/prisma/enums";
import { deleteFile, getFileUrl, uploadFile } from "../../lib/storage";
import { getPagination, paginationMeta } from "../../shared/pagination";
import { notify } from "../notification/notification.service";
import type {
    BulkUpdateReviewStatusPayload,
    CreateReviewPayload,
    GetAllReviewsQuery,
    GetProductReviewsQuery,
    ReviewSortOption,
    UpdateReviewPayload,
    UpdateReviewStatusPayload,
} from "./review.validation";

type Tx = Prisma.TransactionClient;

const reviewSortOrders: Record<ReviewSortOption, Prisma.ProductReviewOrderByWithRelationInput[]> = {
    newest: [{ createdAt: "desc" }],
    oldest: [{ createdAt: "asc" }],
    highest: [{ rating: "desc" }, { createdAt: "desc" }],
    lowest: [{ rating: "asc" }, { createdAt: "desc" }],
};

const publicReviewSelect = {
    id: true,
    rating: true,
    comment: true,
    image: true,
    isVerifiedPurchase: true,
    createdAt: true,
    updatedAt: true,
    user: { select: { name: true, image: true } },
} satisfies Prisma.ProductReviewSelect;

const myReviewSelect = {
    id: true,
    rating: true,
    comment: true,
    image: true,
    isVerifiedPurchase: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    product: { select: { id: true, name: true, slug: true, image: true } },
} satisfies Prisma.ProductReviewSelect;

const adminReviewSelect = {
    ...myReviewSelect,
    user: { select: { id: true, name: true, email: true, phone: true, image: true } },
} satisfies Prisma.ProductReviewSelect;

const recalculateProductRating = async (tx: Tx, productId: string) => {
    const result = await tx.productReview.aggregate({
        where: { productId, status: ReviewStatus.APPROVED },
        _avg: { rating: true },
        _count: { _all: true },
    });

    const average = result._avg.rating ?? 0;

    await tx.product.update({
        where: { id: productId },
        data: {
            averageRating: Math.round(average * 10) / 10,
            reviewCount: result._count._all,
        },
    });
};

const hasDeliveredOrder = async (userId: string, productId: string) => {
    const order = await prisma.order.findFirst({
        where: { userId, status: OrderStatus.DELIVERED, items: { some: { productId } } },
        select: { id: true },
    });

    return Boolean(order);
};

const findOwnReview = async (userId: string, reviewId: string) => {
    const review = await prisma.productReview.findFirst({
        where: { id: reviewId, userId },
        select: { id: true, productId: true, status: true, imageKey: true },
    });

    if (!review) {
        throw new AppError("Review not found", 404);
    }

    return review;
};

export const reviewService = {
    createReview: async (userId: string, payload: CreateReviewPayload, file: Express.Multer.File | undefined) => {
        const product = await prisma.product.findFirst({
            where: { id: payload.productId, status: ProductStatus.ACTIVE, deletedAt: null },
            select: { id: true, name: true },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        const existing = await prisma.productReview.findUnique({
            where: { userId_productId: { userId, productId: payload.productId } },
            select: { id: true },
        });

        if (existing) {
            throw new AppError("You have already reviewed this product. Edit your review instead", 409);
        }

        const isVerifiedPurchase = await hasDeliveredOrder(userId, payload.productId);
        const key = file ? (await uploadFile(file, "reviews")).key : null;

        let review;

        try {
            review = await prisma.productReview.create({
                data: {
                    ...payload,
                    userId,
                    isVerifiedPurchase,
                    ...(key && { image: getFileUrl(key), imageKey: key }),
                },
                select: myReviewSelect,
            });
        } catch (error) {
            if (key) await deleteFile(key);
            throw error;
        }

        void notify("review.pending", {
            title: `New review for ${product.name}`,
            message: `${payload.rating}★${isVerifiedPurchase ? " · Verified purchase" : ""} · Waiting for approval`,
            link: "/admin/reviews?status=PENDING",
            data: { productId: product.id },
        });

        return review;
    },

    getProductReviews: async (productId: string, query: GetProductReviewsQuery) => {
        const product = await prisma.product.findFirst({
            where: { id: productId, deletedAt: null },
            select: { averageRating: true, reviewCount: true },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        const base: Prisma.ProductReviewWhereInput = { productId, status: ReviewStatus.APPROVED };

        const where: Prisma.ProductReviewWhereInput = {
            ...base,
            ...(query.rating && { rating: query.rating }),
            ...(query.verified !== undefined && { isVerifiedPurchase: query.verified }),
            ...(query.withImage === true && { image: { not: null } }),
            ...(query.withImage === false && { image: null }),
        };

        const [reviews, total, groups] = await prisma.$transaction([
            prisma.productReview.findMany({
                where,
                select: publicReviewSelect,
                orderBy: reviewSortOrders[query.sort],
                ...getPagination(query),
            }),
            prisma.productReview.count({ where }),
            prisma.productReview.groupBy({
                by: ["rating"],
                where: base,
                _count: { _all: true },
                orderBy: { rating: "desc" },
            }),
        ]);

        const breakdown = [5, 4, 3, 2, 1].map((rating) => ({
            rating,
            count: groups.find((group) => group.rating === rating)?._count?._all ?? 0,
        }));

        return {
            summary: {
                averageRating: product.averageRating.toString(),
                reviewCount: product.reviewCount,
                breakdown,
            },
            reviews,
            meta: paginationMeta(query, total),
        };
    },

    getMyReviews: async (userId: string) => {
        return prisma.productReview.findMany({
            where: { userId },
            select: myReviewSelect,
            orderBy: { createdAt: "desc" },
        });
    },

    updateMyReview: async (
        userId: string,
        reviewId: string,
        payload: UpdateReviewPayload,
        file: Express.Multer.File | undefined,
    ) => {
        const { removeImage, ...data } = payload;

        if (Object.keys(data).length === 0 && !file && !removeImage) {
            throw new AppError("Provide at least one field to update", 400);
        }

        const existing = await findOwnReview(userId, reviewId);
        const key = file ? (await uploadFile(file, "reviews")).key : null;

        let review;

        try {
            review = await prisma.$transaction(async (tx) => {
                const updated = await tx.productReview.update({
                    where: { id: reviewId },
                    data: {
                        ...data,
                        status: ReviewStatus.PENDING,
                        ...(key && { image: getFileUrl(key), imageKey: key }),
                        ...(!key && removeImage && { image: null, imageKey: null }),
                    },
                    select: myReviewSelect,
                });

                if (existing.status === ReviewStatus.APPROVED) {
                    await recalculateProductRating(tx, existing.productId);
                }

                return updated;
            });
        } catch (error) {
            if (key) await deleteFile(key);
            throw error;
        }

        if (existing.imageKey && (key || removeImage)) {
            await deleteFile(existing.imageKey);
        }

        return review;
    },

    deleteMyReview: async (userId: string, reviewId: string) => {
        const existing = await findOwnReview(userId, reviewId);

        await reviewService.removeReview(existing);
    },

    getAllReviews: async (query: GetAllReviewsQuery) => {
        const where: Prisma.ProductReviewWhereInput = {
            ...(query.status && { status: query.status }),
            ...(query.rating && { rating: query.rating }),
            ...(query.productId && { productId: query.productId }),
            ...(query.verified !== undefined && { isVerifiedPurchase: query.verified }),
            ...(query.searchTerm && {
                OR: [
                    { comment: { contains: query.searchTerm, mode: "insensitive" } },
                    { product: { name: { contains: query.searchTerm, mode: "insensitive" } } },
                    { user: { name: { contains: query.searchTerm, mode: "insensitive" } } },
                ],
            }),
        };

        const [reviews, total] = await prisma.$transaction([
            prisma.productReview.findMany({
                where,
                select: adminReviewSelect,
                orderBy: reviewSortOrders[query.sort],
                ...getPagination(query),
            }),
            prisma.productReview.count({ where }),
        ]);

        return { reviews, meta: paginationMeta(query, total) };
    },

    getReviewById: async (reviewId: string) => {
        const review = await prisma.productReview.findUnique({
            where: { id: reviewId },
            select: adminReviewSelect,
        });

        if (!review) {
            throw new AppError("Review not found", 404);
        }

        return review;
    },

    getReviewSummary: async () => {
        const [byStatus, byRating, average] = await prisma.$transaction([
            prisma.productReview.groupBy({ by: ["status"], _count: { _all: true }, orderBy: { status: "asc" } }),
            prisma.productReview.groupBy({
                by: ["rating"],
                where: { status: ReviewStatus.APPROVED },
                _count: { _all: true },
                orderBy: { rating: "desc" },
            }),
            prisma.productReview.aggregate({ where: { status: ReviewStatus.APPROVED }, _avg: { rating: true } }),
        ]);

        const statusCount = (status: ReviewStatus) => {
            const row = byStatus.find((group) => group.status === status);
            return row?._count && typeof row._count === "object" ? (row._count._all ?? 0) : 0;
        };

        const breakdown = [5, 4, 3, 2, 1].map((rating) => {
            const row = byRating.find((group) => group.rating === rating);
            return { rating, count: row?._count && typeof row._count === "object" ? (row._count._all ?? 0) : 0 };
        });

        return {
            counts: {
                PENDING: statusCount(ReviewStatus.PENDING),
                APPROVED: statusCount(ReviewStatus.APPROVED),
                REJECTED: statusCount(ReviewStatus.REJECTED),
            },
            averageRating: Math.round((average._avg.rating ?? 0) * 10) / 10,
            approvedCount: breakdown.reduce((sum, row) => sum + row.count, 0),
            breakdown,
        };
    },

    bulkUpdateReviewStatus: async (payload: BulkUpdateReviewStatusPayload) => {
        const reviews = await prisma.productReview.findMany({
            where: { id: { in: payload.reviewIds } },
            select: { id: true, productId: true, status: true },
        });

        if (reviews.length !== payload.reviewIds.length) {
            throw new AppError("One or more reviews were not found", 404);
        }

        const changed = reviews.filter((review) => review.status !== payload.status);
        const productIds = [...new Set(changed.map((review) => review.productId))];

        await prisma.$transaction(async (tx) => {
            await tx.productReview.updateMany({
                where: { id: { in: changed.map((review) => review.id) } },
                data: { status: payload.status },
            });

            for (const productId of productIds) {
                await recalculateProductRating(tx, productId);
            }
        });

        return { updated: changed.length };
    },

    updateReviewStatus: async (reviewId: string, payload: UpdateReviewStatusPayload) => {
        const existing = await prisma.productReview.findUnique({
            where: { id: reviewId },
            select: { productId: true, status: true },
        });

        if (!existing) {
            throw new AppError("Review not found", 404);
        }

        return prisma.$transaction(async (tx) => {
            const review = await tx.productReview.update({
                where: { id: reviewId },
                data: { status: payload.status },
                select: adminReviewSelect,
            });

            if (existing.status !== payload.status) {
                await recalculateProductRating(tx, existing.productId);
            }

            return review;
        });
    },

    deleteReview: async (reviewId: string) => {
        const existing = await prisma.productReview.findUnique({
            where: { id: reviewId },
            select: { id: true, productId: true, status: true, imageKey: true },
        });

        if (!existing) {
            throw new AppError("Review not found", 404);
        }

        await reviewService.removeReview(existing);
    },

    removeReview: async (review: { id: string; productId: string; status: ReviewStatus; imageKey: string | null }) => {
        await prisma.$transaction(async (tx) => {
            await tx.productReview.delete({ where: { id: review.id } });

            if (review.status === ReviewStatus.APPROVED) {
                await recalculateProductRating(tx, review.productId);
            }
        });

        if (review.imageKey) {
            await deleteFile(review.imageKey);
        }
    },
};
