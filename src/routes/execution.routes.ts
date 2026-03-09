import { Router } from "express";
import { z } from "zod";
import * as executionController from "../controllers/execution.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const executeSchema = z.object({
  language: z.string().min(1, "Language is required"),
  sourceCode: z.string().min(1, "Source code is required").max(50000),
  stdin: z.string().max(10000).optional(),
});

router.use(authenticate);

router.post("/", validate(executeSchema), executionController.runCode);

export default router;
