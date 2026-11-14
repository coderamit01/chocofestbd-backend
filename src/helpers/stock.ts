import type { Prisma } from "../generated/prisma/client";
import { StockStatus } from "../generated/prisma/enums";

type StockFields = {
    manageStock: boolean;
    stock: number;
    stockStatus: StockStatus;
};

export const stockSelect = {
    manageStock: true,
    stock: true,
    stockStatus: true,
} satisfies Prisma.ProductSelect;

export const inStockWhere: Prisma.ProductWhereInput = {
    OR: [
        { manageStock: true, stock: { gt: 0 } },
        { manageStock: false, stockStatus: StockStatus.IN_STOCK },
    ],
};

export const outOfStockWhere: Prisma.ProductWhereInput = {
    OR: [
        { manageStock: true, stock: { lte: 0 } },
        { manageStock: false, stockStatus: StockStatus.OUT_OF_STOCK },
    ],
};

export const isInStock = (product: StockFields) =>
    product.manageStock ? product.stock > 0 : product.stockStatus === StockStatus.IN_STOCK;

export const getStockLimit = (product: StockFields) => {
    if (!isInStock(product)) return 0;

    return product.manageStock ? product.stock : null;
};

export const getStockError = (product: StockFields, quantity: number) => {
    const limit = getStockLimit(product);

    if (limit === 0) return "Out of stock";
    if (limit !== null && quantity > limit) return `Only ${limit} left in stock`;

    return null;
};
