import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { upload } from "../../middlewares/upload";
import { settingController } from "./setting.controller";
import { ALL_SETTING_IMAGE_FIELDS } from "./setting.validation";


const router = Router();

const settingAdmins = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

const settingImages = upload.fields(ALL_SETTING_IMAGE_FIELDS.map((name) => ({ name, maxCount: 1 })));

router.get("/", settingController.getPublicSettings);
router.get("/legal", settingController.getLegalPages);
router.get("/admin", Authentication(...settingAdmins), settingController.getAllSettings);
router.get("/admin/:group", Authentication(...settingAdmins), settingController.getSettingGroup);
router.put("/admin/:group", Authentication(...settingAdmins), settingController.updateSettingGroup);
router.put("/admin/:group/images", Authentication(...settingAdmins), settingImages, settingController.uploadSettingImages);
router.delete("/admin/:group/images/:field", Authentication(...settingAdmins), settingController.removeSettingImage);


export const settingRoutes = router;
