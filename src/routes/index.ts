import { Router } from "express"
import { authRoutes } from "../modules/auth/auth.route";
import { userRoutes } from "../modules/user/user.route";
import { bannerRoutes } from "../modules/banner/banner.route";
import { brandRoutes } from "../modules/brand/brand.route";
import { categoryRoutes } from "../modules/category/category.route";
import { tagRoutes } from "../modules/tag/tag.route";
import { faqRoutes } from "../modules/faq/faq.route";
import { locationRoutes } from "../modules/location/location.route";
import { productRoutes } from "../modules/product/product.route";
import { wishlistRoutes } from "../modules/wishlist/wishlist.route";
import { deliveryZoneRoutes } from "../modules/deliveryZone/deliveryZone.route";
import { addressRoutes } from "../modules/address/address.route";
import { couponRoutes } from "../modules/coupon/coupon.route";
import { cartRoutes } from "../modules/cart/cart.route";
import { reviewRoutes } from "../modules/review/review.route";
import { orderRoutes } from "../modules/order/order.route";


const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/banners", bannerRoutes);
router.use("/brands", brandRoutes);
router.use("/categories", categoryRoutes);
router.use("/tags", tagRoutes);
router.use("/faqs", faqRoutes);
router.use("/locations", locationRoutes);
router.use("/products", productRoutes);
router.use("/wishlists", wishlistRoutes);
router.use("/delivery-zones", deliveryZoneRoutes);
router.use("/addresses", addressRoutes);
router.use("/coupons", couponRoutes);
router.use("/cart", cartRoutes);
router.use("/reviews", reviewRoutes);
router.use("/orders", orderRoutes);


export const IndexRoutes = router;