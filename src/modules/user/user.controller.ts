import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { UserRole } from "../../generated/prisma/enums";
import { userService } from "./user.service";
import { getAllUsersQuerySchema, userIdParamSchema } from "./user.validation";

export const userController = {
    getAllUsers: catchAsync(async (req: Request, res: Response) => {
        const query = getAllUsersQuerySchema.parse(req.query);
        const { users, meta } = await userService.getAllUsers(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Users retrieved successfully",
            data: users,
            meta,
        });
    }),

    getAllCustomers: catchAsync(async (req: Request, res: Response) => {
        const query = getAllUsersQuerySchema.parse(req.query);
        const { users, meta } = await userService.getAllCustomers(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Customers retrieved successfully",
            data: users,
            meta,
        });
    }),

    getTrashedUsers: catchAsync(async (req: Request, res: Response) => {
        const query = getAllUsersQuerySchema.parse(req.query);
        const { users, meta } = await userService.getTrashedUsers(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Trashed users retrieved successfully",
            data: users,
            meta,
        });
    }),

    getUserById: catchAsync(async (req: Request, res: Response) => {
        const { userId } = userIdParamSchema.parse(req.params);
        const user = await userService.getUserById(userId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "User retrieved successfully",
            data: user,
        });
    }),

    updateUser: catchAsync(async (req: Request, res: Response) => {
        const { userId } = userIdParamSchema.parse(req.params);
        const actor = { id: req.user!.id, role: req.user!.role as UserRole };

        const user = await userService.updateUser(actor, userId, req.body, req.file);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "User updated successfully",
            data: user,
        });
    }),

    moveToTrash: catchAsync(async (req: Request, res: Response) => {
        const { userId } = userIdParamSchema.parse(req.params);
        const actor = { id: req.user!.id, role: req.user!.role as UserRole };

        await userService.moveToTrash(actor, userId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "User moved to trash",
        });
    }),

    restoreUser: catchAsync(async (req: Request, res: Response) => {
        const { userId } = userIdParamSchema.parse(req.params);
        const actor = { id: req.user!.id, role: req.user!.role as UserRole };

        const user = await userService.restoreUser(actor, userId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "User restored successfully",
            data: user,
        });
    }),

    hardDeleteUser: catchAsync(async (req: Request, res: Response) => {
        const { userId } = userIdParamSchema.parse(req.params);
        const actor = { id: req.user!.id, role: req.user!.role as UserRole };

        await userService.hardDeleteUser(actor, userId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "User permanently deleted",
        });
    }),
}
