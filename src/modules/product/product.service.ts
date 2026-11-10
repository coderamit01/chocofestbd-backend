import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { generateSlug } from "../../helpers/generateSlug";
import type { Prisma } from "../../generated/prisma/client";
import { ProductStatus } from "../../generated/prisma/enums";
import { deleteFile, getFileUrl, uploadFile } from "../../lib/storage";
import type { ProductFiles } from "./product.interface";
import type { CreateProductPayload } from "./product.validation";

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

const buildUniqueSlug = async (name: string) => {
    const base = generateSlug(name);

    if (!base) {
        throw new AppError("Name must contain letters or numbers", 400);
    }

    const taken = await prisma.product.findMany({
        where: { slug: { startsWith: base } },
        select: { slug: true },
    });

    const slugs = new Set(taken.map((product) => product.slug));

    if (!slugs.has(base)) return base;

    let suffix = 2;
    while (slugs.has(`${base}-${suffix}`)) suffix++;

    return `${base}-${suffix}`;
};

const resolveSku = async (sku: string | undefined) => {
    if (sku) {
        const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });

        if (existing) {
            throw new AppError("A product with this SKU already exists", 409);
        }

        return sku;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
        const generated = `CF-${randomBytes(4).toString("hex").toUpperCase()}`;
        const existing = await prisma.product.findUnique({ where: { sku: generated }, select: { id: true } });

        if (!existing) return generated;
    }

    throw new AppError("Could not generate a SKU, please enter one", 500);
};

const ensureRelationsExist = async (payload: CreateProductPayload) => {
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
        const count = await prisma.tag.count({ where: { id: { in: payload.tagIds } } });

        if (count !== payload.tagIds.length) {
            throw new AppError("One or more tags were not found", 404);
        }
    }
};

const uploadProductImages = async (files: ProductFiles | undefined) => {
    const uploadedKeys: string[] = [];

    const upload = async (file: Express.Multer.File, thumbnail: boolean) => {
        const { key } = await uploadFile(file, "products", { thumbnail });
        uploadedKeys.push(key);
        return key;
    };

    try {
        const imageFile = files?.image?.[0];
        const metaImageFile = files?.metaImage?.[0];

        const imageKey = imageFile ? await upload(imageFile, true) : null;
        const metaImageKey = metaImageFile ? await upload(metaImageFile, false) : null;

        const galleryKeys: string[] = [];
        for (const file of files?.gallery ?? []) {
            galleryKeys.push(await upload(file, true));
        }

        return { imageKey, metaImageKey, galleryKeys, uploadedKeys };
    } catch (error) {
        await Promise.all(uploadedKeys.map((key) => deleteFile(key)));
        throw error;
    }
};

export const productService = {
    createProduct: async (payload: CreateProductPayload, files: ProductFiles | undefined) => {
        const hasImage = Boolean(files?.image?.length);

        if (payload.status === ProductStatus.ACTIVE && !hasImage) {
            throw new AppError("An active product needs a main image", 400);
        }

        await ensureRelationsExist(payload);

        const [slug, sku] = await Promise.all([buildUniqueSlug(payload.name), resolveSku(payload.sku)]);

        const uploaded = await uploadProductImages(files);

        const { tagIds, sku: _sku, ...fields } = payload;

        try {
            return await prisma.product.create({
                data: {
                    ...fields,
                    slug,
                    sku,
                    image: getFileUrl(uploaded.imageKey),
                    imageKey: uploaded.imageKey,
                    metaImage: getFileUrl(uploaded.metaImageKey),
                    metaImageKey: uploaded.metaImageKey,
                    ...(tagIds?.length && { tags: { connect: tagIds.map((id) => ({ id })) } }),
                    ...(uploaded.galleryKeys.length && {
                        imageGallery: {
                            create: uploaded.galleryKeys.map((key, index) => ({
                                url: getFileUrl(key) as string,
                                key,
                                alt: payload.name,
                                sortOrder: index,
                            })),
                        },
                    }),
                },
                select: productSelect,
            });
        } catch (error) {
            await Promise.all(uploaded.uploadedKeys.map((key) => deleteFile(key)));
            throw error;
        }
    },
};
