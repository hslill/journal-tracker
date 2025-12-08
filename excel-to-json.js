const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Path to your Excel file
const filePath = path.join('C:', 'journal-title-changes', 'results.xlsx');

// Read workbook
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convert sheet to JSON array
const data = XLSX.utils.sheet_to_json(sheet);

// Normalize ISSN: remove dashes, uppercase letters
function normalizeISSN(issn) {
if (!issn) return null;
return issn.replace(/[^0-9Xx]/g, '').toUpperCase();
}

// Map only the fields you care about: Title and ISSN
const journals = data
.filter(row => row.Title && row.ISSN) // skip rows without ISSN or Title
.map(row => ({
title: row.Title.trim(),
issn: normalizeISSN(row.ISSN)
}))
.filter(j => j.issn); // remove any null ISSNs

// Save to journals.json
fs.writeFileSync('journals.json', JSON.stringify(journals, null, 2));

console.log(`Converted ${journals.length} journals to journals.json (ISSNs normalized for BrowZine).`);