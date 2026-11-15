import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { collectionService } from "./collection.service";
import {
    collectionIdParamSchema,
    collectionSlugParamSchema,
    getAllCollectionsQuerySchema,
    getCollectionProductsQuerySchema,
    getHomeCollectionsQuerySchema,
} from "./collection.validation";

export const collectionController = {
    createCollection: catchAsync(async (req: Request, res: Response) => {
        const collection = await collectionService.createCollection(req.body);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Collection created successfully",
            data: collection,
        });
    }),

    getAllCollections: catchAsync(async (req: Request, res: Response) => {
        const query = getAllCollectionsQuerySchema.parse(req.query);
        const { collections, meta } = await collectionService.getAllCollections(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Collections retrieved successfully",
            data: collections,
            meta,
        });
    }),

    getCollectionById: catchAsync(async (req: Request, res: Response) => {
        const { collectionId } = collectionIdParamSchema.parse(req.params);
        const collection = await collectionService.getCollectionById(collectionId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Collection retrieved successfully",
            data: collection,
        });
    }),

    updateCollection: catchAsync(async (req: Request, res: Response) => {
        const { collectionId } = collectionIdParamSchema.parse(req.params);
        const collection = await collectionService.updateCollection(collectionId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Collection updated successfully",
            data: collection,
        });
    }),

    setCollectionProducts: catchAsync(async (req: Request, res: Response) => {
        const { collectionId } = collectionIdParamSchema.parse(req.params);
        const collection = await collectionService.setCollectionProducts(collectionId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Collection products updated successfully",
            data: collection,
        });
    }),

    deleteCollection: catchAsync(async (req: Request, res: Response) => {
        const { collectionId } = collectionIdParamSchema.parse(req.params);
        await collectionService.deleteCollection(collectionId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Collection deleted successfully",
        });
    }),

    getHomeCollections: catchAsync(async (req: Request, res: Response) => {
        const query = getHomeCollectionsQuerySchema.parse(req.query);
        const collections = await collectionService.getHomeCollections(query);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Collections retrieved successfully",
            data: collections,
        });
    }),

    getCollectionBySlug: catchAsync(async (req: Request, res: Response) => {
        const { slug } = collectionSlugParamSchema.parse(req.params);
        const query = getCollectionProductsQuerySchema.parse(req.query);
        const { collection, meta } = await collectionService.getCollectionBySlug(slug, query);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Collection retrieved successfully",
            data: collection,
            meta,
        });
    }),
};
