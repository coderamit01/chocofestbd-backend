import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { UserRole } from "../../generated/prisma/enums";
import { AppError } from "../../helpers/AppError";
import { paginationMeta, getPagination } from "../../shared/pagination";
import { deleteFile, getFileUrl, uploadFile } from "../../lib/storage";
import type { GetAllUsersQuery, UpdateUserPayload } from "./user.validation";
import { IActor } from "./user.interface";


const userSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    phoneVerified: true,
    emailVerified: true,
    image: true,
    role: true,
    isBanned: true,
    points: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.UserSelect;

export const userService = {
    getAllUsers: async (
        query: GetAllUsersQuery,
        filter: Prisma.UserWhereInput = {},
        orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: "desc" },
    ) => {
        const { searchTerm } = query;

        const where: Prisma.UserWhereInput = {
            deletedAt: null,
            ...filter,
            ...(searchTerm && {
                OR: [
                    { name: { contains: searchTerm, mode: "insensitive" } },
                    { email: { contains: searchTerm, mode: "insensitive" } },
                    { phone: { contains: searchTerm } },
                ],
            }),
        };

        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({
                where,
                select: userSelect,
                orderBy,
                ...getPagination(query),
            }),
            prisma.user.count({ where }),
        ]);

        return { users, meta: paginationMeta(query, total) };
    },

    getAllCustomers: async (query: GetAllUsersQuery) => {
        return userService.getAllUsers(query, { role: UserRole.CUSTOMER });
    },

    getTrashedUsers: async (query: GetAllUsersQuery) => {
        return userService.getAllUsers(query, { deletedAt: { not: null } }, { deletedAt: "desc" });
    },

    getUserById: async (userId: string) => {
        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: userSelect,
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        return user;
    },

    updateUser: async (actor: IActor, userId: string, payload: UpdateUserPayload, file: Express.Multer.File | undefined) => {
        if (!file && Object.keys(payload).length === 0) {
            throw new AppError("Provide at least one field or an image to update", 400);
        }

        const target = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: { role: true, phone: true, imageKey: true },
        });

        if (!target) {
            throw new AppError("User not found", 404);
        }

        if (actor.id === userId) {
            if (payload.role !== undefined && payload.role !== target.role) {
                throw new AppError("You cannot change your own role", 403);
            }
            if (payload.isBanned === true) {
                throw new AppError("You cannot ban your own account", 403);
            }
        }

        if (target.role === UserRole.SUPER_ADMIN && payload.role !== undefined && payload.role !== UserRole.SUPER_ADMIN) {
            const superAdminCount = await prisma.user.count({
                where: { role: UserRole.SUPER_ADMIN, deletedAt: null },
            });

            if (superAdminCount <= 1) {
                throw new AppError("The last super admin cannot be demoted", 409);
            }
        }

        if (actor.role === UserRole.ADMIN) {
            if (target.role === UserRole.SUPER_ADMIN) {
                throw new AppError("Admin cannot update a super admin", 403);
            }
            if (payload.role === UserRole.SUPER_ADMIN) {
                throw new AppError("Admin cannot assign the super admin role", 403);
            }
        }

        if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.ADMIN) {
            if (actor.id !== userId) {
                throw new AppError("You can only update your own profile", 403);
            }
            if (payload.role !== undefined || payload.isBanned !== undefined) {
                throw new AppError("You cannot update role or ban status", 403);
            }
        }

        const phoneChanged = payload.phone !== undefined && payload.phone !== target.phone;

        if (phoneChanged && payload.phone) {
            const phoneTaken = await prisma.user.findFirst({
                where: { phone: payload.phone, NOT: { id: userId } },
                select: { id: true },
            });

            if (phoneTaken) {
                throw new AppError("An account with this phone number already exists", 409);
            }
        }

        const roleChanged = payload.role !== undefined && payload.role !== target.role;
        const signOutUser = roleChanged || payload.isBanned === true;

        const uploaded = file ? await uploadFile(file, "users") : null;

        let user;
        try {
            [user] = await prisma.$transaction([
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        ...payload,
                        ...(phoneChanged && { phoneVerified: false }),
                        ...(uploaded && { image: getFileUrl(uploaded.key), imageKey: uploaded.key }),
                    },
                    select: userSelect,
                }),
                ...(signOutUser ? [prisma.session.deleteMany({ where: { userId } })] : []),
            ]);
        } catch (error) {
            if (uploaded) await deleteFile(uploaded.key);
            throw error;
        }

        if (uploaded && target.imageKey) {
            await deleteFile(target.imageKey);
        }

        return user;
    },

    moveToTrash: async (actor: IActor, userId: string) => {
        if (actor.id === userId) {
            throw new AppError("You cannot move your own account to trash", 400);
        }

        const target = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: { role: true },
        });

        if (!target) {
            throw new AppError("User not found", 404);
        }

        if (actor.role === UserRole.ADMIN && target.role === UserRole.SUPER_ADMIN) {
            throw new AppError("Admin cannot move a super admin to trash", 403);
        }

        await prisma.$transaction([
            prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
            prisma.session.deleteMany({ where: { userId } }),
        ]);
    },

    restoreUser: async (actor: IActor, userId: string) => {
        const target = await prisma.user.findFirst({
            where: { id: userId, deletedAt: { not: null } },
            select: { role: true },
        });

        if (!target) {
            throw new AppError("User not found in trash", 404);
        }

        if (actor.role === UserRole.ADMIN && target.role === UserRole.SUPER_ADMIN) {
            throw new AppError("Admin cannot restore a super admin", 403);
        }

        return prisma.user.update({
            where: { id: userId },
            data: { deletedAt: null },
            select: userSelect,
        });
    },

    hardDeleteUser: async (actor: IActor, userId: string) => {
        if (actor.id === userId) {
            throw new AppError("You cannot delete your own account", 400);
        }

        const target = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        if (!target) {
            throw new AppError("User not found", 404);
        }

        await prisma.user.delete({ where: { id: userId } });
    },
}
