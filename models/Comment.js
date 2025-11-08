import mongoose from "mongoose";

const CommentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    comment: { type: String, required: true },
    love_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // list of user ids who agreed/liked
    parent_comment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    }, // null if root level
    deleted_at: { type: Date, default: null }, // for soft delete
  },
  { timestamps: true }
);

export default mongoose.model("Comment", CommentSchema);
