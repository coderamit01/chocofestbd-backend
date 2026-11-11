import { Router } from "express";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { wishlistController } from "./wishlist.controller";
import { addToWishlistSchema, mergeWishlistSchema } from "./wishlist.validation";


const router = Router();

router.get("/", Authentication(), wishlistController.getMyWishlist);

router.get("/product-ids", Authentication(), wishlistController.getMyWishlistProductIds);

router.post("/", Authentication(), validateRequest(addToWishlistSchema), wishlistController.addToWishlist);

router.post("/merge", Authentication(), validateRequest(mergeWishlistSchema), wishlistController.mergeWishlist);

router.delete("/:productId", Authentication(), wishlistController.removeFromWishlist);


export const wishlistRoutes = router;
