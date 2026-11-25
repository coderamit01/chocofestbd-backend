import { Router } from "express";
import Authentication from "../../middlewares/Authentication";
import { dashboardController } from "./dashboard.controller";
import { DASHBOARD_ROLES } from "./dashboard.constant";


const router = Router();

router.get("/summary", Authentication(...DASHBOARD_ROLES), dashboardController.getSummary);
router.get("/sales-chart", Authentication(...DASHBOARD_ROLES), dashboardController.getSalesChart);
router.get("/overview", Authentication(...DASHBOARD_ROLES), dashboardController.getOverview);


export const dashboardRoutes = router;
