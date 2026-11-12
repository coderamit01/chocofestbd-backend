import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { faqService } from "./faq.service";
import { faqIdParamSchema, getAllFaqsQuerySchema } from "./faq.validation";

export const faqController = {
    createFaq: catchAsync(async (req: Request, res: Response) => {
        const faq = await faqService.createFaq(req.body);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "FAQ created successfully",
            data: faq,
        });
    }),

    getAllFaqs: catchAsync(async (req: Request, res: Response) => {
        const query = getAllFaqsQuerySchema.parse(req.query);
        const { faqs, meta } = await faqService.getAllFaqs(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "FAQs retrieved successfully",
            data: faqs,
            meta,
        });
    }),

    getFaqById: catchAsync(async (req: Request, res: Response) => {
        const { faqId } = faqIdParamSchema.parse(req.params);
        const faq = await faqService.getFaqById(faqId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "FAQ retrieved successfully",
            data: faq,
        });
    }),

    updateFaq: catchAsync(async (req: Request, res: Response) => {
        const { faqId } = faqIdParamSchema.parse(req.params);
        const faq = await faqService.updateFaq(faqId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "FAQ updated successfully",
            data: faq,
        });
    }),

    deleteFaq: catchAsync(async (req: Request, res: Response) => {
        const { faqId } = faqIdParamSchema.parse(req.params);
        await faqService.deleteFaq(faqId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "FAQ deleted successfully",
        });
    }),

    getPublicFaqs: catchAsync(async (_req: Request, res: Response) => {
        const faqs = await faqService.getPublicFaqs();

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "FAQs retrieved successfully",
            data: faqs,
        });
    }),
};
