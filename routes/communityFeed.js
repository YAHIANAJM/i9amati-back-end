import express from "express";
import { auth } from "../middleware/auth.js";
import {
  createComment,
  deleteComment,
  getComments,
  getCommentReplies,
  likeComment,
  getAllGroups,
  getGroupMembers,
  updateGroupDetails,
  manageGroupUser,
  getGroupDetails,
} from "../controllers/communityFeedController.js";

const router = express.Router();

// All routes require authentication
router.use(auth);

// GET /api/community/comments - Get all comments (community feed)
router.get("/comments", getComments);

// POST /api/community/comments - Create a new comment (any authenticated user)
router.post("/comments", createComment);

// DELETE /api/community/comments/:commentId - Soft delete a comment (union_agent or group managers)
router.delete("/comments/:commentId", deleteComment);

// POST /api/community/comments/:commentId/like - Like or unlike a comment (group members only)
router.post("/comments/:commentId/like", likeComment);

// GET /api/community/comments/:commentId/replies - Get replies for a specific comment (paginated)
router.get("/comments/:commentId/replies", getCommentReplies);

// Group Management Routes

// GET /api/community/groups - Get all groups (paginated, only managers)
router.get("/groups", getAllGroups);

// GET /api/community/groups/:groupId - Get specific group details (group members only)
router.get("/groups/:groupId", getGroupDetails);

// GET /api/community/groups/:groupId/members - Get all members but managers of a group (paginated)
router.get("/groups/:groupId/members", getGroupMembers);

// PUT /api/community/groups/:groupId - Update only group details (group managers only)
router.put("/groups/:groupId", updateGroupDetails);

// POST /api/community/groups/:groupId/users/:userId - Add or remove a user to/from group (group managers only)
router.post("/groups/:groupId/users/:userId", manageGroupUser);

export default router;
