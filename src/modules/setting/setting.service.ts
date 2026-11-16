import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { deleteFile, getFileUrl, uploadFile } from "../../lib/storage";
import {
    SETTING_GROUPS,
    SETTING_IMAGE_FIELDS,
    settingInputSchemas,
    settingStoredSchemas,
    type SettingGroup,
    type SettingValue,
} from "./setting.validation";
import type { SettingFiles } from "./setting.interface";

type ImageKeys = Record<string, string>;

type LoadedGroup<G extends SettingGroup> = { value: SettingValue<G>; images: ImageKeys };

const cache = new Map<SettingGroup, LoadedGroup<SettingGroup>>();

const allowedImageFields = (group: SettingGroup): readonly string[] => SETTING_IMAGE_FIELDS[group];

const cleanImageKeys = (group: SettingGroup, images: unknown): ImageKeys => {
    if (!images || typeof images !== "object" || Array.isArray(images)) {
        return {};
    }

    const allowed = allowedImageFields(group);

    return Object.fromEntries(
        Object.entries(images).filter(
            (entry): entry is [string, string] => allowed.includes(entry[0]) && typeof entry[1] === "string",
        ),
    );
};

const loadGroup = async <G extends SettingGroup>(group: G): Promise<LoadedGroup<G>> => {
    const cached = cache.get(group);

    if (cached) {
        return cached as LoadedGroup<G>;
    }

    const row = await prisma.setting.findUnique({
        where: { key: group },
        select: { value: true, images: true },
    });

    const schema = settingStoredSchemas[group];
    const parsed = schema.safeParse(row?.value ?? {});

    if (!parsed.success) {
        console.error(`Stored "${group}" settings are invalid. Using defaults.`, parsed.error.issues);
    }

    const loaded = {
        value: (parsed.success ? parsed.data : schema.parse({})) as SettingValue<G>,
        images: cleanImageKeys(group, row?.images),
    };

    cache.set(group, loaded);

    return loaded;
};

const imageUrls = (group: SettingGroup, images: ImageKeys) =>
    Object.fromEntries(allowedImageFields(group).map((field) => [field, getFileUrl(images[field])]));

const toAdminView = <G extends SettingGroup>(group: G, loaded: LoadedGroup<G>) => ({
    group,
    value: loaded.value,
    images: imageUrls(group, loaded.images),
});

const saveImages = async (group: SettingGroup, images: ImageKeys, userId: string) => {
    await prisma.setting.upsert({
        where: { key: group },
        create: { key: group, images, updatedById: userId },
        update: { images, updatedById: userId },
    });

    cache.delete(group);
};

export const getSetting = async <G extends SettingGroup>(group: G) => (await loadGroup(group)).value;

export const settingService = {
    getAllSettings: async () => {
        const groups = await Promise.all(SETTING_GROUPS.map(async (group) => toAdminView(group, await loadGroup(group))));
        return groups;
    },

    getSettingGroup: async <G extends SettingGroup>(group: G) => {
        return toAdminView(group, await loadGroup(group));
    },

    updateSettingGroup: async (group: SettingGroup, body: unknown, userId: string) => {
        const value = (await settingInputSchemas[group].parseAsync(body ?? {})) as Prisma.InputJsonValue;

        await prisma.setting.upsert({
            where: { key: group },
            create: { key: group, value, updatedById: userId },
            update: { value, updatedById: userId },
        });

        cache.delete(group);

        return toAdminView(group, await loadGroup(group));
    },

    uploadSettingImages: async (group: SettingGroup, files: SettingFiles | undefined, userId: string) => {
        const entries = Object.entries(files ?? {}).flatMap(([field, list]) => (list?.[0] ? [[field, list[0]] as const] : []));

        if (!entries.length) {
            throw new AppError("Upload at least one image", 400);
        }

        const allowed = allowedImageFields(group);
        const invalid = entries.map(([field]) => field).filter((field) => !allowed.includes(field));

        if (invalid.length) {
            throw new AppError(
                allowed.length
                    ? `Image field not allowed: ${invalid.join(", ")}. Allowed: ${allowed.join(", ")}`
                    : `The ${group} settings have no images`,
                400,
            );
        }

        const uploaded: ImageKeys = {};

        try {
            for (const [field, file] of entries) {
                const { key } = await uploadFile(file, "settings", { accept: ["image", "svg"] });
                uploaded[field] = key;
            }
        } catch (error) {
            await Promise.all(Object.values(uploaded).map((key) => deleteFile(key)));
            throw error;
        }

        const current = await loadGroup(group);
        const oldKeys = Object.keys(uploaded).map((field) => current.images[field]);

        try {
            await saveImages(group, { ...current.images, ...uploaded }, userId);
        } catch (error) {
            await Promise.all(Object.values(uploaded).map((key) => deleteFile(key)));
            throw error;
        }

        await Promise.all(oldKeys.map((key) => deleteFile(key)));

        return toAdminView(group, await loadGroup(group));
    },

    removeSettingImage: async (group: SettingGroup, field: string, userId: string) => {
        if (!allowedImageFields(group).includes(field)) {
            throw new AppError("Image field not found", 404);
        }

        const current = await loadGroup(group);
        const oldKey = current.images[field];

        if (!oldKey) {
            throw new AppError("No image to remove", 404);
        }

        const { [field]: _removed, ...rest } = current.images;

        await saveImages(group, rest, userId);
        await deleteFile(oldKey);

        return toAdminView(group, await loadGroup(group));
    },

    getPublicSettings: async () => {
        const [general, social, seo, payment, inventory, maintenance] = await Promise.all([
            loadGroup("general"),
            loadGroup("social"),
            loadGroup("seo"),
            loadGroup("payment"),
            loadGroup("inventory"),
            loadGroup("maintenance"),
        ]);

        const paymentLogo = (field: string) => getFileUrl(payment.images[field]);
        const { cod, bkash, nagad, rocket, bankTransfer } = payment.value;

        const paymentMethods = [
            { method: "COD", label: "Cash on Delivery", logo: paymentLogo("cod"), ...cod },
            { method: "BKASH", label: "bKash", logo: paymentLogo("bkash"), ...bkash },
            { method: "NAGAD", label: "Nagad", logo: paymentLogo("nagad"), ...nagad },
            { method: "ROCKET", label: "Rocket", logo: paymentLogo("rocket"), ...rocket },
            { method: "BANK_TRANSFER", label: "Bank Transfer", logo: paymentLogo("bankTransfer"), ...bankTransfer },
        ]
            .filter((method) => method.enabled)
            .map(({ enabled: _enabled, ...method }) => method);

        return {
            general: { ...general.value, ...imageUrls("general", general.images) },
            social: social.value,
            seo: { ...seo.value, ...imageUrls("seo", seo.images) },
            paymentMethods,
            inventory: {
                showOutOfStock: inventory.value.showOutOfStock,
                showStockCount: inventory.value.showStockCount,
            },
            maintenance: maintenance.value,
        };
    },

    getLegalPages: async () => {
        return (await loadGroup("legal")).value;
    },
};
