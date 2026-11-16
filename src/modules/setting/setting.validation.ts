import * as z from "zod";
import createDOMPurify, { type DOMPurify } from "dompurify";
import { JSDOM } from "jsdom";
import { NOTIFICATION_TYPE_KEYS, type NotificationType } from "../notification/notification.constant";

const TELEGRAM_DEFAULTS: Record<NotificationType, boolean> = {
    "order.created": true,
    "order.paymentPending": true,
    "order.cancelledByCustomer": true,
    "stock.low": false,
    "stock.out": true,
    "review.pending": false,
    "system.error": true,
};

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

let htmlPurifier: DOMPurify | undefined;

const sanitizeHtml = (value: string) => {
    htmlPurifier ??= createDOMPurify(new JSDOM("").window);
    return htmlPurifier.sanitize(value, { USE_PROFILES: { html: true } });
};

const BD_PHONE = /^01[3-9]\d{8}$/;

const text = (label: string, max: number, fallback = "") =>
    z
        .string({ error: `${label} must be a string` })
        .trim()
        .max(max, { error: `${label} must be at most ${max} characters` })
        .default(fallback);

const url = (label: string) =>
    text(label, 500).refine((value) => value === "" || (URL.canParse(value) && /^https?:\/\//i.test(value)), {
        error: `${label} must be a valid http or https link`,
    });

const phone = (label: string) =>
    text(label, 11).refine((value) => value === "" || BD_PHONE.test(value), {
        error: `${label} must be in the format 01XXXXXXXXX`,
    });

const email = (label: string) =>
    text(label, 200).refine((value) => value === "" || z.email().safeParse(value).success, {
        error: `${label} must be a valid email address`,
    });

const prefix = (label: string, fallback: string) =>
    z
        .string({ error: `${label} must be a string` })
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{1,10}$/, { error: `${label} must be 1 to 10 letters or numbers, without spaces or dashes` })
        .default(fallback);

const html = (label: string) => text(label, 50000).transform(sanitizeHtml);

const flag = (label: string, fallback: boolean) =>
    z.boolean({ error: `${label} must be true or false` }).default(fallback);

type Shape = Record<string, z.ZodType>;

const objectOf = <T extends Shape>(shape: T, strict: boolean) =>
    strict ? z.strictObject(shape, unrecognizedKeysError) : z.object(shape);

const eventToggle = (type: NotificationType, strict: boolean) =>
    objectOf({ telegram: flag(`${type} telegram`, TELEGRAM_DEFAULTS[type]) }, strict).prefault({});

export const ACCOUNT_TYPES = ["MERCHANT", "PERSONAL"] as const;

const mobileWallet = (label: string, strict: boolean) =>
    objectOf(
        {
            enabled: flag(`${label} enabled`, false),
            accountType: z
                .enum(ACCOUNT_TYPES, { error: `${label} account type must be MERCHANT or PERSONAL` })
                .default("PERSONAL"),
            accountNumber: phone(`${label} account number`),
            instructions: text(`${label} instructions`, 2000),
        },
        strict,
    )
        .refine((data) => !data.enabled || data.accountNumber, {
            path: ["accountNumber"],
            error: `${label} account number is required when it is enabled`,
        })
        .prefault({});

const bankTransfer = (strict: boolean) =>
    objectOf(
        {
            enabled: flag("Bank transfer enabled", false),
            bankName: text("Bank name", 100),
            accountName: text("Account name", 100),
            accountNumber: text("Account number", 30),
            branch: text("Branch", 100),
            routingNumber: text("Routing number", 20),
            instructions: text("Bank transfer instructions", 2000),
        },
        strict,
    )
        .refine((data) => !data.enabled || (data.bankName && data.accountName && data.accountNumber), {
            path: ["enabled"],
            error: "Bank name, account name and account number are required when bank transfer is enabled",
        })
        .prefault({});

