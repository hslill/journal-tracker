// server.js
import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config(); // Load .env in local dev

const app = express();
const PORT = process.env.PORT || 3001;

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ===============================
// Constants from .env
// ===============================
const API_KEY = process.env.THIRDIOR_PUBLIC_API_KEY; // now loaded from env
const LIBRARY_ID = parseInt(process.env.LIBRARY_ID || "3820", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5", 10);

const JOURNALS_FILE = path.join(process.cwd(), "alljournals", "journals.json");
const TEMP_FILE = path.join(process.cwd(), "alljournals", "journals.tmp.json");

// Ensure journals.json exists
if (!fs.existsSync(JOURNALS_FILE)) {
  console.log("journals.json missing, creating empty list.");
  fs.writeFileSync(JOURNALS_FILE, JSON.stringify([], null, 2));
}

// ===============================
// Helper: normalize ISSN
// ===============================
function normalizeISSN(issn) {
  if (!issn) return null;
  return issn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

// ===============================
// Upload Excel + merge journals.json
// ===============================
app.post("/api/upload-excel", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const excelJournals = data
      .filter((row) => row.Title && row.ISSN)
      .map((row) => ({ title: row.Title.trim(), issn: normalizeISSN(row.ISSN) }))
      .filter((j) => j.issn);

    if (!excelJournals.length) {
      return res.status(400).json({ error: "No valid journals found in Excel." });
    }

    // Merge with existing journals
    let existingJournals = [];
    try {
      existingJournals = JSON.parse(fs.readFileSync(JOURNALS_FILE, "utf8"));
    } catch (err) {
      console.warn("Could not read existing journals.json, starting fresh.");
    }

    const mergedMap = {};
    existingJournals.forEach((j) => { if (j.issn) mergedMap[j.issn] = j; });
    excelJournals.forEach((j) => { mergedMap[j.issn] = { ...mergedMap[j.issn], ...j }; });

    const mergedJournals = Object.values(mergedMap);
    fs.writeFileSync(JOURNALS_FILE, JSON.stringify(mergedJournals, null, 2));

    res.json({ success: true, count: excelJournals.length, mergedCount: mergedJournals.length });
  } catch (err) {
    console.error("Excel upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Return cached journals
// ===============================
app.get("/alljournals", (req, res) => {
  try {
    const content = fs.readFileSync(JOURNALS_FILE, "utf8");
    const journals = JSON.parse(content);
    res.json(journals);
  } catch (err) {
    console.error("Error reading journals.json:", err);
    res.status(500).json({ error: "Unable to read cached journals" });
  }
});

// ===============================
// Fetch ISSNs in batches
// ===============================
async function fetchBatchedISSNs(issns) {
  const results = [];
  for (let i = 0; i < issns.length; i += BATCH_SIZE) {
    const batch = issns.slice(i, i + BATCH_SIZE).filter(Boolean).join(",");
    if (!batch) continue;

    const url = `https://public-api.thirdiron.com/public/v1/libraries/${LIBRARY_ID}/search?issns=${batch}&access_token=${API_KEY}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Batch [${batch}] returned ${response.status}`);
        continue;
      }
      const json = await response.json();
      if (Array.isArray(json.data)) results.push(...json.data);
    } catch (err) {
      console.error(`Batch fetch error [${batch}]:`, err.message);
    }
  }
  return results;
}

// ===============================
// Fetch all journals and update cache
// ===============================
async function fetchAllJournals() {
  try {
    const masterList = JSON.parse(fs.readFileSync(JOURNALS_FILE, "utf8"));
    const issns = masterList.map((j) => j.issn).filter(Boolean);
    if (!issns.length) return masterList;

    const fetched = await fetchBatchedISSNs(issns);
    if (!fetched.length) return masterList;

    const merged = fetched.map((j) => {
      const old = masterList.find((m) => m.issn === j.issn);
      return { ...j, oldTitle: old?.oldTitle || j.title };
    });

    fs.writeFileSync(TEMP_FILE, JSON.stringify(merged, null, 2));
    fs.renameSync(TEMP_FILE, JOURNALS_FILE);
    return merged;
  } catch (err) {
    console.error("fetchAllJournals error:", err);
    return [];
  }
}

// ===============================
// Single ISSN batch endpoint
// ===============================
app.get("/bz", async (req, res) => {
  const issnsParam = req.query.issns;
  if (!issnsParam) return res.status(400).json({ error: "Missing issns parameter" });

  const issns = issnsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (!issns.length) return res.status(400).json({ error: "No valid ISSNs provided" });

  try {
    const results = await fetchBatchedISSNs(issns);
    res.json(results);
  } catch (err) {
    console.error("Error in /bz:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Serve static files + root
// ===============================
app.use(express.static(process.cwd()));
app.get("/", (req, res) => res.sendFile(path.join(process.cwd(), "index.html")));

// ===============================
// Start server
// ===============================
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await fetchAllJournals();
  setInterval(fetchAllJournals, 24 * 60 * 60 * 1000);
});

// Keep alive
setInterval(() => {}, 1000);
