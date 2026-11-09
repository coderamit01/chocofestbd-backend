import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { generateSlug } from "../../helpers/generateSlug";
import type { Prisma } from "../../generated/prisma/client";
import { paginationMeta, getPagination } from "../../shared/pagination";
import type { GetAllTagsQuery, TagPayload } from "./tag.validation";

const tagSelect = {
    id: true,
    name: true,
    slug: true,
    createdAt: true,
    _count: { select: { products: true } },
} satisfies Prisma.TagSelect;

const buildSlug = (name: string) => {
    const slug = generateSlug(name);

    if (!slug) {
        throw new AppError("Name must contain letters or numbers", 400);
    }

    return slug;
};

const ensureSlugAvailable = async (slug: string, excludeId?: string) => {
    const existing = await prisma.tag.findUnique({
        where: { slug },
        select: { id: true },
    });

    if (existing && existing.id !== excludeId) {
        throw new AppError("A tag with this name already exists", 409);
    }
};

const ensureTagExists = async (tagId: string) => {
    const tag = await prisma.tag.findUnique({
        where: { id: tagId },
        select: { id: true },
    });

    if (!tag) {
        throw new AppError("Tag not found", 404);
    }
};

export const tagService = {
    createTag: async (payload: TagPayload) => {
        const slug = buildSlug(payload.name);
        await ensureSlugAvailable(slug);

        return prisma.tag.create({
            data: { ...payload, slug },
            select: tagSelect,
        });
    },

    getAllTags: async (query: GetAllTagsQuery) => {
        const { searchTerm } = query;

        const where: Prisma.TagWhereInput = {
            ...(searchTerm && { name: { contains: searchTerm, mode: "insensitive" } }),
        };

        const [tags, total] = await prisma.$transaction([
            prisma.tag.findMany({
                where,
                select: tagSelect,
                orderBy: { name: "asc" },
                ...getPagination(query),
            }),
            prisma.tag.count({ where }),
        ]);

        return { tags, meta: paginationMeta(query, total) };
    },

    getTagById: async (tagId: string) => {
        const tag = await prisma.tag.findUnique({
            where: { id: tagId },
            select: tagSelect,
        });

        if (!tag) {
            throw new AppError("Tag not found", 404);
        }

        return tag;
    },

    updateTag: async (tagId: string, payload: TagPayload) => {
        await ensureTagExists(tagId);

        const slug = buildSlug(payload.name);
        await ensureSlugAvailable(slug, tagId);

        return prisma.tag.update({
            where: { id: tagId },
            data: { ...payload, slug },
            select: tagSelect,
        });
    },

    deleteTag: async (tagId: string) => {
        await ensureTagExists(tagId);

        await prisma.tag.delete({ where: { id: tagId } });
    },
};
