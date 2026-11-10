import { Router } from "express";
import { locationController } from "./location.controller";


const router = Router();

router.get("/districts", locationController.getDistricts);
router.get("/districts/:district/area", locationController.getThanas);


export const locationRoutes = router;
