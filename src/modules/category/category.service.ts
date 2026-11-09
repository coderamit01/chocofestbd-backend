import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { generateSlug } from "../../helpers/generateSlug";
import type { Prisma } from "../../generated/prisma/client";
import { paginationMeta, getPagination } from "../../shared/pagination";
import { deleteFile, getFileUrl, uploadFile } from "../../lib/storage";
import type { CategoryFiles } from "./category.interface";
import type { CreateCategoryPayload, GetAllCategoriesQuery, UpdateCategoryPayload } from "./category.validation";

const categorySelect = {
    id: true,
    name: true,
    slug: true,
    description: true,
    image: true,
    parent: { select: { id: true, name: true, slug: true } },
    sortOrder: true,
    isActive: true,
    metaTitle: true,
    metaDescription: true,
    metaImage: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { children: true, products: true } },
} satisfies Prisma.CategorySelect;

const buildSlug = (name: string) => {
    const slug = generateSlug(name);

    if (!slug) {
        throw new AppError("Name must contain letters or numbers", 400);
    }

    return slug;
};

const ensureSlugAvailable = async (slug: string, excludeId?: string) => {
    const existing = await prisma.category.findUnique({
        where: { slug },
        select: { id: true, deletedAt: true },
    });

    if (existing && existing.id !== excludeId) {
        throw new AppError(
            existing.deletedAt
                ? "A category with this name already exists in trash"
                : "A category with this name already exists",
            409,
        );
    }
};

const ensureParentValid = async (parentId: string, categoryId?: string) => {
    if (parentId === categoryId) {
        throw new AppError("A category cannot be its own parent", 400);
    }

    const parent = await prisma.category.findFirst({
        where: { id: parentId, deletedAt: null },
        select: { id: true },
    });

    if (!parent) {
        throw new AppError("Parent category not found", 404);
    }

    if (!categoryId) return;

    let currentId: string | null = parentId;

    while (currentId) {
        const current: { parentId: string | null } | null = await prisma.category.findUnique({
            where: { id: currentId },
            select: { parentId: true },
        });

        if (current?.parentId === categoryId) {
            throw new AppError("A category cannot be moved under its own sub-category", 400);
        }

        currentId = current?.parentId ?? null;
    }
};

const uploadCategoryImages = async (files: CategoryFiles | undefined) => {
    const imageFile = files?.image?.[0];
    const metaImageFile = files?.metaImage?.[0];

    const image = imageFile ? await uploadFile(imageFile, "categories", { accept: ["image", "svg"] }) : null;

    try {
        const metaImage = metaImageFile ? await uploadFile(metaImageFile, "categories") : null;
        return { imageKey: image?.key ?? null, metaImageKey: metaImage?.key ?? null };
    } catch (error) {
        await deleteFile(image?.key);
        throw error;
    }
};

const deleteCategoryImages = async (keys: { imageKey: string | null; metaImageKey: string | null }) => {
    await Promise.all([deleteFile(keys.imageKey), deleteFile(keys.metaImageKey)]);
};

