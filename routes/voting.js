import express from 'express';
import { 
  getMeetingResults, submitVote, getMeetings, createMeeting, 
  updateMeeting, deleteMeeting, getEligibleVoters 
} from '../controllers/votingController.js';
import { auth, requireRole } from '../middleware/auth.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import path from 'path';
import crypto from 'crypto';
import Meeting from '../models/Meeting.js';

const router = express.Router();

// Configure Cloudinary
const cloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    }
    cb(new Error("Invalid file type."));
  },
});

router.post('/upload-agenda', auth, requireRole('union_agent'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!cloudinaryConfigured) return res.status(503).json({ error: "Cloudinary not configured" });

    const uploadResult = await new Promise((resolve, reject) => {
      const fileExt = path.extname(req.file.originalname);
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw", // Forced to raw to prevent double extensions and image processing errors
          folder: "agendas",
          public_id: `agenda_${Date.now()}_${Math.round(Math.random() * 1e9)}${fileExt}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    res.status(200).json({
      url: uploadResult.secure_url,
      name: req.file.originalname
    });
  } catch (error) {
    console.error("Agenda upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:meetingId/agenda-url', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.meetingId);
    if (!meeting || !meeting.agenda_file_url) return res.status(404).json({ error: "Agenda not found" });
    if (!cloudinaryConfigured) return res.status(503).json({ error: "Cloudinary not configured" });

    const urlParts = meeting.agenda_file_url.split('/upload/');
    if (urlParts.length < 2) return res.status(400).json({ error: "Invalid agenda URL format" });

    const pathAfterUpload = urlParts[1];
    const publicId = decodeURIComponent(pathAfterUpload.replace(/^v\d+\//, ''));
    const resourceType = meeting.agenda_file_url.includes('/raw/upload/') ? 'raw' : 'image';

    const timestamp = Math.round(Date.now() / 1000);
    const params = {
      public_id: publicId,
      timestamp: timestamp.toString(),
      type: "upload",
    };

    const sortedParams = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
    const stringToSign = sortedParams + process.env.CLOUDINARY_API_SECRET;
    const signature = crypto.createHash("sha256").update(stringToSign).digest("hex");

    const viewUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/download?api_key=${process.env.CLOUDINARY_API_KEY}&public_id=${encodeURIComponent(publicId)}&signature=${signature}&timestamp=${timestamp}&type=upload`;

    res.json({ url: viewUrl });
  } catch (err) {
    console.error("Generate agenda URL error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, getMeetings);
router.post('/create', auth, requireRole('union_agent'), createMeeting);
router.put('/:meetingId', auth, requireRole('union_agent'), updateMeeting);
router.delete('/:meetingId', auth, requireRole('union_agent'), deleteMeeting);
router.get('/:meetingId/voters', auth, requireRole('union_agent'), getEligibleVoters);
router.get('/:meetingId/results', auth, getMeetingResults);
router.post('/:meetingId/vote', auth, submitVote);

export default router;
