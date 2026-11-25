import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { CouponScope, DiscountType } from "../../generated/prisma/enums";
import { paginationMeta, getPagination } from "../../shared/pagination";
import type {
    CreateDeliveryZonePayload,
    GetAllDeliveryZonesQuery,
    UpdateDeliveryZonePayload,
} from "./deliveryZone.validation";

const AREAS_SETTING_KEY = "deliveryZoneAreas";
const ORDER_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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

type ZoneRow = Prisma.DeliveryZoneGetPayload<{ select: typeof deliveryZoneSelect }>;

type AreasMap = Record<string, string>;

const readAreas = async (): Promise<AreasMap> => {
    const row = await prisma.setting.findUnique({ where: { key: AREAS_SETTING_KEY }, select: { value: true } });
    const value = row?.value;

    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
};

const writeAreas = async (zoneId: string, areas: string | null) => {
    const current = await readAreas();
    const next = { ...current };

    if (areas) next[zoneId] = areas;
    else delete next[zoneId];

    await prisma.setting.upsert({
        where: { key: AREAS_SETTING_KEY },
        create: { key: AREAS_SETTING_KEY, value: next },
        update: { value: next },
    });
};

const recentOrderCounts = async (names: string[]) => {
    if (!names.length) return new Map<string, number>();

    const groups = await prisma.order.groupBy({
        by: ["deliveryZoneName"],
        where: { deliveryZoneName: { in: names }, createdAt: { gte: new Date(Date.now() - ORDER_WINDOW_DAYS * DAY_MS) } },
        _count: { _all: true },
    });

    return new Map(groups.map((group) => [group.deliveryZoneName, group._count._all]));
};

const withDetails = async (zones: ZoneRow[]) => {
    const [areas, orders] = await Promise.all([readAreas(), recentOrderCounts(zones.map((zone) => zone.name))]);

    return zones.map((zone) => ({
        ...zone,
        areas: areas[zone.id] ?? null,
        recentOrders: orders.get(zone.name) ?? 0,
    }));
};

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
    createDeliveryZone: async ({ areas, ...payload }: CreateDeliveryZonePayload) => {
        await ensureNameAvailable(payload.name);

        const zone = await prisma.deliveryZone.create({
            data: payload,
            select: deliveryZoneSelect,
        });

        if (areas) await writeAreas(zone.id, areas);

        const [detailed] = await withDetails([zone]);
        return detailed!;
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

        return { zones: await withDetails(zones), meta: paginationMeta(query, total) };
    },

    getFreeDeliveryOffer: async () => {
        const now = new Date();

        const coupon = await prisma.coupon.findFirst({
            where: {
                discountType: DiscountType.FREE_DELIVERY,
                scope: CouponScope.ALL,
                isActive: true,
                deletedAt: null,
                AND: [
                    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                ],
            },
            select: { code: true, minOrderAmount: true, usageLimit: true, usedCount: true },
            orderBy: [{ minOrderAmount: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
        });

        if (!coupon || (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)) return null;

        return { code: coupon.code, minOrderAmount: coupon.minOrderAmount };
    },

    getDeliveryZoneById: async (zoneId: string) => {
        const zone = await prisma.deliveryZone.findUnique({
            where: { id: zoneId },
            select: deliveryZoneSelect,
        });

        if (!zone) {
            throw new AppError("Delivery zone not found", 404);
        }

        const [detailed] = await withDetails([zone]);
        return detailed!;
    },

    updateDeliveryZone: async (zoneId: string, { areas, ...payload }: UpdateDeliveryZonePayload) => {
        await ensureZoneExists(zoneId);

        if (payload.name) {
            await ensureNameAvailable(payload.name, zoneId);
        }

        const zone = Object.keys(payload).length
            ? await prisma.deliveryZone.update({
                  where: { id: zoneId },
                  data: payload,
                  select: deliveryZoneSelect,
              })
            : await prisma.deliveryZone.findUniqueOrThrow({ where: { id: zoneId }, select: deliveryZoneSelect });

        if (areas !== undefined) await writeAreas(zoneId, areas || null);

        const [detailed] = await withDetails([zone]);
        return detailed!;
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
        await writeAreas(zoneId, null);
    },
};
