require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');
const { Document } = require('docx');
const mammoth = require('mammoth'); // Added mammoth

// Import libSQL client
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

// Turso Database Configuration
const TURSO_DB_URL = process.env.TURSO_DB_URL;
const TURSO_DB_AUTH_TOKEN = process.env.TURSO_DB_AUTH_TOKEN;

// Log for debugging (remove in production)
console.log('TURSO_DB_URL:', TURSO_DB_URL ? 'set' : 'NOT SET');
console.log('TURSO_DB_AUTH_TOKEN:', TURSO_DB_AUTH_TOKEN ? 'set' : 'NOT SET');

// Create libSQL client - only if credentials are available
let client = null;
if (TURSO_DB_URL && TURSO_DB_AUTH_TOKEN) {
    client = createClient({
        url: TURSO_DB_URL,
        authToken: TURSO_DB_AUTH_TOKEN
    });
}

// Admin Authentication Setup (Stateless for Serverless)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; //admin password

// Generate a static signature based on the password and a secret string
function getAdminToken() {
    if (!ADMIN_PASSWORD) return null;
    return crypto.createHmac('sha256', ADMIN_PASSWORD).update('admin-session-v1').digest('hex');
}

const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Admin access required.' });
    }

    const token = authHeader.split(' ')[1];
    const expectedToken = getAdminToken();

    if (!expectedToken || token !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
    }
    next();
};

// Multer Configuration for File Uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and DOCX files are allowed'));
        }
    }
});

// PDF to Text Parser
async function extractPdfText(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text;
    } catch (err) {
        throw new Error('Failed to parse PDF: ' + err.message);
    }
}

