import "dotenv/config";

import app from "./app.js";
import connectDatabase from "./config/db.js";
import "./config/cloudinary.js";

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  await connectDatabase();

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
