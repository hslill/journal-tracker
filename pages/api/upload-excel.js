// pages/api/upload-excel.js
import nextConnect from "next-connect";
import multer from "multer";
import { db } from "../../lib/firebaseAdmin";
import xlsx from "xlsx";

// Use memory storage for multer
const upload = multer({ storage: multer.memoryStorage() });

const apiRoute = nextConnect({
  onError(error, req, res) {
    res.status(500).json({ error: `Something went wrong: ${error.message}` });
  },
  onNoMatch(req, res) {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  },
});

apiRoute.use(upload.single("file"));

apiRoute.post(async (req, res) => {
  try {
    if (!req.file) throw new Error("No file uploaded");

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let updatedCount = 0;

    for (const row of rows) {
      if (!row.ISSN || !row.Title) continue;

      const docRef = db.collection("journals").doc(row.ISSN.toString());
      const doc = await docRef.get();

      if (doc.exists) {
        const oldData = doc.data();
        if (oldData.title !== row.Title) {
          await docRef.update({ title: row.Title, oldTitle: oldData.title });
          updatedCount++;
        }
      } else {
        await docRef.set({ issn: row.ISSN, title: row.Title });
        updatedCount++;
      }
    }

    res.status(200).json({ count: updatedCount });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export default apiRoute;
