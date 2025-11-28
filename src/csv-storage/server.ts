import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 10001;
const CSV_PATH = path.resolve(process.env.CSV_STORAGE_PATH || 'data/loans.csv');
const UPLOAD_PASSWORD = process.env.CSV_UPLOAD_PASSWORD || 'change-me-in-production';

// Middleware
app.use(express.json());
app.use(express.text({ type: 'text/csv' }));

// Ensure CSV file exists on startup
async function ensureCsvExists() {
  try {
    await fs.access(CSV_PATH);
    console.log(`✅ CSV file exists: ${CSV_PATH}`);
  } catch {
    // Create default CSV if it doesn't exist
    const defaultCsv = `Financing Institution,Entity,Credit Line Amount,Available Credit,Interest Rate
Andbank,Aribau Ventures SL,1200000,800000,2.5
Andbank,Oikos Builders SL,850000,600000,3.2
Andbank,Esteban Almirall,500000,350000,3.0
Andbank,,650000,450000,2.8`;
    await fs.mkdir(path.dirname(CSV_PATH), { recursive: true });
    await fs.writeFile(CSV_PATH, defaultCsv, 'utf-8');
    console.log(`📝 Created default CSV at: ${CSV_PATH}`);
  }
}

// GET /loans.csv - Serve the CSV file
app.get('/loans.csv', async (req, res) => {
  try {
    const csv = await fs.readFile(CSV_PATH, 'utf-8');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="loans.csv"');
    res.send(csv);
  } catch (error: any) {
    console.error('Error reading CSV:', error);
    res.status(500).json({ error: 'Failed to read CSV file' });
  }
});

// GET / - Health check and info
app.get('/', (req, res) => {
  res.json({
    service: 'CSV Storage Service',
    endpoints: {
      'GET /loans.csv': 'Download the current CSV file',
      'POST /upload': 'Upload a new CSV file (requires password)',
      'GET /': 'This info page'
    }
  });
});

// POST /upload - Upload new CSV (password protected)
app.post('/upload', async (req, res) => {
  const authHeader = req.headers.authorization;
  const password = authHeader?.replace('Bearer ', '') || req.body?.password || req.query?.password;

  if (password !== UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized. Provide password via Authorization: Bearer <password> or ?password=<password>' });
  }

  let csvContent: string;

  // Handle multipart/form-data (file upload)
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    const upload = multer({ storage: multer.memoryStorage() }).single('file');
    upload(req as any, res as any, async (err: any) => {
      if (err) {
        return res.status(400).json({ error: 'File upload error', details: err.message });
      }
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided. Send file as multipart/form-data with field name "file"' });
      }
      csvContent = file.buffer.toString('utf-8');
      await saveCsv(csvContent, res);
    });
    return;
  }

  // Handle text/csv or plain text
  if (typeof req.body === 'string') {
    csvContent = req.body;
  } else if (req.body?.csv) {
    csvContent = req.body.csv;
  } else {
    return res.status(400).json({ error: 'No CSV content provided. Send CSV as text/csv or JSON with "csv" field' });
  }

  await saveCsv(csvContent, res);
});

async function saveCsv(csvContent: string, res: express.Response) {
  try {
    // Validate it looks like CSV
    if (!csvContent.includes(',') || !csvContent.includes('\n')) {
      return res.status(400).json({ error: 'Invalid CSV format' });
    }

    await fs.writeFile(CSV_PATH, csvContent, 'utf-8');
    const lines = csvContent.split('\n').filter(l => l.trim()).length;
    console.log(`✅ CSV updated: ${lines} lines written to ${CSV_PATH}`);
    
    res.json({
      success: true,
      message: `CSV updated successfully (${lines} lines)`,
      path: CSV_PATH
    });
  } catch (error: any) {
    console.error('Error saving CSV:', error);
    res.status(500).json({ error: 'Failed to save CSV file', details: error.message });
  }
}

// Start server
async function start() {
  await ensureCsvExists();
  
  app.listen(PORT, () => {
    console.log('===========================================');
    console.log('📦 CSV Storage Service');
    console.log(`🌐 Listening on port ${PORT}`);
    console.log(`📂 CSV path: ${CSV_PATH}`);
    console.log(`🔐 Upload password: ${UPLOAD_PASSWORD.substring(0, 4)}...`);
    console.log('===========================================');
    console.log('Endpoints:');
    console.log(`  GET  http://localhost:${PORT}/loans.csv - Download CSV`);
    console.log(`  POST http://localhost:${PORT}/upload - Upload CSV (with password)`);
  });
}

start().catch(console.error);

