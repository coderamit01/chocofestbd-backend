import { Router } from "express"
import { authRoutes } from "../modules/auth/auth.route";
import { userRoutes } from "../modules/user/user.route";
import { bannerRoutes } from "../modules/banner/banner.route";
import { brandRoutes } from "../modules/brand/brand.route";


const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/banners", bannerRoutes);
router.use("/brands", brandRoutes);


export const IndexRoutes = router;