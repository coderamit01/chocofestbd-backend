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


export const IndexRoutes = router;