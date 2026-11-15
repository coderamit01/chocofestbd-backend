import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { generateSlug } from "../../helpers/generateSlug";
import type { Prisma } from "../../generated/prisma/client";
import { ProductStatus } from "../../generated/prisma/enums";
import { getThumbnailUrl } from "../../lib/storage";
import { getPagination, paginationMeta } from "../../shared/pagination";
import { productListSelect } from "../product/product.service";
import type {
    CreateCollectionPayload,
    GetAllCollectionsQuery,
    GetCollectionProductsQuery,
    GetHomeCollectionsQuery,
    SetCollectionProductsPayload,
    UpdateCollectionPayload,
} from "./collection.validation";

const collectionSelect = {
    id: true,
    title: true,
    slug: true,
    description: true,
    position: true,
    isActive: true,
    showOnHome: true,
    startsAt: true,
    endsAt: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { products: true } },
} satisfies Prisma.CollectionSelect;

const publicCollectionSelect = {
    id: true,
    title: true,
    slug: true,
    description: true,
    endsAt: true,
} satisfies Prisma.CollectionSelect;

const publicProductWhere: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE, deletedAt: null };

const liveCollectionWhere = (now: Date): Prisma.CollectionWhereInput => ({
    isActive: true,
    AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
});

const productOrder: Prisma.CollectionProductOrderByWithRelationInput[] = [{ position: "asc" }, { createdAt: "asc" }];

type ProductListItem = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;

const toProductCard = ({ imageKey, ...product }: ProductListItem) => ({
    ...product,
    thumbnail: getThumbnailUrl(imageKey),
});

const buildSlug = (title: string) => {
    const slug = generateSlug(title);

    if (!slug) {
        throw new AppError("Title must contain letters or numbers", 400);
    }

    return slug;
};

const ensureSlugAvailable = async (slug: string, excludeId?: string) => {
    const existing = await prisma.collection.findUnique({
        where: { slug },
        select: { id: true },
    });

    if (existing && existing.id !== excludeId) {
        throw new AppError("A collection with this title already exists", 409);
    }
};

const findCollection = async (collectionId: string) => {
    const collection = await prisma.collection.findUnique({
        where: { id: collectionId },
        select: { id: true, title: true, startsAt: true, endsAt: true },
    });

    if (!collection) {
        throw new AppError("Collection not found", 404);
    }

    return collection;
};

export const collectionService = {
    createCollection: async (payload: CreateCollectionPayload) => {
        const slug = buildSlug(payload.title);
        await ensureSlugAvailable(slug);

        return prisma.collection.create({
            data: { ...payload, slug },
            select: collectionSelect,
        });
    },

    getAllCollections: async (query: GetAllCollectionsQuery) => {
        const { isActive, showOnHome, searchTerm } = query;

        const where: Prisma.CollectionWhereInput = {
            ...(isActive !== undefined && { isActive }),
            ...(showOnHome !== undefined && { showOnHome }),
            ...(searchTerm && { title: { contains: searchTerm, mode: "insensitive" } }),
        };

        const [collections, total] = await prisma.$transaction([
            prisma.collection.findMany({
                where,
                select: collectionSelect,
                orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                ...getPagination(query),
            }),
            prisma.collection.count({ where }),
        ]);

        return { collections, meta: paginationMeta(query, total) };
    },

    getCollectionById: async (collectionId: string) => {
        const collection = await prisma.collection.findUnique({
            where: { id: collectionId },
            select: {
                ...collectionSelect,
                products: {
                    orderBy: productOrder,
                    select: {
                        position: true,
                        product: { select: { ...productListSelect, sku: true, status: true, deletedAt: true } },
                    },
                },
            },
        });

        if (!collection) {
            throw new AppError("Collection not found", 404);
        }

        const { products, ...rest } = collection;

        return {
            ...rest,
            products: products.map(({ position, product }) => ({ position, ...toProductCard(product) })),
        };
    },

    updateCollection: async (collectionId: string, payload: UpdateCollectionPayload) => {
        const existing = await findCollection(collectionId);

        const startsAt = payload.startsAt !== undefined ? payload.startsAt : existing.startsAt;
        const endsAt = payload.endsAt !== undefined ? payload.endsAt : existing.endsAt;

        if (startsAt && endsAt && endsAt <= startsAt) {
            throw new AppError("endsAt must be after startsAt", 400);
        }

        let slug: string | undefined;

        if (payload.title !== undefined && payload.title !== existing.title) {
            slug = buildSlug(payload.title);
            await ensureSlugAvailable(slug, collectionId);
        }

        return prisma.collection.update({
            where: { id: collectionId },
            data: { ...payload, ...(slug && { slug }) },
            select: collectionSelect,
        });
    },

    setCollectionProducts: async (collectionId: string, payload: SetCollectionProductsPayload) => {
        await findCollection(collectionId);

        const { productIds } = payload;

        if (productIds.length) {
            const found = await prisma.product.findMany({
                where: { id: { in: productIds }, deletedAt: null },
                select: { id: true },
            });

            if (found.length !== productIds.length) {
                const foundIds = new Set(found.map((product) => product.id));
                const missing = productIds.filter((id) => !foundIds.has(id));
                throw new AppError(`Products not found: ${missing.join(", ")}`, 404);
            }
        }

        await prisma.$transaction([
            prisma.collectionProduct.deleteMany({ where: { collectionId } }),
            prisma.collectionProduct.createMany({
                data: productIds.map((productId, position) => ({ collectionId, productId, position })),
            }),
        ]);

        return collectionService.getCollectionById(collectionId);
    },

    deleteCollection: async (collectionId: string) => {
        await findCollection(collectionId);

        await prisma.collection.delete({ where: { id: collectionId } });
    },

    getHomeCollections: async (query: GetHomeCollectionsQuery) => {
        const collections = await prisma.collection.findMany({
            where: { ...liveCollectionWhere(new Date()), showOnHome: true },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: {
                ...publicCollectionSelect,
                products: {
                    where: { product: publicProductWhere },
                    orderBy: productOrder,
                    take: query.productLimit,
                    select: { product: { select: productListSelect } },
                },
            },
        });

        return collections
            .filter((collection) => collection.products.length)
            .map(({ products, ...collection }) => ({
                ...collection,
                products: products.map(({ product }) => toProductCard(product)),
            }));
    },

    getCollectionBySlug: async (slug: string, query: GetCollectionProductsQuery) => {
        const collection = await prisma.collection.findFirst({
            where: { slug, ...liveCollectionWhere(new Date()) },
            select: publicCollectionSelect,
        });

        if (!collection) {
            throw new AppError("Collection not found", 404);
        }

        const where: Prisma.CollectionProductWhereInput = { collectionId: collection.id, product: publicProductWhere };

        const [items, total] = await prisma.$transaction([
            prisma.collectionProduct.findMany({
                where,
                orderBy: productOrder,
                select: { product: { select: productListSelect } },
                ...getPagination(query),
            }),
            prisma.collectionProduct.count({ where }),
        ]);

        return {
            collection: { ...collection, products: items.map(({ product }) => toProductCard(product)) },
            meta: paginationMeta(query, total),
        };
    },
};
