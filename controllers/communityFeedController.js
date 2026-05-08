import Comment from "../models/Comment.js";
import User from "../models/User.js";
import Group from "../models/Group.js";
import { validatePagination } from "../validationSchemas/validatePagination.js";

// Create a new comment - any account type can create
export const createComment = async (req, res) => {
  try {
    const { comment, parent_comment_id, group_id } = req.body;

    // Validate required fields
    if (!comment || comment.trim() === "") {
      return res.status(400).json({ error: "Comment content is required" });
    }

    if (!group_id) {
      return res.status(400).json({ error: "Group ID is required" });
    }
    const group = await Group.findById(group_id);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Validate that user has access to the group
    const user = await User.findById(req.user.id);
    const isUnionAgent = user.role === "union_agent";

    // Union agents can access groups they manage
    // Other users need to be members or managers of the group
    const hasAccess = isUnionAgent
      ? group.managers.includes(req.user.id)
      : user.groups.includes(group_id) || group.managers.includes(req.user.id);

    if (!hasAccess) {
      return res
        .status(403)
        .json({ error: "You don't have access to this group" });
    }

    // If parent_comment_id is provided, validate it exists and is not deleted
    if (parent_comment_id) {
      const parentComment = await Comment.findById(parent_comment_id);
      if (!parentComment) {
        return res.status(404).json({ error: "Parent comment not found" });
      }
      if (parentComment.deleted_at) {
        return res
          .status(400)
          .json({ error: "Cannot reply to a deleted comment" });
      }
      // Validate parent comment belongs to the same group
      if (parentComment.group.toString() !== group_id) {
        return res
          .status(400)
          .json({ error: "Parent comment must belong to the same group" });
      }
    }

    // Create the comment
    const newComment = new Comment({
      user: req.user.id,
      group: group_id,
      comment: comment.trim(),
      parent_comment_id: parent_comment_id || null,
      love_ids: [], // Start with empty love_ids array
    });

    await newComment.save();

    // Populate user information for the response
    await newComment.populate("user", "name  email");
    await newComment.populate("group", "name");
    await newComment.populate("parent_comment_id", "comment user");

    res.status(201).json(newComment);
  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
};

// Soft delete a comment - union_agent or group managers can delete
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Check if user is a union_agent or a group manager
    const isUnionAgent = req.user.role === "union_agent";

    let isGroupManager = false;
    if (!isUnionAgent) {
      // Check if user is a manager of the group this comment belongs to
      const comment = await Comment.findById(commentId).populate("group");
      if (comment && comment.group.managers.includes(req.user.id)) {
        isGroupManager = true;
      }
    }

    if (!isUnionAgent && !isGroupManager) {
      return res.status(403).json({
        error: "Only union agents or group managers can delete comments",
      });
    }

    // Find the comment
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    // Check if already deleted
    if (comment.deleted_at) {
      return res.status(400).json({ error: "Comment is already deleted" });
    }

    // Soft delete by setting deleted_at
    comment.deleted_at = new Date();
    await comment.save();

    res.json({ message: "Comment deleted successfully", commentId });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ error: "Failed to delete comment" });
  }
};

// Get replies for a specific comment (paginated) - group members only
export const getCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const paginationResult = validatePagination.safeParse(req.query);

    if (!paginationResult.success) {
      return res.status(400).json({ error: paginationResult.error.message });
    }

    // Check if the parent comment exists and is not deleted
    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return res.status(404).json({ error: "Parent comment not found" });
    }
    if (parentComment.deleted_at) {
      return res.status(404).json({ error: "Parent comment has been deleted" });
    }

    // Validate that user has access to the group this comment belongs to
    const user = await User.findById(req.user.id);
    const group = await Group.findById(parentComment.group);
    const isUnionAgent = user.role === "union_agent";

    // Union agents can access groups they manage
    // Other users need to be members or managers of the group
    const hasAccess = isUnionAgent
      ? group.managers.includes(req.user.id)
      : user.groups.includes(parentComment.group.toString()) ||
        group.managers.includes(req.user.id);

    if (!hasAccess) {
      return res
        .status(403)
        .json({ error: "You don't have access to this group" });
    }

    const { page = 1, limit = 10 } = paginationResult.data;

    // Get replies (comments that have this comment as parent)
    const replies = await Comment.find({
      parent_comment_id: commentId,
      deleted_at: null,
      group: parentComment.group,
    })
      .populate("user", "name  email role")
      .populate("group", "name")
      .sort({ createdAt: -1 }) // Newest first for replies
      .skip((page - 1) * limit)
      .limit(limit);

    res.json(replies);
  } catch (error) {
    console.error("Error fetching comment replies:", error);
    res.status(500).json({ error: "Failed to fetch comment replies" });
  }
};

