import locations from "../../data/bd-locations.json" with { type: "json" };
import { AppError } from "../../helpers/AppError";

const toKey = (value: string) => value.trim().toLowerCase();

const districtMap = new Map(locations.map((district) => [toKey(district.name), district]));

export const findDistrict = (name: string) => districtMap.get(toKey(name)) ?? null;

export const findThana = (districtName: string, thanaName: string) =>
    findDistrict(districtName)?.thanas.find((thana) => toKey(thana.name) === toKey(thanaName)) ?? null;

export const locationService = {
    getDistricts: () => locations.map(({ name, bnName }) => ({ name, bnName })),

    getThanas: (districtName: string) => {
        const district = findDistrict(districtName);

        if (!district) {
            throw new AppError("District not found", 404);
        }

        return district.thanas;
    },
};
