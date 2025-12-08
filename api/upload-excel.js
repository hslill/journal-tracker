import formidable from 'formidable';
import XLSX from 'xlsx';
import fetch from 'node-fetch';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'Error parsing form' });

    const file = files.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      // Convert Excel to JSON
      const workbook = XLSX.readFile(file.filepath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      const normalizeISSN = (issn) => issn ? issn.replace(/[^0-9Xx]/g, '').toUpperCase() : null;

      const journals = data
        .filter(r => r.Title && r.ISSN)
        .map(r => ({ title: r.Title.trim(), issn: normalizeISSN(r.ISSN) }))
        .filter(j => j.issn);

      // Commit to GitHub
      const token = process.env.GITHUB_PAT;
      const repo = process.env.GITHUB_REPO;
      const branch = process.env.GITHUB_BRANCH || 'main';
      const pathInRepo = 'alljournals/journals.json';

      // First, get the SHA of existing file (required for update)
      const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${pathInRepo}?ref=${branch}`, {
        headers: { Authorization: `token ${token}` }
      });
      const getData = await getRes.json();
      const sha = getData.sha; // if file exists, required for updating

      // Commit updated journals.json
      const commitRes = await fetch(`https://api.github.com/repos/${repo}/contents/${pathInRepo}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update journals.json via Excel upload`,
          content: Buffer.from(JSON.stringify(journals, null, 2)).toString('base64'),
          branch,
          sha: sha || undefined
        })
      });

      const commitData = await commitRes.json();

      res.status(200).json({ success: true, count: journals.length, commit: commitData.html_url });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}