export const categoryService = {
    createCategory: async (payload: CreateCategoryPayload, files: CategoryFiles | undefined) => {
        const slug = buildSlug(payload.name);
        await ensureSlugAvailable(slug);

        if (payload.parentId) {
            await ensureParentValid(payload.parentId);
        }

        const uploaded = await uploadCategoryImages(files);

        try {
            return await prisma.category.create({
                data: {
                    ...payload,
                    slug,
                    image: getFileUrl(uploaded.imageKey),
                    imageKey: uploaded.imageKey,
                    metaImage: getFileUrl(uploaded.metaImageKey),
                    metaImageKey: uploaded.metaImageKey,
                },
                select: categorySelect,
            });
        } catch (error) {
            await deleteCategoryImages(uploaded);
            throw error;
        }
    },

    getAllCategories: async (
        query: GetAllCategoriesQuery,
        scope: Prisma.CategoryWhereInput = { deletedAt: null },
        orderBy: Prisma.CategoryOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { name: "asc" }],
    ) => {
        const { parentId, isActive, searchTerm } = query;

        const where: Prisma.CategoryWhereInput = {
            ...scope,
            ...(parentId && { parentId: parentId === "root" ? null : parentId }),
            ...(isActive !== undefined && { isActive }),
            ...(searchTerm && { name: { contains: searchTerm, mode: "insensitive" } }),
        };

        const [categories, total] = await prisma.$transaction([
            prisma.category.findMany({
                where,
                select: categorySelect,
                orderBy,
                ...getPagination(query),
            }),
            prisma.category.count({ where }),
        ]);

        return { categories, meta: paginationMeta(query, total) };
    },

    getTrashedCategories: async (query: GetAllCategoriesQuery) => {
        return categoryService.getAllCategories(query, { deletedAt: { not: null } }, [{ deletedAt: "desc" }]);
    },

    getCategoryById: async (categoryId: string) => {
        const category = await prisma.category.findFirst({
            where: { id: categoryId, deletedAt: null },
            select: {
                ...categorySelect,
                children: {
                    where: { deletedAt: null },
                    select: { id: true, name: true, slug: true, sortOrder: true, isActive: true },
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                },
            },
        });

        if (!category) {
            throw new AppError("Category not found", 404);
        }

        return category;
    },

    updateCategory: async (categoryId: string, payload: UpdateCategoryPayload, files: CategoryFiles | undefined) => {
        const { removeImage, removeMetaImage, ...fields } = payload;
        const hasFiles = Boolean(files?.image?.length || files?.metaImage?.length);

        if (!hasFiles && Object.keys(payload).length === 0) {
            throw new AppError("Provide at least one field or an image to update", 400);
        }

        const category = await prisma.category.findFirst({
            where: { id: categoryId, deletedAt: null },
            select: { imageKey: true, metaImageKey: true },
        });

        if (!category) {
            throw new AppError("Category not found", 404);
        }

        const slug = fields.name ? buildSlug(fields.name) : null;

        if (slug) {
            await ensureSlugAvailable(slug, categoryId);
        }

        if (fields.parentId) {
            await ensureParentValid(fields.parentId, categoryId);
        }

        const uploaded = await uploadCategoryImages(files);

        const { parentId, ...rest } = fields;
        const data: Prisma.CategoryUpdateInput = {
            ...rest,
            ...(slug && { slug }),
            ...(parentId !== undefined && {
                parent: parentId ? { connect: { id: parentId } } : { disconnect: true },
            }),
        };

        if (uploaded.imageKey) {
            data.image = getFileUrl(uploaded.imageKey);
            data.imageKey = uploaded.imageKey;
        } else if (removeImage) {
            data.image = null;
            data.imageKey = null;
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
            updated = await prisma.category.update({
                where: { id: categoryId },
                data,
                select: categorySelect,
            });
        } catch (error) {
            await deleteCategoryImages(uploaded);
            throw error;
        }

        await deleteCategoryImages({
            imageKey: uploaded.imageKey || removeImage ? category.imageKey : null,
            metaImageKey: uploaded.metaImageKey || removeMetaImage ? category.metaImageKey : null,
        });

        return updated;
    },

    moveToTrash: async (categoryId: string) => {
        const category = await prisma.category.findFirst({
            where: { id: categoryId, deletedAt: null },
            select: { _count: { select: { children: { where: { deletedAt: null } } } } },
        });

        if (!category) {
            throw new AppError("Category not found", 404);
        }

        if (category._count.children > 0) {
            throw new AppError("Move or trash the sub-categories of this category first", 409);
        }

        await prisma.category.update({
            where: { id: categoryId },
            data: { deletedAt: new Date() },
        });
    },

    restoreCategory: async (categoryId: string) => {
        const category = await prisma.category.findFirst({
            where: { id: categoryId, deletedAt: { not: null } },
            select: { parent: { select: { deletedAt: true } } },
        });

        if (!category) {
            throw new AppError("Category not found in trash", 404);
        }

        if (category.parent?.deletedAt) {
            throw new AppError("Restore the parent category first", 409);
        }

        return prisma.category.update({
            where: { id: categoryId },
            data: { deletedAt: null },
            select: categorySelect,
        });
    },

    hardDeleteCategory: async (categoryId: string) => {
        const category = await prisma.category.findUnique({
            where: { id: categoryId },
            select: {
                imageKey: true,
                metaImageKey: true,
                _count: { select: { children: true, products: true } },
            },
        });

        if (!category) {
            throw new AppError("Category not found", 404);
        }

        if (category._count.children > 0) {
            throw new AppError("Delete or move the sub-categories of this category first", 409);
        }

        if (category._count.products > 0) {
            throw new AppError("Remove or move the products of this category before deleting it", 409);
        }

        await prisma.category.delete({ where: { id: categoryId } });

        await deleteCategoryImages(category);
    },
};
