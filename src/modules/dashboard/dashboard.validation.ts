import * as z from "zod";
import { GROUP_BY_VALUES, MAX_HOURLY_RANGE_DAYS, MAX_RANGE_DAYS } from "./dashboard.constant";

const DAY_MS = 24 * 60 * 60 * 1000;

const dateQuery = (label: string) =>
    z
        .string({ error: `${label} must be a string` })
        .regex(/^\d{4}-\d{2}-\d{2}$/, { error: `${label} must be in YYYY-MM-DD format` })
        .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), { error: `${label} is not a valid date` })
        .optional();

export const dateRangeQuerySchema = z
    .object({
        from: dateQuery("from"),
        to: dateQuery("to"),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, { error: "from must be before or equal to to", path: ["from"] })
    .refine(
        (q) => !q.from || !q.to || (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS < MAX_RANGE_DAYS,
        { error: `Date range cannot be more than ${MAX_RANGE_DAYS} days`, path: ["to"] },
    );

export const salesChartQuerySchema = dateRangeQuerySchema
    .and(
        z.object({
            groupBy: z.enum(GROUP_BY_VALUES, { error: "groupBy must be hour, day, week or month" }).default("day"),
        }),
    )
    .refine(
        (q) =>
            q.groupBy !== "hour" ||
            !q.from ||
            !q.to ||
            (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS < MAX_HOURLY_RANGE_DAYS,
        { error: `Hourly charts cover at most ${MAX_HOURLY_RANGE_DAYS} days`, path: ["groupBy"] },
    );

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
export type SalesChartQuery = z.infer<typeof salesChartQuerySchema>;
