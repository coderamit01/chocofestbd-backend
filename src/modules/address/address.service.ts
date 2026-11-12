import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { findThana } from "../location/location.service";
import type { CreateAddressPayload, UpdateAddressPayload } from "./address.validation";

const MAX_ADDRESSES = 10;

const addressSelect = {
    id: true,
    label: true,
    recipientName: true,
    recipientPhone: true,
    address: true,
    district: true,
    area: true,
    isDefault: true,
    deliveryZone: { select: { id: true, name: true, charge: true, estimatedDays: true, isActive: true } },
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.AddressSelect;

const ensureZoneActive = async (deliveryZoneId: string) => {
    const zone = await prisma.deliveryZone.findFirst({
        where: { id: deliveryZoneId, isActive: true },
        select: { id: true },
    });

    if (!zone) {
        throw new AppError("Delivery zone not found", 404);
    }
};

const findOwnAddress = async (userId: string, addressId: string) => {
    const address = await prisma.address.findFirst({
        where: { id: addressId, userId },
        select: { id: true, district: true, isDefault: true },
    });

    if (!address) {
        throw new AppError("Address not found", 404);
    }

    return address;
};

export const addressService = {
    getMyAddresses: async (userId: string) => {
        return prisma.address.findMany({
            where: { userId },
            select: addressSelect,
            orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        });
    },

    getMyAddressById: async (userId: string, addressId: string) => {
        const address = await prisma.address.findFirst({
            where: { id: addressId, userId },
            select: addressSelect,
        });

        if (!address) {
            throw new AppError("Address not found", 404);
        }

        return address;
    },

    createAddress: async (userId: string, payload: CreateAddressPayload) => {
        await ensureZoneActive(payload.deliveryZoneId);

        const count = await prisma.address.count({ where: { userId } });

        if (count >= MAX_ADDRESSES) {
            throw new AppError(`You can save at most ${MAX_ADDRESSES} addresses`, 400);
        }

        const isDefault = count === 0 || payload.isDefault === true;

        return prisma.$transaction(async (tx) => {
            if (isDefault) {
                await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
            }

            return tx.address.create({
                data: { ...payload, userId, isDefault },
                select: addressSelect,
            });
        });
    },

    updateAddress: async (userId: string, addressId: string, payload: UpdateAddressPayload) => {
        const existing = await findOwnAddress(userId, addressId);

        if (payload.deliveryZoneId) {
            await ensureZoneActive(payload.deliveryZoneId);
        }

        const data = { ...payload };

        if (payload.area !== undefined) {
            const district = payload.district ?? existing.district;
            const area = findThana(district, payload.area);

            if (!area) {
                throw new AppError("Select a valid area for this district", 400);
            }

            data.area = area.name;
        }

        return prisma.address.update({
            where: { id: addressId },
            data,
            select: addressSelect,
        });
    },

    setDefaultAddress: async (userId: string, addressId: string) => {
        await findOwnAddress(userId, addressId);

        const [, address] = await prisma.$transaction([
            prisma.address.updateMany({
                where: { userId, isDefault: true, NOT: { id: addressId } },
                data: { isDefault: false },
            }),
            prisma.address.update({
                where: { id: addressId },
                data: { isDefault: true },
                select: addressSelect,
            }),
        ]);

        return address;
    },

    deleteAddress: async (userId: string, addressId: string) => {
        const existing = await findOwnAddress(userId, addressId);

        await prisma.$transaction(async (tx) => {
            await tx.address.delete({ where: { id: addressId } });

            if (!existing.isDefault) return;

            const next = await tx.address.findFirst({
                where: { userId },
                select: { id: true },
                orderBy: { createdAt: "desc" },
            });

            if (next) {
                await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
            }
        });
    },
};
