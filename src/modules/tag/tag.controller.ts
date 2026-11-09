import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { tagService } from "./tag.service";
import { getAllTagsQuerySchema, tagIdParamSchema } from "./tag.validation";

export const tagController = {
    createTag: catchAsync(async (req: Request, res: Response) => {
        const tag = await tagService.createTag(req.body);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Tag created successfully",
            data: tag,
        });
    }),

    getAllTags: catchAsync(async (req: Request, res: Response) => {
        const query = getAllTagsQuerySchema.parse(req.query);
        const { tags, meta } = await tagService.getAllTags(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Tags retrieved successfully",
            data: tags,
            meta,
        });
    }),

    getTagById: catchAsync(async (req: Request, res: Response) => {
        const { tagId } = tagIdParamSchema.parse(req.params);
        const tag = await tagService.getTagById(tagId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Tag retrieved successfully",
            data: tag,
        });
    }),

    updateTag: catchAsync(async (req: Request, res: Response) => {
        const { tagId } = tagIdParamSchema.parse(req.params);
        const tag = await tagService.updateTag(tagId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Tag updated successfully",
            data: tag,
        });
    }),

    deleteTag: catchAsync(async (req: Request, res: Response) => {
        const { tagId } = tagIdParamSchema.parse(req.params);
        await tagService.deleteTag(tagId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Tag deleted successfully",
        });
    }),
};
