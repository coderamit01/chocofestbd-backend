import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { UserRole } from "../../generated/prisma/enums";
import type { InviteStaffPayload } from "./staff.validation";

const staffSelect = {
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

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

const withLastActive = async (users: StaffRow[]) => {
    if (!users.length) return [];

    const sessions = await prisma.session.groupBy({
        by: ["userId"],
        where: { userId: { in: users.map((user) => user.id) } },
        _max: { updatedAt: true },
    });

    const lastActive = new Map(sessions.map((session) => [session.userId, session._max.updatedAt]));

    return users.map((user) => ({ ...user, lastActiveAt: lastActive.get(user.id) ?? null }));
};

export const staffService = {
    getStaff: async () => {
        const users = await prisma.user.findMany({
            where: { deletedAt: null, role: { not: UserRole.CUSTOMER } },
            select: staffSelect,
            orderBy: { createdAt: "asc" },
        });

        return withLastActive(users);
    },

    inviteStaff: async ({ password, ...payload }: InviteStaffPayload) => {
        const existing = await prisma.user.findFirst({
            where: { OR: [{ email: payload.email }, ...(payload.phone ? [{ phone: payload.phone }] : [])] },
            select: { email: true },
        });

        if (existing) {
            throw new AppError(
                existing.email === payload.email
                    ? "Someone with this email already has an account"
                    : "Someone with this phone number already has an account",
                409,
            );
        }

        const userId = randomUUID();
        const hash = await hashPassword(password);

        const user = await prisma.user.create({
            data: {
                id: userId,
                name: payload.name,
                email: payload.email,
                phone: payload.phone ?? null,
                role: payload.role,
                emailVerified: true,
                accounts: {
                    create: { id: randomUUID(), accountId: userId, providerId: "credential", password: hash },
                },
            },
            select: staffSelect,
        });

        return { ...user, lastActiveAt: null };
    },
};
