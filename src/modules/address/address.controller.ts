import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { addressService } from "./address.service";
import { addressIdParamSchema } from "./address.validation";

export const addressController = {
    getMyAddresses: catchAsync(async (req: Request, res: Response) => {
        const addresses = await addressService.getMyAddresses(req.user!.id);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Addresses retrieved successfully",
            data: addresses,
        });
    }),

    getMyAddressById: catchAsync(async (req: Request, res: Response) => {
        const { addressId } = addressIdParamSchema.parse(req.params);
        const address = await addressService.getMyAddressById(req.user!.id, addressId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Address retrieved successfully",
            data: address,
        });
    }),

    createAddress: catchAsync(async (req: Request, res: Response) => {
        const address = await addressService.createAddress(req.user!.id, req.body);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Address added successfully",
            data: address,
        });
    }),

    updateAddress: catchAsync(async (req: Request, res: Response) => {
        const { addressId } = addressIdParamSchema.parse(req.params);
        const address = await addressService.updateAddress(req.user!.id, addressId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Address updated successfully",
            data: address,
        });
    }),

    setDefaultAddress: catchAsync(async (req: Request, res: Response) => {
        const { addressId } = addressIdParamSchema.parse(req.params);
        const address = await addressService.setDefaultAddress(req.user!.id, addressId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Default address updated",
            data: address,
        });
    }),

    deleteAddress: catchAsync(async (req: Request, res: Response) => {
        const { addressId } = addressIdParamSchema.parse(req.params);
        await addressService.deleteAddress(req.user!.id, addressId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Address deleted successfully",
        });
    }),
};
