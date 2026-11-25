import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { riderController } from "./rider.controller";
import { markDeliveredSchema, markFailedSchema } from "./rider.validation";


const router = Router();

router.get("/deliveries", Authentication(UserRole.RIDER), riderController.getMyDeliveries);
router.patch("/deliveries/:orderId/delivered", Authentication(UserRole.RIDER), validateRequest(markDeliveredSchema), riderController.markDelivered);
router.patch("/deliveries/:orderId/failed", Authentication(UserRole.RIDER), validateRequest(markFailedSchema), riderController.markFailed);


export const riderRoutes = router;
