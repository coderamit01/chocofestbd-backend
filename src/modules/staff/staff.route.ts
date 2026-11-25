import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { staffController } from "./staff.controller";
import { inviteStaffSchema } from "./staff.validation";


const router = Router();

router.get("/", Authentication(UserRole.SUPER_ADMIN), staffController.getStaff);
router.post("/", Authentication(UserRole.SUPER_ADMIN), validateRequest(inviteStaffSchema), staffController.inviteStaff);


export const staffRoutes = router;
