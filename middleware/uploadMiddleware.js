import multer from "multer";

import { ApiError } from "./errorMiddleware.js";

const storage = multer.memoryStorage();

const fileFilter = (_req, file, callback) => {
  if (file.mimetype.startsWith("image/")) {
    callback(null, true);
    return;
  }

  callback(new ApiError("Only image uploads are allowed.", 400));
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

export default upload;
