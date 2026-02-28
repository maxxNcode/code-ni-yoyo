require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
            sql: "INSERT INTO files (project_id, filename, content) VALUES (?, ?, ?)",
            args: [projectId, filename, content || '']
        });
        res.json({ id: Number(result.lastInsertRowid), project_id: projectId, filename, content });
    } catch (err) {
        res.status(400).json({ error: err.message });
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

// Update a file
app.put('/api/files/:id', requireAuth, async (req, res) => {
    if (!client) return res.status(503).json({ error: 'Database not configured' });

    const { content } = req.body;

    try {
        await client.execute({
            sql: "UPDATE files SET content = ? WHERE id = ?",
            args: [content, req.params.id]
        });
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

// Start the server (local dev only — not used by Vercel serverless)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`CODE ni MARK is running! Navigate to http://localhost:${PORT}`);
    });
}

module.exports = app;
