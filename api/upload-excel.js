import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

export const config = {
  api: {
    bodyParser: false, // allow file uploads
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error parsing form' });
    }

    const file = files.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      // Read workbook
      const workbook = XLSX.readFile(file.filepath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      // Normalize ISSN
      const normalizeISSN = (issn) => issn ? issn.replace(/[^0-9Xx]/g, '').toUpperCase() : null;

      const journals = data
        .filter(row => row.Title && row.ISSN)
        .map(row => ({ title: row.Title.trim(), issn: normalizeISSN(row.ISSN) }))
        .filter(j => j.issn);

      // Save to "alljournals/journals.json" (inside Vercel serverless, you may write to /tmp)
      const jsonPath = path.join('/tmp', 'journals.json');
      fs.writeFileSync(jsonPath, JSON.stringify(journals, null, 2));

      console.log(`Updated journals.json with ${journals.length} records`);

      res.status(200).json({ success: true, count: journals.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to process Excel' });
    }
  });
}
