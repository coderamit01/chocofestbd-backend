import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import { Prisma } from "../../generated/prisma/client";
import { ProductStatus } from "../../generated/prisma/enums";
import { MAX_CART_ITEMS, MAX_ITEM_QUANTITY } from "./cart.validation";
import type { AddToCartPayload, MergeCartPayload, UpdateCartItemPayload } from "./cart.validation";

const Decimal = Prisma.Decimal;

const liveProduct: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE, deletedAt: null };

const cartItemSelect = {
    id: true,
    quantity: true,
    createdAt: true,
    product: {
        select: {
            id: true,
            name: true,
            slug: true,
            sku: true,
            image: true,
            price: true,
            discountPrice: true,
            stock: true,
            status: true,
            deletedAt: true,
        },
    },
} satisfies Prisma.CartItemSelect;

type CartItemRow = Prisma.CartItemGetPayload<{ select: typeof cartItemSelect }>;

const buildCart = (items: CartItemRow[]) => {
    let subtotal = new Decimal(0);
    let totalQuantity = 0;

    const lines = items.map(({ product, ...item }) => {
        const isLive = product.status === ProductStatus.ACTIVE && product.deletedAt === null;
        const onSale = product.discountPrice !== null && product.discountPrice.lt(product.price);
        const unitPrice = onSale ? product.discountPrice! : product.price;
        const lineTotal = unitPrice.mul(item.quantity);

        let issue: string | null = null;

        if (!isLive) {
            issue = "This product is no longer available";
        } else if (product.stock <= 0) {
            issue = "Out of stock";
        } else if (item.quantity > product.stock) {
            issue = `Only ${product.stock} left in stock`;
        }

        if (!issue) {
            subtotal = subtotal.add(lineTotal);
            totalQuantity += item.quantity;
        }

        return {
            id: item.id,
            quantity: item.quantity,
            unitPrice: unitPrice.toFixed(2),
            regularPrice: product.price.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            isAvailable: issue === null,
            issue,
            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                sku: product.sku,
                image: product.image,
                stock: isLive ? product.stock : 0,
            },
        };
    });

    return {
        items: lines,
        itemCount: lines.length,
        totalQuantity,
        subtotal: subtotal.toFixed(2),
        canCheckout: lines.length > 0 && lines.every((line) => line.isAvailable),
    };
};

const getOrCreateCartId = async (userId: string) => {
    const cart = await prisma.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: { id: true },
    });

    return cart.id;
};

const findLiveProduct = async (productId: string) => {
    const product = await prisma.product.findFirst({
        where: { ...liveProduct, id: productId },
        select: { id: true, stock: true },
    });

    if (!product) {
        throw new AppError("Product not found", 404);
    }

    return product;
};

const checkStock = (stock: number, quantity: number) => {
    if (stock <= 0) {
        throw new AppError("This product is out of stock", 400);
    }

    if (quantity > stock) {
        throw new AppError(`Only ${stock} left in stock`, 400);
    }

    if (quantity > MAX_ITEM_QUANTITY) {
        throw new AppError(`You can add at most ${MAX_ITEM_QUANTITY} of a product`, 400);
    }
};

export const cartService = {
    getMyCart: async (userId: string) => {
        const items = await prisma.cartItem.findMany({
            where: { cart: { userId } },
            select: cartItemSelect,
            orderBy: { createdAt: "asc" },
        });

        return buildCart(items);
    },

    addToCart: async (userId: string, payload: AddToCartPayload) => {
        const product = await findLiveProduct(payload.productId);
        const cartId = await getOrCreateCartId(userId);

        const existing = await prisma.cartItem.findUnique({
            where: { cartId_productId: { cartId, productId: product.id } },
            select: { quantity: true },
        });

        if (!existing) {
            const count = await prisma.cartItem.count({ where: { cartId } });

            if (count >= MAX_CART_ITEMS) {
                throw new AppError(`Your cart can have at most ${MAX_CART_ITEMS} products`, 400);
            }
        }

        const quantity = (existing?.quantity ?? 0) + payload.quantity;
        checkStock(product.stock, quantity);

        await prisma.cartItem.upsert({
            where: { cartId_productId: { cartId, productId: product.id } },
            create: { cartId, productId: product.id, quantity },
            update: { quantity },
        });

        return cartService.getMyCart(userId);
    },

    updateCartItem: async (userId: string, productId: string, payload: UpdateCartItemPayload) => {
        const item = await prisma.cartItem.findFirst({
            where: { productId, cart: { userId } },
            select: { id: true },
        });

        if (!item) {
            throw new AppError("This product is not in your cart", 404);
        }

        const product = await findLiveProduct(productId);
        checkStock(product.stock, payload.quantity);

        await prisma.cartItem.update({
            where: { id: item.id },
            data: { quantity: payload.quantity },
        });

        return cartService.getMyCart(userId);
    },

    removeFromCart: async (userId: string, productId: string) => {
        const result = await prisma.cartItem.deleteMany({
            where: { productId, cart: { userId } },
        });

        if (result.count === 0) {
            throw new AppError("This product is not in your cart", 404);
        }

        return cartService.getMyCart(userId);
    },

    clearCart: async (userId: string) => {
        await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
    },

    mergeCart: async (userId: string, payload: MergeCartPayload) => {
        const quantities = new Map<string, number>();

        for (const item of payload.items) {
            quantities.set(item.productId, Math.max(quantities.get(item.productId) ?? 0, item.quantity));
        }

        const products = await prisma.product.findMany({
            where: { ...liveProduct, id: { in: [...quantities.keys()] }, stock: { gt: 0 } },
            select: { id: true, stock: true },
        });

        const cartId = await getOrCreateCartId(userId);

        const existing = await prisma.cartItem.findMany({
            where: { cartId },
            select: { productId: true, quantity: true },
        });

        const current = new Map(existing.map((item) => [item.productId, item.quantity]));
        let slots = MAX_CART_ITEMS - current.size;
        let added = 0;
        let updated = 0;

        const writes: Prisma.PrismaPromise<unknown>[] = [];

        for (const product of products) {
            const wanted = quantities.get(product.id)!;
            const existingQuantity = current.get(product.id);
            const quantity = Math.min(Math.max(existingQuantity ?? 0, wanted), product.stock, MAX_ITEM_QUANTITY);

            if (existingQuantity === undefined) {
                if (slots <= 0) continue;
                slots -= 1;
                added += 1;
                writes.push(prisma.cartItem.create({ data: { cartId, productId: product.id, quantity } }));
            } else if (quantity !== existingQuantity) {
                updated += 1;
                writes.push(
                    prisma.cartItem.update({
                        where: { cartId_productId: { cartId, productId: product.id } },
                        data: { quantity },
                    }),
                );
            }
        }

        await prisma.$transaction(writes);

        return {
            added,
            updated,
            skipped: quantities.size - added - updated,
            cart: await cartService.getMyCart(userId),
        };
    },
};
