import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { deliveryZoneController } from "./deliveryZone.controller";
import { createDeliveryZoneSchema, updateDeliveryZoneSchema } from "./deliveryZone.validation";


const router = Router();

router.get("/", deliveryZoneController.getPublicDeliveryZones);
router.get("/admin", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), deliveryZoneController.getAllDeliveryZones);
router.get("/admin/:zoneId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), deliveryZoneController.getDeliveryZoneById);
router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(createDeliveryZoneSchema), deliveryZoneController.createDeliveryZone);
router.put("/:zoneId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(updateDeliveryZoneSchema), deliveryZoneController.updateDeliveryZone);
router.delete("/:zoneId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), deliveryZoneController.deleteDeliveryZone);


export const deliveryZoneRoutes = router;
