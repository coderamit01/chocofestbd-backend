import * as z from "zod";
import { findDistrict, findThana } from "./location.service";

export const districtField = z
    .string({ error: "District is required" })
    .trim()
    .min(1, { error: "District is required" })
    .transform((value, ctx) => {
        const district = findDistrict(value);

        if (!district) {
            ctx.addIssue({ code: "custom", message: "Select a valid district" });
            return z.NEVER;
        }

        return district.name;
    });

export const thanaField = z
    .string({ error: "Thana is required" })
    .trim()
    .min(1, { error: "Thana is required" });

export const refineLocation = (data: { district?: string; thana?: string }, ctx: z.RefinementCtx) => {
    if (!data.district || !data.thana) return;

    const thana = findThana(data.district, data.thana);

    if (!thana) {
        ctx.addIssue({ code: "custom", path: ["thana"], message: "Select a valid thana for this district" });
        return;
    }

    data.thana = thana.name;
};

export const districtParamSchema = z.object({
    district: z.string({ error: "District is required" }).trim().min(1, { error: "District is required" }),
});
