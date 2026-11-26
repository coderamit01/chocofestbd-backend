import type { IncomingHttpHeaders } from "node:http";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { ChangePasswordPayload, SignInPayload, SignUpPayload } from "./auth.validation";


export const AuthService = {
    signUp: async (payload: SignUpPayload, reqHeaders: IncomingHttpHeaders) => {
        const { name, email, password, phone } = payload;

        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingUser) {
            throw new AppError("An account with this email already exists", 409);
        }

        if (phone) {
            const phoneTaken = await prisma.user.findUnique({
                where: { phone },
                select: { id: true },
            });

            if (phoneTaken) {
                throw new AppError("An account with this phone number already exists", 409);
            }
        }

        const { headers, response } = await auth.api.signUpEmail({
            body: { name, email, password, ...(phone && { phone }) },
            headers: fromNodeHeaders(reqHeaders),
            returnHeaders: true,
        });

        return { user: response.user, headers };
    },

    signIn: async (payload: SignInPayload, reqHeaders: IncomingHttpHeaders) => {
        const { email, password, rememberMe } = payload;

        const { headers, response } = await auth.api.signInEmail({
            body: { email, password, ...(rememberMe !== undefined && { rememberMe }) },
            headers: fromNodeHeaders(reqHeaders),
            returnHeaders: true,
        });

        return { user: response.user, headers };
    },

    signOut: async (reqHeaders: IncomingHttpHeaders) => {
        const { headers } = await auth.api.signOut({
            headers: fromNodeHeaders(reqHeaders),
            returnHeaders: true,
        });
        return { headers };
    },

    signOutAll: async (reqHeaders: IncomingHttpHeaders) => {
        const headers = fromNodeHeaders(reqHeaders);

        await auth.api.revokeOtherSessions({ headers });

        const { headers: responseHeaders } = await auth.api.signOut({
            headers,
            returnHeaders: true,
        });

        return { headers: responseHeaders };
    },

    changePassword: async (userId: string, payload: ChangePasswordPayload, reqHeaders: IncomingHttpHeaders) => {
        const password = await hashPassword(payload.newPassword);

        const account = await prisma.account.findFirst({
            where: { userId, providerId: "credential" },
            select: { id: true },
        });

        if (account) {
            await prisma.account.update({ where: { id: account.id }, data: { password } });
        } else {
            await prisma.account.create({
                data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password },
            });
        }

        await auth.api.revokeOtherSessions({ headers: fromNodeHeaders(reqHeaders) });
    },

    getProfile: async (userId: string) => {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                phoneVerified: true,
                emailVerified: true,
                image: true,
                role: true,
                points: true,
                isBanned: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw new AppError("You are not authorized", 401);
        }

        if (user.isBanned) {
            throw new AppError("Your account has been suspended", 403);
        }

        const { isBanned, ...profile } = user;
        return profile;
    }
}
