const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const API_KEY = '0a8115ed-3148-4291-8c79-54466fabdc3e';
const LIBRARY_ID = 3820;
const BATCH_SIZE = 5;

// Absolute paths for journals files
const JOURNALS_FILE = path.join(__dirname, 'alljournals', 'journals.json');
const TEMP_FILE = path.join(__dirname, 'alljournals', 'journals.tmp.json');

// -------- Initialize journals.json if missing --------
if (!fs.existsSync(JOURNALS_FILE)) {
  console.log('journals.json not found. Creating initial file with placeholder ISSNs.');
  fs.writeFileSync(JOURNALS_FILE, JSON.stringify([], null, 2));
}

// -------- Endpoint to return all cached journals --------
// Place BEFORE static middleware to avoid conflicts
app.get('/alljournals', (req, res) => {
  try {
    console.log('Reading from:', JOURNALS_FILE);
    const content = fs.readFileSync(JOURNALS_FILE, 'utf8');
    console.log('Raw file content length:', content.length);
    const journals = JSON.parse(content);
    console.log('Number of journals served:', journals.length);
    res.json(journals);
  } catch (err) {
    console.error('Error reading journals.json:', err.message);
    res.status(500).json({ error: 'Unable to read cached journals' });
  }
});

// Serve static files AFTER /alljournals route
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// -------- Helper: fetch ISSNs in batches --------
async function fetchBatchedISSNs(issns) {
  const results = [];
  for (let i = 0; i < issns.length; i += BATCH_SIZE) {
    const batch = issns.slice(i, i + BATCH_SIZE).filter(Boolean).join(',');
    if (!batch) continue;
    const url = `https://public-api.thirdiron.com/public/v1/libraries/${LIBRARY_ID}/search?issns=${batch}&access_token=${API_KEY}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Batch [${batch}] returned ${response.status}, skipping`);
        continue;
      }
      const json = await response.json();
      if (!Array.isArray(json.data)) {
        console.error(`Batch [${batch}] returned unexpected structure, skipping`);
        continue;
      }
      results.push(...json.data);
    } catch (err) {
      console.error(`Error fetching batch [${batch}]:`, err.message);
    }
  }
  return results;
}

// -------- Fetch all journals and cache locally safely --------
async function fetchAllJournals() {
  try {
    const masterList = JSON.parse(fs.readFileSync(JOURNALS_FILE, 'utf8'));
    const allIssns = masterList.map(j => j.issn).filter(Boolean);

    if (!allIssns.length) {
      console.log('No valid ISSNs in journals.json. Please add ISSNs first.');
      return masterList;
    }

    const fetchedData = await fetchBatchedISSNs(allIssns);
    if (!fetchedData.length) {
      console.log('No journals fetched — keeping existing journals.json');
      return masterList;
    }

    // Merge oldTitle if exists
    const merged = fetchedData.map(j => {
      const oldEntry = masterList.find(m => m.issn === j.issn);
      return { ...j, oldTitle: oldEntry?.oldTitle || j.title };
    });

    fs.writeFileSync(TEMP_FILE, JSON.stringify(merged, null, 2));
    fs.renameSync(TEMP_FILE, JOURNALS_FILE);

    console.log(`Fetched and cached ${merged.length} journals via /search endpoint.`);
    return merged;

  } catch (err) {
    console.error('Error fetching all journals:', err.message);
    return [];
  }
}

// -------- Endpoint to fetch journals by ISSN (batched) --------
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

// -------- Check title changes locally --------
async function checkTitleChanges() {
  try {
    const cachedJournals = JSON.parse(fs.readFileSync(JOURNALS_FILE, 'utf8'));
    const changes = [];

    for (const j of cachedJournals) {
      if (j.title && j.title !== j.oldTitle) {
        changes.push({
          issn: j.issn,
          oldTitle: j.oldTitle,
          newTitle: j.title,
          dateChecked: new Date().toISOString()
        });
        j.oldTitle = j.title;
      }
    }

    fs.writeFileSync(path.join(__dirname, 'changes.json'), JSON.stringify(changes, null, 2));
    fs.writeFileSync(JOURNALS_FILE, JSON.stringify(cachedJournals, null, 2));
    console.log(`Checked ${cachedJournals.length} journals. ${changes.length} changes logged.`);

  } catch (err) {
    console.error('Error checking title changes:', err.message);
  }
}

// -------- Start server --------
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await fetchAllJournals();

  // Schedule daily updates
  setInterval(fetchAllJournals, 24 * 60 * 60 * 1000);
});

// Keep Node process alive
setInterval(() => {}, 1000);
