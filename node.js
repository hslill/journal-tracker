// ===============================
//  IMPORTS
// ===============================
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const isServerless = !!process.env.VERCEL || !!process.env.NOW_REGION;
const app = express();
const PORT = process.env.PORT || 3001;

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ===============================
//  CONSTANTS
// ===============================
const API_KEY = '0a8115ed-3148-4291-8c79-54466fabdc3e';
const LIBRARY_ID = 3820;
const BATCH_SIZE = 5;

// Journals file locations
const JOURNALS_FILE = path.join(__dirname, 'alljournals', 'journals.json');
const TEMP_FILE = path.join(__dirname, 'alljournals', 'journals.tmp.json');

// ===============================
//  INITIALIZE journals.json
// ===============================
if (!fs.existsSync(JOURNALS_FILE)) {
  console.log('journals.json missing, creating empty list.');
  fs.writeFileSync(JOURNALS_FILE, JSON.stringify([], null, 2));
}

// ===============================
//  HELPER: Normalize ISSN
// ===============================
function normalizeISSN(issn) {
  if (!issn) return null;
  return issn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

// ===============================
//  API: Upload Excel + Rewrite journals.json
// ===============================
app.post("/api/upload-excel", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    console.log("Excel upload started. File size:", req.file.size);

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    console.log("Parsed rows from Excel:", data.length);

    // Extract journals from Excel
    const excelJournals = data
      .filter(row => row.Title && row.ISSN)
      .map(row => ({
        title: row.Title.trim(),
        issn: normalizeISSN(row.ISSN)
      }))
      .filter(j => j.issn);
    console.log("Filtered journals from Excel:", excelJournals.length);

    // Read existing journals.json safely
    let existingJournals = [];
    try {
      existingJournals = JSON.parse(fs.readFileSync(JOURNALS_FILE, "utf8"));
      console.log("Existing journals loaded:", existingJournals.length);
    } catch (e) {
      console.warn("Could not read existing journals.json, starting fresh.");
    }

    // Merge Excel journals with existing ones (by ISSN)
    const mergedJournalsMap = {};
    existingJournals.forEach(j => { if (j.issn) mergedJournalsMap[j.issn] = j; });
    excelJournals.forEach(j => { mergedJournalsMap[j.issn] = { ...mergedJournalsMap[j.issn], ...j }; });

    const mergedJournals = Object.values(mergedJournalsMap);
    console.log("Merged journals count:", mergedJournals.length);

    // Write merged journals.json
    fs.writeFileSync(JOURNALS_FILE, JSON.stringify(mergedJournals, null, 2));

    return res.json({
      success: true,
      count: excelJournals.length,
      mergedCount: mergedJournals.length,
      message: "Excel processed and journals.json merged successfully."
    });

  } catch (err) {
    console.error("Excel upload error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===============================
//  API: Return cached journals
// ===============================
app.get('/alljournals', (req, res) => {
  try {
    const content = fs.readFileSync(JOURNALS_FILE, 'utf8');
    const journals = JSON.parse(content);
    console.log('Serving', journals.length, 'journals');
    res.json(journals);
  } catch (err) {
    console.error('Error reading journals.json:', err);
    res.status(500).json({ error: 'Unable to read cached journals' });
  }
});

// ===============================
//  STATIC FILES + ROOT
// ===============================
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ===============================
//  Fetch ISSNs in batches
// ===============================
async function fetchBatchedISSNs(issns) {
  const results = [];
  for (let i = 0; i < issns.length; i += BATCH_SIZE) {
    const batch = issns.slice(i, i + BATCH_SIZE).filter(Boolean).join(',');
    if (!batch) continue;

    const url = `https://public-api.thirdiron.com/public/v1/libraries/${LIBRARY_ID}/search?issns=${batch}&access_token=${API_KEY}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Batch [${batch}] returned ${response.status}`);
        continue;
      }
      const json = await response.json();
      if (!Array.isArray(json.data)) continue;
      results.push(...json.data);

    } catch (err) {
      console.error(`Batch fetch error [${batch}]:`, err.message);
    }
  }
  return results;
}

// ===============================
//  Fetch and Cache All Journals
// ===============================
async function fetchAllJournals() {
  try {
    const masterList = JSON.parse(fs.readFileSync(JOURNALS_FILE, 'utf8'));
    const issns = masterList.map(j => j.issn).filter(Boolean);

    if (!issns.length) {
      console.log('No ISSNs found in journals.json.');
      return masterList;
    }

    const fetched = await fetchBatchedISSNs(issns);
    if (!fetched.length) return masterList;

    const merged = fetched.map(j => {
      const old = masterList.find(m => m.issn === j.issn);
      return { ...j, oldTitle: old?.oldTitle || j.title };
    });

    fs.writeFileSync(TEMP_FILE, JSON.stringify(merged, null, 2));
    fs.renameSync(TEMP_FILE, JOURNALS_FILE);

    console.log(`Successfully fetched ${merged.length} journals.`);
    return merged;

  } catch (err) {
    console.error('fetchAllJournals error:', err);
    return [];
  }
}

// ===============================
//  Single ISSN batch endpoint
// ===============================
app.get('/bz', async (req, res) => {
  const issnsParam = req.query.issns;
  if (!issnsParam) return res.status(400).json({ error: 'Missing issns parameter' });

  const issns = issnsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (!issns.length) return res.status(400).json({ error: 'No valid ISSNs provided' });

  try {
    const results = await fetchBatchedISSNs(issns);
    res.json(results);
  } catch (err) {
    console.error('Error in /bz:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
//  Start server
// ===============================
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await fetchAllJournals();
  setInterval(fetchAllJournals, 24 * 60 * 60 * 1000);
});

// Keep alive
setInterval(() => {}, 1000);
