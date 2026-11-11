import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validateRequest } from "../../middlewares/validateRequest";
import { signInSchema, signUpSchema } from "./auth.validation";
import Authentication from "../../middlewares/Authentication";
import { signInLimiter, signUpLimiter } from "../../middlewares/rateLimiter";


const router = Router();

router.post("/sign-up", signUpLimiter, validateRequest(signUpSchema), AuthController.signUp)
router.post("/sign-in", signInLimiter, validateRequest(signInSchema), AuthController.signIn)
router.post("/sign-out", AuthController.signOut)
router.post("/sign-out-all", AuthController.signOutAll)

router.get("/me", Authentication(), AuthController.getProfile)

export const authRoutes = router;