// Like or unlike a comment - group members only
export const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Check if the comment exists and is not deleted
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }
    if (comment.deleted_at) {
      return res.status(404).json({ error: "Comment has been deleted" });
    }

    // Validate that user has access to the group this comment belongs to
    const user = await User.findById(req.user.id);
    const group = await Group.findById(comment.group);
    const isUnionAgent = user.role === "union_agent";

    // Union agents can access groups they manage
    // Other users need to be members or managers of the group
    const hasAccess = isUnionAgent
      ? group.managers.includes(req.user.id)
      : user.groups.includes(comment.group.toString()) ||
        group.managers.includes(req.user.id);

    if (!hasAccess) {
      return res
        .status(403)
        .json({ error: "You don't have access to this group" });
    }

    // Check if user already liked this comment
    const userIdStr = req.user.id.toString();
    const isLiked = comment.love_ids.some((id) => id.toString() === userIdStr);

    if (isLiked) {
      // Unlike: remove user from love_ids
      comment.love_ids = comment.love_ids.filter(
        (id) => id.toString() !== userIdStr
      );
    } else {
      // Like: add user to love_ids
      comment.love_ids.push(req.user.id);
    }

    await comment.save();

    res.json({
      message: isLiked
        ? "Comment unliked successfully"
        : "Comment liked successfully",
      isLiked: !isLiked,
      likesCount: comment.love_ids.length,
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    res.status(500).json({ error: "Failed to like comment" });
  }
};

