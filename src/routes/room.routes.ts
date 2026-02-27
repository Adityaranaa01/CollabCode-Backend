import { Router } from "express";
import { z } from "zod";
import * as roomController from "../controllers/room.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const createRoomSchema = z.object({
  name: z
    .string()
    .min(1, "Room name is required")
    .max(100, "Room name must be at most 100 characters")
    .trim(),
  language: z
    .string()
    .min(1, "Language is required")
    .max(50, "Language must be at most 50 characters"),
  isPublic: z.boolean().optional().default(false),
});

const joinByInviteSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
});

const roomIdParamsSchema = z.object({
  id: z.string().min(1, "Room ID is required"),
});

router.use(authenticate);

router.post("/", validate(createRoomSchema), roomController.createRoom);
router.get("/dashboard", roomController.getDashboard);
router.post("/join-by-invite", validate(joinByInviteSchema), roomController.joinByInvite);

router.get("/:id", validate(roomIdParamsSchema, "params"), roomController.getRoom);
router.delete("/:id", validate(roomIdParamsSchema, "params"), roomController.deleteRoom);

router.post("/:id/join", validate(roomIdParamsSchema, "params"), roomController.joinRoom);
router.post("/:id/invite", validate(roomIdParamsSchema, "params"), roomController.createInvite);

router.get("/:id/members", validate(roomIdParamsSchema, "params"), roomController.getRoomMembers);
router.delete("/:id/members/:userId", roomController.removeMember);

router.get("/:id/messages", validate(roomIdParamsSchema, "params"), roomController.getRoomMessages);

export default router;
