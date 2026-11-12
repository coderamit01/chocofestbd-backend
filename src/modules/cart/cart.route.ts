import { Router } from "express";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { cartController } from "./cart.controller";
import { addToCartSchema, mergeCartSchema, updateCartItemSchema } from "./cart.validation";


const router = Router();

router.get("/", Authentication(), cartController.getMyCart);
router.post("/items", Authentication(), validateRequest(addToCartSchema), cartController.addToCart);
router.post("/merge", Authentication(), validateRequest(mergeCartSchema), cartController.mergeCart);
router.patch("/items/:productId", Authentication(), validateRequest(updateCartItemSchema), cartController.updateCartItem);
router.delete("/items/:productId", Authentication(), cartController.removeFromCart);
router.delete("/", Authentication(), cartController.clearCart);


export const cartRoutes = router;
