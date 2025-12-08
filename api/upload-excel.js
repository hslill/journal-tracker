import multer from 'multer';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { promisify } from 'util';

const unlink = promisify(fs.unlink);

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  upload.single('file')(req, {}, async function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const workbook = XLSX.read(req.file.buffer);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      const journals = data
        .filter(row => row.Title && row.ISSN)
        .map(row => ({
          title: row.Title.trim(),
          issn: row.ISSN.replace(/[^0-9Xx]/g, '').toUpperCase()
        }))
        .filter(j => j.issn);

      // Save to alljournals/journals.json
      const journalsPath = path.join(process.cwd(), 'alljournals', 'journals.json');
      fs.writeFileSync(journalsPath, JSON.stringify(journals, null, 2));

      res.status(200).json({ success: true, count: journals.length });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}

