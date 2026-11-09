export const generateSlug = (value: string) =>
    value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