const buildSchemas = (strict: boolean) => ({
    general: objectOf(
        {
            storeName: text("Store name", 100, "ChocoFest BD"),
            tagline: text("Tagline", 200),
            phone: phone("Phone"),
            whatsapp: phone("WhatsApp number"),
            email: email("Email"),
            address: text("Address", 300),
            mapUrl: url("Map link"),
            businessHours: text("Business hours", 200),
            copyright: text("Copyright text", 200),
        },
        strict,
    ),
    social: objectOf(
        {
            facebook: url("Facebook link"),
            instagram: url("Instagram link"),
            youtube: url("YouTube link"),
            tiktok: url("TikTok link"),
            messenger: url("Messenger link"),
        },
        strict,
    ),
    seo: objectOf(
        {
            metaTitle: text("Meta title", 150),
            metaDescription: text("Meta description", 300),
            googleAnalyticsId: text("Google Analytics id", 50),
            gtmId: text("GTM id", 50),
            facebookPixelId: text("Facebook Pixel id", 50),
            searchConsoleCode: text("Search Console code", 200),
            robotsTxt: text("robots.txt", 5000),
        },
        strict,
    ),
    payment: objectOf(
        {
            cod: objectOf(
                {
                    enabled: flag("Cash on delivery enabled", true),
                    instructions: text("Cash on delivery instructions", 2000),
                },
                strict,
            ).prefault({}),
            bkash: mobileWallet("bKash", strict),
            nagad: mobileWallet("Nagad", strict),
            rocket: mobileWallet("Rocket", strict),
            bankTransfer: bankTransfer(strict),
        },
        strict,
    ).refine(
        (data) =>
            data.cod.enabled || data.bkash.enabled || data.nagad.enabled || data.rocket.enabled || data.bankTransfer.enabled,
        { error: "Enable at least one payment method" },
    ),
    inventory: objectOf(
        {
            defaultLowStockThreshold: z
                .number({ error: "Low stock threshold must be a number" })
                .int({ error: "Low stock threshold must be a whole number" })
                .min(0, { error: "Low stock threshold cannot be negative" })
                .max(1000, { error: "Low stock threshold must be at most 1000" })
                .default(5),
            showOutOfStock: flag("showOutOfStock", true),
            showStockCount: flag("showStockCount", false),
        },
        strict,
    ),
    maintenance: objectOf(
        {
            enabled: flag("Maintenance mode", false),
            message: text("Maintenance message", 500, "We are updating our store. Please check back soon."),
            storeClosed: flag("Store closed", false),
            closedMessage: text("Store closed message", 500),
        },
        strict,
    ),
    notifications: objectOf(
        {
            telegramEnabled: flag("Telegram enabled", false),
            events: objectOf(
                Object.fromEntries(
                    NOTIFICATION_TYPE_KEYS.map((type) => [type, eventToggle(type, strict)]),
                ) as unknown as Record<NotificationType, ReturnType<typeof eventToggle>>,
                strict,
            ).prefault({}),
        },
        strict,
    ),
    numbering: objectOf(
        {
            orderPrefix: prefix("Order number prefix", "CF"),
            invoicePrefix: prefix("Invoice number prefix", "INV"),
            skuPrefix: prefix("SKU prefix", "CF"),
        },
        strict,
    ),
    legal: objectOf(
        {
            terms: html("Terms"),
            privacyPolicy: html("Privacy policy"),
            returnPolicy: html("Return policy"),
            deliveryPolicy: html("Delivery policy"),
        },
        strict,
    ),
});

export const settingInputSchemas = buildSchemas(true);
export const settingStoredSchemas = buildSchemas(false);

export const SETTING_GROUPS = Object.keys(settingInputSchemas) as SettingGroup[];

export type SettingGroup = keyof typeof settingInputSchemas;
export type SettingValue<G extends SettingGroup> = z.output<(typeof settingStoredSchemas)[G]>;

export const SETTING_IMAGE_FIELDS = {
    general: ["logo", "darkLogo", "favicon"],
    social: [],
    seo: ["ogImage"],
    payment: ["cod", "bkash", "nagad", "rocket", "bankTransfer"],
    inventory: [],
    maintenance: [],
    notifications: [],
    numbering: [],
    legal: [],
} as const satisfies Record<SettingGroup, readonly string[]>;

export const ALL_SETTING_IMAGE_FIELDS = [...new Set(Object.values(SETTING_IMAGE_FIELDS).flat())];

export const settingGroupParamSchema = z.object({
    group: z.enum(SETTING_GROUPS as [SettingGroup, ...SettingGroup[]], { error: "Invalid setting group" }),
});

export const settingImageParamSchema = settingGroupParamSchema.extend({
    field: z.string({ error: "Image field is required" }).trim().min(1, { error: "Image field is required" }),
});
