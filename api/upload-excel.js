// upload-excel.js
import { Octokit } from "@octokit/rest";
import multer from "multer";
import XLSX from "xlsx";
import nextConnect from "next-connect";
import fs from "fs";
import path from "path";

// ===============================
// Multer in-memory storage
// ===============================
const upload = multer({ storage: multer.memoryStorage() });

// ===============================
// Next.js API handler
// ===============================
const apiRoute = nextConnect({
  onError(error, req, res) {
    console.error("API error:", error);
    res.status(500).json({ error: error.message });
  },
  onNoMatch(req, res) {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  },
});

apiRoute.use(upload.single("file"));

// ===============================
// Helper: normalize ISSN
// ===============================
function normalizeISSN(issn) {
  if (!issn) return null;
  return issn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

// ===============================
// Detect environment
// ===============================
const isServerless = !!process.env.GITHUB_TOKEN;
const LOCAL_FILE = path.join(process.cwd(), "alljournals", "journals.json");

// ===============================
// Optional: BrowZine API keys (from alljournals.js)
// ===============================
const LIBRARY_ID = process.env.BROWZINE_LIBRARY_ID || 3820;
const API_KEY = process.env.BROWZINE_API_KEY;

// ===============================
// POST handler: upload Excel
// ===============================
apiRoute.post(async (req, res) => {
  try {
    const file = req.file;
    if (!file) throw new Error("No file uploaded");

    // Parse Excel
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Normalize journals
    const journals = data
      .filter((row) => row.Title && row.ISSN)
      .map((row) => ({
        title: row.Title.trim(),
        issn: normalizeISSN(row.ISSN),
      }))
      .filter((j) => j.issn);

    if (!journals.length) {
      return res.status(400).json({ error: "No valid journals found in Excel file." });
    }

    if (isServerless) {
      // ===============================
      // Serverless: push to GitHub
      // ===============================
      try {
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const owner = "hslill";
        const repo = "journal-tracker";
        const pathInRepo = "alljournals/journals.json";

        // Get the current file SHA
        let sha = null;
        try {
          const { data: currentFile } = await octokit.repos.getContent({
            owner,
            repo,
            path: pathInRepo,
          });
          sha = currentFile.sha;
        } catch (err) {
          console.warn("GitHub file does not exist, creating new file.");
        }

        const base64Content = Buffer.from(JSON.stringify(journals, null, 2)).toString("base64");

        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: pathInRepo,
          message: `Update journals.json via web upload (${new Date().toISOString()})`,
          content: base64Content,
          sha,
        });

        return res.status(200).json({ success: true, count: journals.length, source: "GitHub" });
      } catch (err) {
        console.error("GitHub push failed:", err);
        return res.status(500).json({ error: "GitHub push failed: " + err.message });
      }
    } else {
      // ===============================
      // Local Node.js: write to journals.json
      // ===============================
      let existing = [];
      try {
        existing = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
      } catch (e) {
        console.warn("No existing journals.json, starting fresh.");
      }

      // Merge by ISSN
      const mergedMap = {};
      existing.forEach((j) => { if (j.issn) mergedMap[j.issn] = j; });
      journals.forEach((j) => { mergedMap[j.issn] = { ...mergedMap[j.issn], ...j }; });

      const merged = Object.values(mergedMap);
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(merged, null, 2));

      return res.status(200).json({ success: true, count: journals.length, mergedCount: merged.length, source: "local" });
    }
  } catch (err) {
    console.error("Excel upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default apiRoute;
export const config = { api: { bodyParser: false } };
