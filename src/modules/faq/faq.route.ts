import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { faqController } from "./faq.controller";
import { createFaqSchema, updateFaqSchema } from "./faq.validation";


const router = Router();

const faqEditors = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
const faqAdmins = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

router.post("/", Authentication(...faqEditors), validateRequest(createFaqSchema), faqController.createFaq);
router.get("/", faqController.getPublicFaqs);
router.get("/admin", Authentication(...faqEditors), faqController.getAllFaqs);
router.get("/admin/:faqId", Authentication(...faqEditors), faqController.getFaqById);
router.put("/:faqId", Authentication(...faqEditors), validateRequest(updateFaqSchema), faqController.updateFaq);
router.delete("/:faqId", Authentication(...faqAdmins), faqController.deleteFaq);


export const faqRoutes = router;
