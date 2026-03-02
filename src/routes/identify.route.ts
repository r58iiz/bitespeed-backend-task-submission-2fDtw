import { Router } from "express";
import { identify } from "../controllers/identify.controller";

const router = Router();

router.post("/", identify);

export default router;
