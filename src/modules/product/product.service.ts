import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { generateSlug } from "../../helpers/generateSlug";
import type { Prisma } from "../../generated/prisma/client";
import { ProductStatus, UserRole } from "../../generated/prisma/enums";
import { deleteFile, getFileUrl, getThumbnailUrl, uploadFile } from "../../lib/storage";
import { getPagination, paginationMeta } from "../../shared/pagination";
import { buildRangeFilter, buildSearchFilter } from "../../shared/filters";
import type { ProductFiles } from "./product.interface";
import type {
    CreateProductPayload,
    GetAdminProductsQuery,
    GetAllProductsQuery,
    GetTrashedProductsQuery,
    ProductSortOption,
    UpdateProductPayload,
} from "./product.validation";

const MAX_GALLERY_IMAGES = 8;

const COST_PRICE_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT];

const canSeeCostPrice = (role: UserRole | undefined) => role !== undefined && COST_PRICE_ROLES.includes(role);

const productSelect = {
    id: true,
    name: true,
    slug: true,
    sku: true,
    shortDescription: true,
    description: true,
    image: true,
    price: true,
    discountPrice: true,
    stock: true,
    lowStockThreshold: true,
    status: true,
    isFeatured: true,
    category: { select: { id: true, name: true, slug: true } },
    brand: { select: { id: true, name: true, slug: true } },
    tags: { select: { id: true, name: true, slug: true } },
    imageGallery: {
        select: { id: true, url: true, alt: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
    },
    soldCount: true,
    averageRating: true,
    reviewCount: true,
    metaTitle: true,
    metaDescription: true,
    metaImage: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.ProductSelect;

const productListSelect = {
    id: true,
    name: true,
    slug: true,
    image: true,
    imageKey: true,
    price: true,
    discountPrice: true,
    stock: true,
    isFeatured: true,
    averageRating: true,
    reviewCount: true,
    category: { select: { id: true, name: true, slug: true } },
    brand: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductSelect;

const productAdminListSelect = {
    ...productListSelect,
    sku: true,
    status: true,
    lowStockThreshold: true,
    updatedAt: true,
} satisfies Prisma.ProductSelect;

const productSortOrders: Record<ProductSortOption, Prisma.ProductOrderByWithRelationInput[]> = {
    newest: [{ createdAt: "desc" }],
    price_low: [{ price: "asc" }],
    price_high: [{ price: "desc" }],
    popular: [{ soldCount: "desc" }, { createdAt: "desc" }],
    rating: [{ averageRating: "desc" }, { reviewCount: "desc" }],
};

const makeSlug = async (name: string) => {
    const baseSlug = generateSlug(name);

    if (!baseSlug) {
        throw new AppError("Name must contain letters or numbers", 400);
    }

    let slug = baseSlug;
    let number = 2;

    while (true) {
        const found = await prisma.product.findUnique({ where: { slug }, select: { id: true } });

        if (!found) {
            return slug;
        }

        slug = `${baseSlug}-${number}`;
        number++;
    }
};

const makeSku = async () => {
    for (let i = 0; i < 5; i++) {
        const sku = `CF-${randomBytes(4).toString("hex").toUpperCase()}`;
        const found = await prisma.product.findUnique({ where: { sku }, select: { id: true } });

        if (!found) {
            return sku;
        }
    }

    throw new AppError("Could not create a SKU, please enter one", 500);
};

const buildProductFilters = async (query: GetAllProductsQuery, onlyActiveCategories: boolean) => {
    const { searchTerm, category, brand, tag, minPrice, maxPrice, minRating, inStock, isFeatured } = query;

    const filters: Prisma.ProductWhereInput[] = [
        { deletedAt: null },
        buildSearchFilter<Prisma.ProductWhereInput>(searchTerm, ["name", "sku"]),
    ];

    if (category) {
        const categoryWhere: Prisma.CategoryWhereInput = { deletedAt: null };

        if (onlyActiveCategories) {
            categoryWhere.isActive = true;
        }

        const foundCategory = await prisma.category.findFirst({
            where: { ...categoryWhere, slug: category },
            select: {
                id: true,
                children: {
                    where: categoryWhere,
                    select: { id: true },
                },
            },
        });

        if (!foundCategory) {
            throw new AppError("Category not found", 404);
        }

        const categoryIds = [foundCategory.id, ...foundCategory.children.map((child) => child.id)];
        filters.push({ categoryId: { in: categoryIds } });
    }

    if (brand) {
        filters.push({ brand: { slug: brand, deletedAt: null } });
    }

    if (tag) {
        filters.push({ tags: { some: { slug: tag } } });
    }

    const priceRange = buildRangeFilter(minPrice, maxPrice);

    if (priceRange) {
        filters.push({
            OR: [
                { discountPrice: null, price: priceRange },
                { discountPrice: priceRange },
            ],
        });
    }

    if (minRating !== undefined) {
        filters.push({ averageRating: { gte: minRating } });
    }

    if (inStock === true) {
        filters.push({ stock: { gt: 0 } });
    }

    if (inStock === false) {
        filters.push({ stock: 0 });
    }

    if (isFeatured !== undefined) {
        filters.push({ isFeatured });
    }

    return filters;
};

export const productService = {
    getAllProducts: async (query: GetAllProductsQuery) => {
        const filters = await buildProductFilters(query, true);
        filters.push({ status: ProductStatus.ACTIVE });

        const where: Prisma.ProductWhereInput = { AND: filters };

        const [products, total] = await prisma.$transaction([
            prisma.product.findMany({
                where,
                select: productListSelect,
                orderBy: productSortOrders[query.sortBy],
                ...getPagination(query),
            }),
            prisma.product.count({ where }),
        ]);

        const productList = products.map(({ imageKey, ...product }) => ({
            ...product,
            thumbnail: getThumbnailUrl(imageKey),
        }));

        return { products: productList, meta: paginationMeta(query, total) };
    },

    getAdminProducts: async (query: GetAdminProductsQuery, role: UserRole) => {
        const filters = await buildProductFilters(query, false);

        if (query.status) {
            filters.push({ status: query.status });
        }

        const where: Prisma.ProductWhereInput = { AND: filters };

        const [products, total] = await prisma.$transaction([
            prisma.product.findMany({
                where,
                select: { ...productAdminListSelect, costPrice: canSeeCostPrice(role) },
                orderBy: productSortOrders[query.sortBy],
                ...getPagination(query),
            }),
            prisma.product.count({ where }),
        ]);

        const productList = products.map(({ imageKey, ...product }) => ({
            ...product,
            thumbnail: getThumbnailUrl(imageKey),
        }));

        return { products: productList, meta: paginationMeta(query, total) };
    },

    getProductById: async (productId: string) => {
        const product = await prisma.product.findFirst({
            where: { id: productId, status: ProductStatus.ACTIVE, deletedAt: null },
            select: productSelect,
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        return product;
    },

    getProductBySlug: async (slug: string) => {
        const product = await prisma.product.findFirst({
            where: { slug, status: ProductStatus.ACTIVE, deletedAt: null },
            select: productSelect,
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        return product;
    },

    createProduct: async (payload: CreateProductPayload, files: ProductFiles | undefined, role: UserRole) => {
        const imageFile = files?.image?.[0];
        const metaImageFile = files?.metaImage?.[0];
        const galleryFiles = files?.gallery ?? [];
        const status = payload.status ?? ProductStatus.ACTIVE;

        if (payload.costPrice !== undefined && !canSeeCostPrice(role)) {
            throw new AppError("You are not allowed to set the cost price", 403);
        }

        if (status === ProductStatus.ACTIVE && !imageFile) {
            throw new AppError("An active product needs a main image. Upload an image or save it as a draft", 400);
        }

        const category = await prisma.category.findFirst({
            where: { id: payload.categoryId, deletedAt: null },
            select: { id: true },
        });

        if (!category) {
            throw new AppError("Category not found", 404);
        }

        if (payload.brandId) {
            const brand = await prisma.brand.findFirst({
                where: { id: payload.brandId, deletedAt: null },
                select: { id: true },
            });

            if (!brand) {
                throw new AppError("Brand not found", 404);
            }
        }

        if (payload.tagIds?.length) {
            const tagCount = await prisma.tag.count({ where: { id: { in: payload.tagIds } } });

            if (tagCount !== payload.tagIds.length) {
                throw new AppError("One or more tags were not found", 404);
            }
        }

        if (payload.sku) {
            const skuUsed = await prisma.product.findUnique({ where: { sku: payload.sku }, select: { id: true } });

            if (skuUsed) {
                throw new AppError("A product with this SKU already exists", 409);
            }
        }

        const slug = await makeSlug(payload.name);
        const sku = payload.sku ?? (await makeSku());

        const savedFiles: string[] = [];

        try {
            let imageKey: string | null = null;

            if (imageFile) {
                const result = await uploadFile(imageFile, "products", { thumbnail: true });
                imageKey = result.key;
                savedFiles.push(result.key);
            }

            let metaImageKey = imageKey;

            if (metaImageFile) {
                const result = await uploadFile(metaImageFile, "products");
                metaImageKey = result.key;
                savedFiles.push(result.key);
            }

            const galleryKeys: string[] = [];

            for (const file of galleryFiles) {
                const result = await uploadFile(file, "products", { thumbnail: true });
                galleryKeys.push(result.key);
                savedFiles.push(result.key);
            }

            const { tagIds, ...productData } = payload;

            return await prisma.product.create({
                data: {
                    ...productData,
                    status,
                    slug,
                    sku,
                    image: getFileUrl(imageKey),
                    imageKey,
                    metaImage: getFileUrl(metaImageKey),
                    metaImageKey,
                    tags: {
                        connect: (tagIds ?? []).map((id) => ({ id })),
                    },
                    imageGallery: {
                        create: galleryKeys.map((key, index) => ({
                            url: getFileUrl(key) as string,
                            key,
                            alt: payload.name,
                            sortOrder: index,
                        })),
                    },
                },
                select: { ...productSelect, costPrice: canSeeCostPrice(role) },
            });
        } catch (error) {
            for (const key of savedFiles) {
                await deleteFile(key);
            }

            throw error;
        }
    },

    updateProduct: async (
        productId: string,
        payload: UpdateProductPayload,
        files: ProductFiles | undefined,
        role: UserRole,
    ) => {
        const imageFile = files?.image?.[0];
        const metaImageFile = files?.metaImage?.[0];
        const galleryFiles = files?.gallery ?? [];
        const removeGalleryIds = payload.removeGalleryImageIds ?? [];

        const hasFiles = Boolean(imageFile || metaImageFile || galleryFiles.length);

        if (!hasFiles && Object.keys(payload).length === 0) {
            throw new AppError("Provide at least one field to update", 400);
        }

        if (payload.costPrice !== undefined && !canSeeCostPrice(role)) {
            throw new AppError("You are not allowed to set the cost price", 403);
        }

        const product = await prisma.product.findFirst({
            where: { id: productId, deletedAt: null },
            select: {
                name: true,
                sku: true,
                price: true,
                discountPrice: true,
                status: true,
                imageKey: true,
                metaImageKey: true,
                imageGallery: { select: { id: true, key: true, sortOrder: true } },
            },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        const newPrice = payload.price ?? product.price.toString();
        const newDiscountPrice =
            payload.discountPrice !== undefined ? payload.discountPrice : (product.discountPrice?.toString() ?? null);

        if (newDiscountPrice && Number(newDiscountPrice) >= Number(newPrice)) {
            throw new AppError("Discount price must be lower than the price", 400);
        }

        const newStatus = payload.status ?? product.status;
        const willHaveImage = Boolean(imageFile || product.imageKey);

        if (newStatus === ProductStatus.ACTIVE && !willHaveImage) {
            throw new AppError("An active product needs a main image", 400);
        }

        if (payload.categoryId) {
            const category = await prisma.category.findFirst({
                where: { id: payload.categoryId, deletedAt: null },
                select: { id: true },
            });

            if (!category) {
                throw new AppError("Category not found", 404);
            }
        }

        if (payload.brandId) {
            const brand = await prisma.brand.findFirst({
                where: { id: payload.brandId, deletedAt: null },
                select: { id: true },
            });

            if (!brand) {
                throw new AppError("Brand not found", 404);
            }
        }

        if (payload.tagIds?.length) {
            const tagCount = await prisma.tag.count({ where: { id: { in: payload.tagIds } } });

            if (tagCount !== payload.tagIds.length) {
                throw new AppError("One or more tags were not found", 404);
            }
        }

        if (payload.sku && payload.sku !== product.sku) {
            const skuUsed = await prisma.product.findUnique({ where: { sku: payload.sku }, select: { id: true } });

            if (skuUsed) {
                throw new AppError("A product with this SKU already exists", 409);
            }
        }

        const galleryToRemove = product.imageGallery.filter((image) => removeGalleryIds.includes(image.id));

        if (galleryToRemove.length !== removeGalleryIds.length) {
            throw new AppError("One or more gallery images were not found on this product", 404);
        }

        const galleryCount = product.imageGallery.length - galleryToRemove.length + galleryFiles.length;

        if (galleryCount > MAX_GALLERY_IMAGES) {
            throw new AppError(`A product can have at most ${MAX_GALLERY_IMAGES} gallery images`, 400);
        }

        const savedFiles: string[] = [];

        try {
            let imageKey = product.imageKey;

            if (imageFile) {
                const result = await uploadFile(imageFile, "products", { thumbnail: true });
                imageKey = result.key;
                savedFiles.push(result.key);
            }

            let metaImageKey = product.metaImageKey;
            const metaUsedMainImage = !product.metaImageKey || product.metaImageKey === product.imageKey;

            if (metaImageFile) {
                const result = await uploadFile(metaImageFile, "products");
                metaImageKey = result.key;
                savedFiles.push(result.key);
            } else if (metaUsedMainImage) {
                metaImageKey = imageKey;
            }

            const lastSortOrder = Math.max(-1, ...product.imageGallery.map((image) => image.sortOrder));
            const productName = payload.name ?? product.name;
            const newGalleryImages: Prisma.ProductImageCreateWithoutProductInput[] = [];

            for (const file of galleryFiles) {
                const result = await uploadFile(file, "products", { thumbnail: true });
                savedFiles.push(result.key);

                newGalleryImages.push({
                    url: getFileUrl(result.key) as string,
                    key: result.key,
                    alt: productName,
                    sortOrder: lastSortOrder + newGalleryImages.length + 1,
                });
            }

            const { tagIds, removeGalleryImageIds, sku, ...productData } = payload;

            const data: Prisma.ProductUncheckedUpdateInput = {
                ...productData,
                image: getFileUrl(imageKey),
                imageKey,
                metaImage: getFileUrl(metaImageKey),
                metaImageKey,
                imageGallery: {
                    deleteMany: { id: { in: removeGalleryIds } },
                    create: newGalleryImages,
                },
            };

            if (sku) {
                data.sku = sku;
            }

            if (tagIds !== undefined) {
                data.tags = { set: tagIds.map((id) => ({ id })) };
            }

            const updatedProduct = await prisma.product.update({
                where: { id: productId },
                data,
                select: { ...productSelect, costPrice: canSeeCostPrice(role) },
            });

            const oldKeys = [product.imageKey, product.metaImageKey, ...galleryToRemove.map((image) => image.key)];
            const keysInUse = [imageKey, metaImageKey];

            for (const key of new Set(oldKeys)) {
                if (key && !keysInUse.includes(key)) {
                    await deleteFile(key);
                }
            }

            return updatedProduct;
        } catch (error) {
            for (const key of savedFiles) {
                await deleteFile(key);
            }

            throw error;
        }
    },

    getTrashedProducts: async (query: GetTrashedProductsQuery) => {
        const where: Prisma.ProductWhereInput = {
            AND: [
                { deletedAt: { not: null } },
                buildSearchFilter<Prisma.ProductWhereInput>(query.searchTerm, ["name", "sku"]),
            ],
        };

        const [products, total] = await prisma.$transaction([
            prisma.product.findMany({
                where,
                select: { ...productListSelect, sku: true, status: true, deletedAt: true },
                orderBy: { deletedAt: "desc" },
                ...getPagination(query),
            }),
            prisma.product.count({ where }),
        ]);

        const productList = products.map(({ imageKey, ...product }) => ({
            ...product,
            thumbnail: getThumbnailUrl(imageKey),
        }));

        return { products: productList, meta: paginationMeta(query, total) };
    },

    restoreProduct: async (productId: string) => {
        const product = await prisma.product.findFirst({
            where: { id: productId, deletedAt: { not: null } },
            select: { category: { select: { deletedAt: true } } },
        });

        if (!product) {
            throw new AppError("Product not found in trash", 404);
        }

        if (product.category.deletedAt) {
            throw new AppError("This product's category is in trash. Restore the category first", 400);
        }

        return prisma.product.update({
            where: { id: productId },
            data: { deletedAt: null },
            select: productSelect,
        });
    },

    moveToTrash: async (productId: string) => {
        const product = await prisma.product.findFirst({
            where: { id: productId, deletedAt: null },
            select: { id: true },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        await prisma.product.update({
            where: { id: productId },
            data: { deletedAt: new Date() },
        });
    },

    hardDeleteProduct: async (productId: string) => {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: {
                deletedAt: true,
                imageKey: true,
                metaImageKey: true,
                imageGallery: { select: { key: true } },
            },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        if (!product.deletedAt) {
            throw new AppError("Move the product to trash before deleting it permanently", 400);
        }

        await prisma.product.delete({ where: { id: productId } });

        const fileKeys = [product.imageKey, product.metaImageKey, ...product.imageGallery.map((image) => image.key)];

        for (const key of new Set(fileKeys)) {
            await deleteFile(key);
        }
    },
};