// DOCX to HTML Parser (Better formatting preservation)
async function extractDocxText(buffer) {
    try {
        const result = await mammoth.convertToHtml({ buffer: buffer });
        return result.value || '<p>Empty document</p>';
    } catch (error) {
        console.error('Error extracting DOCX HTML:', error);
        return '<p>Error converting document.</p>';
    }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Note: Do not create directories here — Vercel filesystem is read-only at runtime

// Initialize Database Tables
async function initDatabase() {
    if (!client) {
        console.error("Database client not initialized. Please check environment variables.");
        return;
    }

    try {
        // Create Projects Table
        await client.execute(`
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            )
        `);

        // Create Files Table
        await client.execute(`
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                filename TEXT NOT NULL,
                content TEXT,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        `);

        // Migration: Add passcode column if it doesn't exist
        try {
            await client.execute("ALTER TABLE projects ADD COLUMN passcode TEXT");
            console.log("Added passcode column to projects table.");
        } catch (e) {
            // Column likely already exists
        }

        // Create Folders Table for empty folders
        await client.execute(`
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                path TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                UNIQUE(project_id, path)
            )
        `);

        // Create Highlights Table
        await client.execute(`
            CREATE TABLE IF NOT EXISTS highlights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER,
                start_pos INTEGER,
                end_pos INTEGER,
                highlighted_text TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
            )
        `);

        // Migration: Add file_type column if it doesn't exist
        try {
            await client.execute("ALTER TABLE files ADD COLUMN file_type TEXT DEFAULT 'code'");
            console.log("Added file_type column to files table.");
        } catch (e) {
            // Column likely already exists
        }

        // Migration: Add original_filename column if it doesn't exist
        try {
            await client.execute("ALTER TABLE files ADD COLUMN original_filename TEXT");
            console.log("Added original_filename column to files table.");
        } catch (e) {
            // Column likely already exists
        }

        console.log("Connected to the Turso SQLite database.");
    } catch (err) {
        console.error("Error initializing database: " + err.message);
    }
}

initDatabase();

// --- API ROUTES ---

// Admin Login
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (!ADMIN_PASSWORD) {
        return res.status(500).json({ error: 'ADMIN_PASSWORD is not set on the server' });
    }

    if (password === ADMIN_PASSWORD) {
        res.json({ token: getAdminToken() });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    try {
        const result = await client.execute("SELECT * FROM projects ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new project
app.post('/api/projects', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    const { name, passcode } = req.body;
    if (!name) return res.status(400).json({ error: "Project name is required" });
    if (!passcode) return res.status(400).json({ error: "A unique passcode is required to create a project" });

    try {
        const result = await client.execute({
            sql: "INSERT INTO projects (name, passcode) VALUES (?, ?)",
            args: [name, passcode]
        });
        res.json({ id: Number(result.lastInsertRowid), name });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get files for a specific project
app.get('/api/projects/:id/files', async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    try {
        const result = await client.execute({
            sql: "SELECT id, filename FROM files WHERE project_id = ? ORDER BY id ASC",
            args: [req.params.id]
        });
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a specific file's content
app.get('/api/files/:id', async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    try {
        const result = await client.execute({
            sql: "SELECT * FROM files WHERE id = ?",
            args: [req.params.id]
        });
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "File not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new file in a project
app.post('/api/projects/:id/files', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    const { filename, content } = req.body;
    const projectId = req.params.id;

    if (!filename) return res.status(400).json({ error: "Filename is required" });

    try {
        const result = await client.execute({
            sql: "INSERT INTO files (project_id, filename, content, file_type) VALUES (?, ?, ?, ?)",
            args: [projectId, filename, content || '', 'code']
        });
        res.json({ id: Number(result.lastInsertRowid), project_id: projectId, filename, content, file_type: 'code' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Upload file endpoint for PDF/DOCX/Code Files
app.post('/api/projects/:id/files/upload', requireAuth, upload.single('file'), async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
    }

    const projectId = req.params.id;
    const fileName = req.file.originalname;
    const fileExt = fileName.split('.').pop().toLowerCase();

    try {
        let contentToStore = '';
        let actualFileType = 'code';

        if (fileExt === 'pdf') {
            contentToStore = req.file.buffer.toString('base64');
            actualFileType = 'pdf';
        } else if (fileExt === 'docx' || fileExt === 'doc') {
            contentToStore = await extractDocxText(req.file.buffer);
            actualFileType = 'document';
        } else {
            // Assume standard code/text file
            contentToStore = req.file.buffer.toString('utf-8');
            actualFileType = 'code';
        }

        // Store the extracted text as content
        const result = await client.execute({
            sql: "INSERT INTO files (project_id, filename, content, file_type, original_filename) VALUES (?, ?, ?, ?, ?)",
            args: [projectId, fileName, contentToStore, actualFileType, fileName]
        });

        res.json({
            id: Number(result.lastInsertRowid),
            project_id: projectId,
            filename: fileName,
            original_filename: fileName,
            content: contentToStore,
            file_type: actualFileType
        });
    } catch (err) {
        res.status(400).json({ error: 'Failed to process file: ' + err.message });
    }
});

// Get folders for a project
app.get('/api/projects/:id/folders', async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    try {
        const result = await client.execute({
            sql: "SELECT * FROM folders WHERE project_id = ? ORDER BY path ASC",
            args: [req.params.id]
        });
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new folder in a project
app.post('/api/projects/:id/folders', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    const { path: folderPath } = req.body;
    const projectId = req.params.id;

    if (!folderPath) return res.status(400).json({ error: "Folder path is required" });

    // Normalize path - remove trailing slash for consistency
    const normalizedPath = folderPath.replace(/\/$/, '');

    try {
        const result = await client.execute({
            sql: "INSERT INTO folders (project_id, path) VALUES (?, ?)",
            args: [projectId, normalizedPath]
        });
        res.json({ id: Number(result.lastInsertRowid), project_id: projectId, path: normalizedPath });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            res.status(400).json({ error: "Folder already exists" });
        } else {
            res.status(400).json({ error: err.message });
        }
    }
});

// Delete a folder
app.delete('/api/folders/:id', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    try {
        await client.execute({
            sql: "DELETE FROM folders WHERE id = ?",
            args: [req.params.id]
        });
        res.json({ message: "Folder deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a file (content or filename)
app.put('/api/files/:id', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    const { content, filename } = req.body;

    try {
        if (content !== undefined && filename !== undefined) {
             await client.execute({ sql: "UPDATE files SET content = ?, filename = ? WHERE id = ?", args: [content, filename, req.params.id] });
        } else if (content !== undefined) {
             await client.execute({ sql: "UPDATE files SET content = ? WHERE id = ?", args: [content, req.params.id] });
        } else if (filename !== undefined) {
             await client.execute({ sql: "UPDATE files SET filename = ? WHERE id = ?", args: [filename, req.params.id] });
        }
        res.json({ message: "File updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a project
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    const projectId = req.params.id;
    const { passcode } = req.body; // Can be sent in body

    try {
        // Check if project has a passcode
        const projectResult = await client.execute({
            sql: "SELECT passcode FROM projects WHERE id = ?",
            args: [projectId]
        });

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: "Project not found" });
        }

        const storedPasscode = projectResult.rows[0].passcode;

        // Verify passcode before deletion
        if (storedPasscode !== passcode) {
            return res.status(403).json({ error: "Passcode required to delete this project", requiresPasscode: true });
        }

        await client.execute({
            sql: "DELETE FROM projects WHERE id = ?",
            args: [projectId]
        });
        res.json({ message: "Project deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a file
app.delete('/api/files/:id', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    try {
        await client.execute({
            sql: "DELETE FROM files WHERE id = ?",
            args: [req.params.id]
        });
        res.json({ message: "File deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- HIGHLIGHTS API ---

// Get all highlights for a file
app.get('/api/files/:fileId/highlights', async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    try {
        const result = await client.execute({
            sql: "SELECT * FROM highlights WHERE file_id = ? ORDER BY start_pos ASC",
            args: [req.params.fileId]
        });
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new highlight
app.post('/api/files/:fileId/highlights', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    const { start_pos, end_pos, text } = req.body;
    const fileId = req.params.fileId;

    if (start_pos === undefined || end_pos === undefined) {
        return res.status(400).json({ error: "start_pos and end_pos are required" });
    }

    try {
        const result = await client.execute({
            sql: "INSERT INTO highlights (file_id, start_pos, end_pos, highlighted_text) VALUES (?, ?, ?, ?)",
            args: [fileId, start_pos, end_pos, text || '']
        });
        res.json({ id: Number(result.lastInsertRowid), file_id: fileId, start_pos, end_pos, highlighted_text: text });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete a highlight
app.delete('/api/highlights/:id', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    try {
        await client.execute({
            sql: "DELETE FROM highlights WHERE id = ?",
            args: [req.params.id]
        });
        res.json({ message: "Highlight deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start the server (local dev only — not used by Vercel serverless)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`CODE ni MARK is running! Navigate to http://localhost:${PORT}`);
    });
}

module.exports = app;
