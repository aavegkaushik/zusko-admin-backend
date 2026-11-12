import multer from "multer";
import path from "path";
import fs from "fs";

const getUploadDir = () => {
  const dir = path.resolve(process.cwd(), "uploads", "avatars");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dir = getUploadDir();
      cb(null, dir);
    } catch (err) {
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `vendor-${req.user?.id || Date.now()}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    cb(new Error("Only image files allowed"), false);
  }
  cb(null, true);
};

export const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const partnerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dir = getUploadDir();
      cb(null, dir);
    } catch (err) {
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `partner-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`);
  },
});

export const uploadPartnerAvatar = multer({
  storage: partnerStorage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});
