import { Router } from "express";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { addressController } from "./address.controller";
import { createAddressSchema, updateAddressSchema } from "./address.validation";


const router = Router();

router.get("/", Authentication(), addressController.getMyAddresses);
router.get("/:addressId", Authentication(), addressController.getMyAddressById);
router.post("/", Authentication(), validateRequest(createAddressSchema), addressController.createAddress);
router.put("/:addressId", Authentication(), validateRequest(updateAddressSchema), addressController.updateAddress);
router.patch("/:addressId/default", Authentication(), addressController.setDefaultAddress);
router.delete("/:addressId", Authentication(), addressController.deleteAddress);


export const addressRoutes = router;
