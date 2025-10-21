import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  created_at: { type: Date, default: Date.now }
});

const PostSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: String,
  created_at: { type: Date, default: Date.now },
  comments: [CommentSchema]
});

export default mongoose.model('Post', PostSchema);
