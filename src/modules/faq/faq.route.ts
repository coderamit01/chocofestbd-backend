import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { faqController } from "./faq.controller";
import { createFaqSchema, updateFaqSchema } from "./faq.validation";


const router = Router();

router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(createFaqSchema), faqController.createFaq);
router.get("/", faqController.getPublicFaqs);
router.get("/admin", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), faqController.getAllFaqs);
router.get("/admin/:faqId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), faqController.getFaqById);
router.put("/:faqId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(updateFaqSchema), faqController.updateFaq);
router.delete("/:faqId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), faqController.deleteFaq);


export const faqRoutes = router;
