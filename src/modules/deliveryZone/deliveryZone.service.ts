import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { paginationMeta, getPagination } from "../../shared/pagination";
import type {
    CreateDeliveryZonePayload,
    GetAllDeliveryZonesQuery,
    UpdateDeliveryZonePayload,
} from "./deliveryZone.validation";

const deliveryZoneSelect = {
    id: true,
    name: true,
    charge: true,
    estimatedDays: true,
    sortOrder: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { addresses: true } },
} satisfies Prisma.DeliveryZoneSelect;

const publicDeliveryZoneSelect = {
    id: true,
    name: true,
    charge: true,
    estimatedDays: true,
} satisfies Prisma.DeliveryZoneSelect;

const ensureNameAvailable = async (name: string, excludeId?: string) => {
    const existing = await prisma.deliveryZone.findFirst({
        where: {
            name: { equals: name, mode: "insensitive" },
            ...(excludeId && { NOT: { id: excludeId } }),
        },
        select: { id: true },
    });

    if (existing) {
        throw new AppError("A delivery zone with this name already exists", 409);
    }
};

const ensureZoneExists = async (zoneId: string) => {
    const zone = await prisma.deliveryZone.findUnique({
        where: { id: zoneId },
        select: { id: true },
    });

    if (!zone) {
        throw new AppError("Delivery zone not found", 404);
    }
};

export const deliveryZoneService = {
    createDeliveryZone: async (payload: CreateDeliveryZonePayload) => {
        await ensureNameAvailable(payload.name);

        return prisma.deliveryZone.create({
            data: payload,
            select: deliveryZoneSelect,
        });
    },

    getPublicDeliveryZones: async () => {
        return prisma.deliveryZone.findMany({
            where: { isActive: true },
            select: publicDeliveryZoneSelect,
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });
    },

    getAllDeliveryZones: async (query: GetAllDeliveryZonesQuery) => {
        const { isActive, searchTerm } = query;

        const where: Prisma.DeliveryZoneWhereInput = {
            ...(isActive !== undefined && { isActive }),
            ...(searchTerm && { name: { contains: searchTerm, mode: "insensitive" } }),
        };

        const [zones, total] = await prisma.$transaction([
            prisma.deliveryZone.findMany({
                where,
                select: deliveryZoneSelect,
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                ...getPagination(query),
            }),
            prisma.deliveryZone.count({ where }),
        ]);

        return { zones, meta: paginationMeta(query, total) };
    },

    getDeliveryZoneById: async (zoneId: string) => {
        const zone = await prisma.deliveryZone.findUnique({
            where: { id: zoneId },
            select: deliveryZoneSelect,
        });

        if (!zone) {
            throw new AppError("Delivery zone not found", 404);
        }

        return zone;
    },

    updateDeliveryZone: async (zoneId: string, payload: UpdateDeliveryZonePayload) => {
        await ensureZoneExists(zoneId);

        if (payload.name) {
            await ensureNameAvailable(payload.name, zoneId);
        }

        return prisma.deliveryZone.update({
            where: { id: zoneId },
            data: payload,
            select: deliveryZoneSelect,
        });
    },

    deleteDeliveryZone: async (zoneId: string) => {
        const zone = await prisma.deliveryZone.findUnique({
            where: { id: zoneId },
            select: { _count: { select: { addresses: true } } },
        });

        if (!zone) {
            throw new AppError("Delivery zone not found", 404);
        }

        if (zone._count.addresses > 0) {
            throw new AppError(
                "Customers have saved addresses in this zone. Deactivate it instead of deleting it",
                409,
            );
        }

        await prisma.deliveryZone.delete({ where: { id: zoneId } });
    },
};
