import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { AuthService } from "./auth.service";

const forwardSetCookie = (res: Response, headers: Headers) => {
    const cookies = headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
};

export const AuthController = {
    signUp: catchAsync(async (req: Request, res: Response) => {
        const { user, headers } = await AuthService.signUp(req.body, req.headers);
        forwardSetCookie(res, headers);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Account created successfully",
            data: user,
        });
    }),

    signIn: catchAsync(async (req: Request, res: Response) => {
        const { user, headers } = await AuthService.signIn(req.body, req.headers);
        forwardSetCookie(res, headers);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Signed in successfully",
            data: user,
        });
    }),

    signOut: catchAsync(async (req: Request, res: Response) => {
        const { headers } = await AuthService.signOut(req.headers);
        forwardSetCookie(res, headers);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Signed out successfully",
        });
    }),

    signOutAll: catchAsync(async (req: Request, res: Response) => {
        const { headers } = await AuthService.signOutAll(req.headers);
        forwardSetCookie(res, headers);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Signed out from all devices",
        });
    }),

    changePassword: catchAsync(async (req: Request, res: Response) => {
        await AuthService.changePassword(req.user!.id, req.body, req.headers);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Password updated successfully",
        });
    }),

    getProfile: catchAsync(async (req: Request, res: Response) => {
        const user = await AuthService.getProfile(req.user!.id);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Profile retrieved successfully",
            data: user,
        });
    })
    
}
