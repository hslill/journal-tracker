// upload-excel.js
import { Octokit } from "@octokit/rest";
import multer from "multer";
import nextConnect from "next-connect";
import XLSX from "xlsx";
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
    res.status(500).json({ error: error.message || "Server error" });
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
  return issn.toString().trim().replace(/[^0-9Xx]/g, "").toUpperCase();
}

// ===============================
// Paths & environment
// ===============================
const LOCAL_FILE = path.join(process.cwd(), "alljournals", "journals.json");
const isServerless = !!process.env.GITHUB_TOKEN;

// ===============================
// POST handler: upload Excel
// ===============================
apiRoute.post(async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    // Parse Excel
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Normalize journals
    const journals = data
      .filter(r => r.Title && r.ISSN)
      .map(r => ({ title: r.Title.toString().trim(), issn: normalizeISSN(r.ISSN) }))
      .filter(j => j.issn);

    if (!journals.length) return res.status(400).json({ error: "No valid journals found." });

    if (isServerless) {
      // ===============================
      // Serverless: push to GitHub
      // ===============================
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const owner = "hslill";
      const repo = "journal-tracker";
      const pathInRepo = "alljournals/journals.json";

      try {
        const { data: currentFile } = await octokit.repos.getContent({ owner, repo, path: pathInRepo });
        const base64Content = Buffer.from(JSON.stringify(journals, null, 2)).toString("base64");

        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: pathInRepo,
          message: `Update journals.json via web upload (${new Date().toISOString()})`,
          content: base64Content,
          sha: currentFile.sha,
        });

        return res.status(200).json({ success: true, count: journals.length, source: "GitHub" });
      } catch (err) {
        console.error("GitHub upload error:", err);
        return res.status(500).json({ error: "Failed to update journals.json on GitHub: " + err.message });
      }
    } else {
      // ===============================
      // Local Node.js: overwrite journals.json
      // ===============================
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(journals, null, 2));
      return res.status(200).json({ success: true, count: journals.length, source: "local" });
    }
  } catch (err) {
    console.error("Excel upload error:", err);
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
});

export default apiRoute;
export const config = { api: { bodyParser: false } };
