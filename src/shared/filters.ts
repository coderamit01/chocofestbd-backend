import * as z from "zod";

export const searchTermQuery = z
    .string()
    .trim()
    .min(1, { error: "Search term cannot be empty" })
    .max(100, { error: "Search term must be at most 100 characters" })
    .optional();

export const slugQuery = (label: string) =>
    z
        .string({ error: `${label} must be a string` })
        .trim()
        .min(1, { error: `${label} cannot be empty` })
        .optional();

export const numberQuery = (label: string) =>
    z.coerce
        .number({ error: `${label} must be a number` })
        .min(0, { error: `${label} cannot be negative` })
        .optional();

export const booleanQuery = (label: string) =>
    z
        .enum(["true", "false"], { error: `${label} must be true or false` })
        .transform((value) => value === "true")
        .optional();

export const buildSearchFilter = <T>(searchTerm: string | undefined, fields: string[]) => {
    if (!searchTerm) {
        return {} as T;
    }

    const conditions = fields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
    }));

    return { OR: conditions } as T;
};

export const buildRangeFilter = (min: number | undefined, max: number | undefined) => {
    if (min === undefined && max === undefined) {
        return undefined;
    }

    const range: { gte?: number; lte?: number } = {};

    if (min !== undefined) {
        range.gte = min;
    }

    if (max !== undefined) {
        range.lte = max;
    }

    return range;
};
