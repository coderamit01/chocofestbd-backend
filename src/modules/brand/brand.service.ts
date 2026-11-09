import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { generateSlug } from "../../helpers/generateSlug";
import type { Prisma } from "../../generated/prisma/client";
import { paginationMeta, getPagination } from "../../shared/pagination";
import { deleteFile, getFileUrl, uploadFile } from "../../lib/storage";
import type { BrandFiles } from "./brand.interface";
import type { CreateBrandPayload, GetAllBrandsQuery, UpdateBrandPayload } from "./brand.validation";

const brandSelect = {
    id: true,
    name: true,
    slug: true,
    logo: true,
    description: true,
    country: true,
    isActive: true,
    metaTitle: true,
    metaDescription: true,
    metaImage: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { products: true } },
} satisfies Prisma.BrandSelect;

const buildSlug = (name: string) => {
    const slug = generateSlug(name);

    if (!slug) {
        throw new AppError("Name must contain letters or numbers", 400);
    }

    return slug;
};

const ensureSlugAvailable = async (slug: string, excludeId?: string) => {
    const existing = await prisma.brand.findUnique({
        where: { slug },
        select: { id: true, deletedAt: true },
    });

    if (existing && existing.id !== excludeId) {
        throw new AppError(
            existing.deletedAt
                ? "A brand with this name already exists in trash"
                : "A brand with this name already exists",
            409,
        );
    }
};

const uploadBrandImages = async (files: BrandFiles | undefined) => {
    const logoFile = files?.logo?.[0];
    const metaImageFile = files?.metaImage?.[0];

    const logo = logoFile ? await uploadFile(logoFile, "brands", { accept: ["image", "svg"] }) : null;

    try {
        const metaImage = metaImageFile ? await uploadFile(metaImageFile, "brands") : null;
        return { logoKey: logo?.key ?? null, metaImageKey: metaImage?.key ?? null };
    } catch (error) {
        await deleteFile(logo?.key);
        throw error;
    }
};

const deleteBrandImages = async (keys: { logoKey: string | null; metaImageKey: string | null }) => {
    await Promise.all([deleteFile(keys.logoKey), deleteFile(keys.metaImageKey)]);
};

const findBrandOrThrow = async (brandId: string, trashed: boolean) => {
    const brand = await prisma.brand.findFirst({
        where: { id: brandId, deletedAt: trashed ? { not: null } : null },
        select: { id: true, logoKey: true, metaImageKey: true },
    });

    if (!brand) {
        throw new AppError(trashed ? "Brand not found in trash" : "Brand not found", 404);
    }

    return brand;
};

export const brandService = {
    createBrand: async (payload: CreateBrandPayload, files: BrandFiles | undefined) => {
        const slug = buildSlug(payload.name);
        await ensureSlugAvailable(slug);

        const uploaded = await uploadBrandImages(files);

        try {
            return await prisma.brand.create({
                data: {
                    ...payload,
                    slug,
                    logo: getFileUrl(uploaded.logoKey),
                    logoKey: uploaded.logoKey,
                    metaImage: getFileUrl(uploaded.metaImageKey),
                    metaImageKey: uploaded.metaImageKey,
                },
                select: brandSelect,
            });
        } catch (error) {
            await deleteBrandImages(uploaded);
            throw error;
        }
    },

    getAllBrands: async (
        query: GetAllBrandsQuery,
        scope: Prisma.BrandWhereInput = { deletedAt: null },
        orderBy: Prisma.BrandOrderByWithRelationInput = { createdAt: "desc" },
    ) => {
        const { isActive, searchTerm } = query;

        const where: Prisma.BrandWhereInput = {
            ...scope,
            ...(isActive !== undefined && { isActive }),
            ...(searchTerm && { name: { contains: searchTerm, mode: "insensitive" } }),
        };

        const [brands, total] = await prisma.$transaction([
            prisma.brand.findMany({
                where,
                select: brandSelect,
                orderBy,
                ...getPagination(query),
            }),
            prisma.brand.count({ where }),
        ]);

        return { brands, meta: paginationMeta(query, total) };
    },

    getTrashedBrands: async (query: GetAllBrandsQuery) => {
        return brandService.getAllBrands(query, { deletedAt: { not: null } }, { deletedAt: "desc" });
    },

    getBrandById: async (brandId: string) => {
        const brand = await prisma.brand.findFirst({
            where: { id: brandId, deletedAt: null },
            select: brandSelect,
        });

        if (!brand) {
            throw new AppError("Brand not found", 404);
        }

        return brand;
    },

    updateBrand: async (brandId: string, payload: UpdateBrandPayload, files: BrandFiles | undefined) => {
        const { removeLogo, removeMetaImage, ...fields } = payload;
        const hasFiles = Boolean(files?.logo?.length || files?.metaImage?.length);

        if (!hasFiles && Object.keys(payload).length === 0) {
            throw new AppError("Provide at least one field or an image to update", 400);
        }

        const brand = await findBrandOrThrow(brandId, false);

        const slug = fields.name ? buildSlug(fields.name) : null;

        if (slug) {
            await ensureSlugAvailable(slug, brandId);
        }

        const uploaded = await uploadBrandImages(files);

        const data: Prisma.BrandUpdateInput = { ...fields, ...(slug && { slug }) };

        if (uploaded.logoKey) {
            data.logo = getFileUrl(uploaded.logoKey);
            data.logoKey = uploaded.logoKey;
        } else if (removeLogo) {
            data.logo = null;
            data.logoKey = null;
        }

        if (uploaded.metaImageKey) {
            data.metaImage = getFileUrl(uploaded.metaImageKey);
            data.metaImageKey = uploaded.metaImageKey;
        } else if (removeMetaImage) {
            data.metaImage = null;
            data.metaImageKey = null;
        }

        let updated;
        try {
            updated = await prisma.brand.update({
                where: { id: brandId },
                data,
                select: brandSelect,
            });
        } catch (error) {
            await deleteBrandImages(uploaded);
            throw error;
        }

        await deleteBrandImages({
            logoKey: uploaded.logoKey || removeLogo ? brand.logoKey : null,
            metaImageKey: uploaded.metaImageKey || removeMetaImage ? brand.metaImageKey : null,
        });

        return updated;
    },

    moveToTrash: async (brandId: string) => {
        await findBrandOrThrow(brandId, false);

        await prisma.brand.update({
            where: { id: brandId },
            data: { deletedAt: new Date() },
        });
    },

    restoreBrand: async (brandId: string) => {
        await findBrandOrThrow(brandId, true);

        return prisma.brand.update({
            where: { id: brandId },
            data: { deletedAt: null },
            select: brandSelect,
        });
    },

    hardDeleteBrand: async (brandId: string) => {
        const brand = await prisma.brand.findUnique({
            where: { id: brandId },
            select: { logoKey: true, metaImageKey: true, _count: { select: { products: true } } },
        });

        if (!brand) {
            throw new AppError("Brand not found", 404);
        }

        if (brand._count.products > 0) {
            throw new AppError("Remove or move the products of this brand before deleting it", 409);
        }

        await prisma.brand.delete({ where: { id: brandId } });

        await deleteBrandImages(brand);
    },
};
