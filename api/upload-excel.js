// upload-excel.js
import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/rest";

// ===============================
// Setup Express router
// ===============================
const router = express.Router();

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

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
// POST handler: upload Excel
// ===============================
router.post("/upload-excel", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    // Parse Excel
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
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
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const owner = "hslill";
      const repo = "journal-tracker";
      const pathInRepo = "alljournals/journals.json";

      const { data: currentFile } = await octokit.repos.getContent({
        owner,
        repo,
        path: pathInRepo,
      });

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

export default router;
