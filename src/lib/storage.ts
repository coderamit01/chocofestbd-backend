import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import createDOMPurify, { type DOMPurify } from "dompurify";
import { fileTypeFromBuffer } from "file-type";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import { envVars } from "../config/env";
import { AppError } from "../helpers/AppError";

export type StorageFolder = "gallery" | "users" | "products" | "categories" | "brands" | "banners" | "reviews" | "blog" | "invoice";

export type FileKind = "image" | "svg" | "pdf";

const RASTER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const FILE_KIND_LABELS: Record<FileKind, string> = {
    image: "JPG, PNG, WebP or AVIF",
    svg: "SVG",
    pdf: "PDF",
};
const MAX_WIDTH = 1600;
const THUMBNAIL_WIDTH = 400;
const WEBP_QUALITY = 80;
const ROOT_DIR = path.resolve(envVars.STORAGE_LOCAL_DIR);

const resolvePath = (key: string) => {
    const filePath = path.resolve(ROOT_DIR, key);

    if (!filePath.startsWith(ROOT_DIR + path.sep)) {
        throw new Error(`Invalid storage key: ${key}`);
    }

    return filePath;
};

const saveFile = async (key: string, body: Buffer) => {
    const filePath = resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
};

const removeFile = async (key: string) => {
    await rm(resolvePath(key), { force: true });
};

const hasThumbnail = (key: string) => key.endsWith(".webp");

const getThumbnailKey = (key: string) => key.replace(/\.webp$/, "-thumb.webp");

const toWebp = (input: Buffer, width: number) =>
    sharp(input)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

let svgPurifier: DOMPurify | undefined;

const sanitizeSvg = (input: Buffer) => {
    svgPurifier ??= createDOMPurify(new JSDOM("").window);

    const clean = svgPurifier.sanitize(input.toString("utf8"), {
        USE_PROFILES: { svg: true, svgFilters: true },
    });

    if (!/<svg[\s>]/i.test(clean)) {
        throw new AppError("Invalid SVG file", 400);
    }

    return Buffer.from(clean, "utf8");
};

const isSvg = (input: Buffer) => /<svg[\s>]/i.test(input.subarray(0, 4096).toString("utf8"));

const detectFileKind = async (input: Buffer): Promise<FileKind | null> => {
    const fileType = await fileTypeFromBuffer(input);

    if (fileType && RASTER_IMAGE_TYPES.has(fileType.mime)) return "image";
    if (fileType?.mime === "application/pdf") return "pdf";
    if ((!fileType || fileType.mime === "application/xml") && isSvg(input)) return "svg";

    return null;
};

export const uploadFile = async (
    file: Express.Multer.File,
    folder: StorageFolder,
    options: { accept?: FileKind[]; thumbnail?: boolean } = {},
) => {
    const accept = options.accept ?? ["image"];
    const kind = await detectFileKind(file.buffer);

    if (!kind || !accept.includes(kind)) {
        const allowed = accept.map((item) => FILE_KIND_LABELS[item]).join(", ");
        throw new AppError(`Only ${allowed} files are allowed`, 400);
    }

    const id = randomUUID();

    if (kind === "pdf") {
        const key = `${folder}/${id}.pdf`;
        await saveFile(key, file.buffer);
        return { key };
    }

    if (kind === "svg") {
        const key = `${folder}/${id}.svg`;
        await saveFile(key, sanitizeSvg(file.buffer));
        return { key };
    }

    const key = `${folder}/${id}.webp`;
    await saveFile(key, await toWebp(file.buffer, MAX_WIDTH));

    if (options.thumbnail) {
        try {
            await saveFile(getThumbnailKey(key), await toWebp(file.buffer, THUMBNAIL_WIDTH));
        } catch (error) {
            await deleteFile(key);
            throw error;
        }
    }

    return { key };
};

export const deleteFile = async (key: string | null | undefined) => {
    if (!key) return;

    try {
        const keys = hasThumbnail(key) ? [key, getThumbnailKey(key)] : [key];
        await Promise.all(keys.map((item) => removeFile(item)));
    } catch (error) {
        console.error(`Failed to delete file "${key}":`, error);
    }
};

export const getFileUrl = (key: string | null | undefined) =>
    key ? `${envVars.STORAGE_PUBLIC_URL}/${key}` : null;

export const getThumbnailUrl = (key: string | null | undefined) =>
    key ? `${envVars.STORAGE_PUBLIC_URL}/${hasThumbnail(key) ? getThumbnailKey(key) : key}` : null;
