import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { paginationMeta, getPagination } from "../../shared/pagination";
import type { CreateFaqPayload, GetAllFaqsQuery, UpdateFaqPayload } from "./faq.validation";

const faqSelect = {
    id: true,
    question: true,
    answer: true,
    sortOrder: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.FaqSelect;

const ensureFaqExists = async (faqId: string) => {
    const faq = await prisma.faq.findUnique({
        where: { id: faqId },
        select: { id: true },
    });

    if (!faq) {
        throw new AppError("FAQ not found", 404);
    }
};

export const faqService = {
    createFaq: async (payload: CreateFaqPayload) => {
        return prisma.faq.create({
            data: payload,
            select: faqSelect,
        });
    },

    getAllFaqs: async (query: GetAllFaqsQuery) => {
        const { isActive, searchTerm } = query;

        const where: Prisma.FaqWhereInput = {
            ...(isActive !== undefined && { isActive }),
            ...(searchTerm && {
                OR: [
                    { question: { contains: searchTerm, mode: "insensitive" } },
                    { answer: { contains: searchTerm, mode: "insensitive" } },
                ],
            }),
        };

        const [faqs, total] = await prisma.$transaction([
            prisma.faq.findMany({
                where,
                select: faqSelect,
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                ...getPagination(query),
            }),
            prisma.faq.count({ where }),
        ]);

        return { faqs, meta: paginationMeta(query, total) };
    },

    getFaqById: async (faqId: string) => {
        const faq = await prisma.faq.findUnique({
            where: { id: faqId },
            select: faqSelect,
        });

        if (!faq) {
            throw new AppError("FAQ not found", 404);
        }

        return faq;
    },

    updateFaq: async (faqId: string, payload: UpdateFaqPayload) => {
        await ensureFaqExists(faqId);

        return prisma.faq.update({
            where: { id: faqId },
            data: payload,
            select: faqSelect,
        });
    },

    deleteFaq: async (faqId: string) => {
        await ensureFaqExists(faqId);

        await prisma.faq.delete({ where: { id: faqId } });
    },
};
