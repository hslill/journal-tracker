import multer from "multer";
import nextConnect from "next-connect";
import XLSX from "xlsx";
import { db } from "../../lib/firebaseAdmin";

const upload = multer({ storage: multer.memoryStorage() });

const apiRoute = nextConnect({
  onError(err, req, res) {
    console.error(err);
    res.status(500).json({ error: err.message });
  },
  onNoMatch(req, res) {
    res.status(405).json({ error: "Method not allowed" });
  }
});

const BATCH_SIZE = 500;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batchRows = rows.slice(i, i + BATCH_SIZE);
  const batch = db.batch();
  // add batchRows to batch
  await batch.commit();
}

apiRoute.use(upload.single("file"));

function normalizeISSN(issn) {
  if (!issn) return null;
  return issn.toString().trim().replace(/[^0-9Xx]/g, "").toUpperCase();
}

apiRoute.post(async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    // Process each row and push to Firestore
    const batch = db.batch();
    const collectionRef = db.collection("journals");

    rows.forEach((row) => {
      if (!row.ISSN || !row.Title) return;
      const docRef = collectionRef.doc(normalizeISSN(row.ISSN));
      batch.set(docRef, {
        title: row.Title.trim(),
        issn: normalizeISSN(row.ISSN),
        id: row.id || null,
        type: row.type || "journals",
        sjrValue: row.sjrValue || 0,
        coverImageUrl: row.coverImageUrl || "",
        browzineEnabled: row.browzineEnabled || false,
        browzineWebLink: row.browzineWebLink || "",
        relationships: row.relationships || {}
      });
    });

    await batch.commit();

    res.status(200).json({ success: true, count: rows.length, source: "Firestore" });
  } catch (err) {
    console.error("Firestore upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default apiRoute;
export const config = { api: { bodyParser: false } };