// Optional: Get all comments (root level and nested) - can be used to display the feed
export const getComments = async (req, res) => {
  try {
    const { group_id } = req.query;
    const paginationResult = validatePagination.safeParse(req.query);

    if (!paginationResult.success) {
      return res.status(400).json({ error: paginationResult.error.message });
    }

    if (!group_id) {
      return res.status(400).json({ error: "Group ID is required" });
    }

    // Validate that user has access to the group
    const user = await User.findById(req.user.id);
    const group = await Group.findById(group_id);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    const isUnionAgent = user.role === "union_agent";

    // Union agents can access groups they manage
    // Other users need to be members or managers of the group
    const hasAccess = isUnionAgent
      ? group.managers.includes(req.user.id)
      : user.groups.includes(group_id) || group.managers.includes(req.user.id);

    if (!hasAccess) {
      return res
        .status(403)
        .json({ error: "You don't have access to this group" });
    }

    const { page = 1, limit = 10 } = paginationResult.data;

    // Get root comments (no parent) that are not deleted and belong to the group
    const rootComments = await Comment.find({
      parent_comment_id: null,
      deleted_at: null,
      group: group_id,
    })
      .populate("user")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // For each root comment, get the count of replies
    const commentsWithReplyCount = await Promise.all(
      rootComments.map(async (comment) => {
        const repliesCount = await Comment.countDocuments({
          parent_comment_id: comment._id,
          deleted_at: null,
          group: group_id,
        });

        return {
          ...comment.toObject(),
          replies_count: repliesCount,
        };
      })
    );

    res.json(commentsWithReplyCount);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
};

// Get all groups (paginated) - only managers, no users
export const getAllGroups = async (req, res) => {
  try {
    const paginationResult = validatePagination.safeParse(req.query);

    if (!paginationResult.success) {
      return res.status(400).json({ error: paginationResult.error.message });
    }

    const { page = 1, limit = 10 } = paginationResult.data;

    const groups = await Group.find({ managers: req.user.id })
      .populate("managers", "name  email")
      .populate("building", "building_name")
      .populate("residence", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
};

// Get all members but managers of a group by id (paginated)
export const getGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const paginationResult = validatePagination.safeParse(req.query);

    if (!paginationResult.success) {
      return res.status(400).json({ error: paginationResult.error.message });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user has access to this group
    const user = await User.findById(req.user.id);
    const isUnionAgent = user.role === "union_agent";

    // Union agents can access groups they manage
    // Other users need to be members or managers of the group
    const hasAccess = isUnionAgent
      ? group.managers.includes(req.user.id)
      : user.groups.includes(groupId) || group.managers.includes(req.user.id);

    if (!hasAccess) {
      return res
        .status(403)
        .json({ error: "You don't have access to this group" });
    }

    const { page = 1, limit = 10 } = paginationResult.data;

    // Get all users who are members of this group but exclude managers
    const members = await User.find({
      groups: groupId,
      _id: { $nin: group.managers },
    })
      .select("name  email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json(members);
  } catch (error) {
    console.error("Error fetching group members:", error);
    res.status(500).json({ error: "Failed to fetch group members" });
  }
};

// Update only group details (not members list) - only group managers can update
export const updateGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, description } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is a manager of this group
    if (!group.managers.includes(req.user.id)) {
      return res
        .status(403)
        .json({ error: "Only group managers can update group details" });
    }

    if (name !== undefined) group.name = name;
    if (description !== undefined) group.description = description;

    await group.save();

    res.json(group);
  } catch (error) {
    console.error("Error updating group details:", error);
    res.status(500).json({ error: "Failed to update group details" });
  }
};

// Add or remove a user to/from group by id (supports 1 id only) - only group managers
export const manageGroupUser = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { action } = req.body; // 'add' or 'remove'

    if (!action || !["add", "remove"].includes(action)) {
      return res
        .status(400)
        .json({ error: "Action must be 'add' or 'remove'" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if current user is a manager of this group
    if (!group.managers.includes(req.user.id)) {
      return res
        .status(403)
        .json({ error: "Only group managers can manage group users" });
    }

    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (action === "add") {
      // Check if user is already in the group
      if (targetUser.groups.includes(groupId)) {
        return res
          .status(400)
          .json({ error: "User is already a member of this group" });
      }

      // Add group to user's groups array
      targetUser.groups.push(groupId);
      await targetUser.save();

      res.json({ message: "User added to group successfully" });
    } else if (action === "remove") {
      // Check if user is in the group
      if (!targetUser.groups.includes(groupId)) {
        return res
          .status(400)
          .json({ error: "User is not a member of this group" });
      }

      // Remove group from user's groups array
      targetUser.groups = targetUser.groups.filter(
        (id) => id.toString() !== groupId
      );
      await targetUser.save();

      res.json({ message: "User removed from group successfully" });
    }
  } catch (error) {
    console.error("Error managing group user:", error);
    res.status(500).json({ error: "Failed to manage group user" });
  }
};

// Get specific group details - only group members can view
export const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user has access to this group (is a member)
    const user = await User.findById(req.user.id);
    if (
      !user.groups.includes(groupId) &&
      !group.managers.includes(req.user.id)
    ) {
      return res
        .status(403)
        .json({ error: "You don't have access to this group" });
    }

    // Get member count (total members excluding managers)
    const memberCount = await User.countDocuments({
      groups: groupId,
      _id: { $nin: group.managers },
    });

    const groupDetails = await Group.findById(groupId)
      .populate("managers", "name email")
      .populate("building", "building_name")
      .populate("residence", "name")
      .lean();

    // Add member count to response
    groupDetails.memberCount = memberCount;

    res.json(groupDetails);
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).json({ error: "Failed to fetch group details" });
  }
};
