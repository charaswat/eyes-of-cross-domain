CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
INSERT OR IGNORE INTO settings (key, value) VALUES ('alert', 'ON');

CREATE TABLE IF NOT EXISTS subscribers (user_id TEXT PRIMARY KEY, join_date DATETIME DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS analysis_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    lat REAL,
    lon REAL,
    signature_type TEXT,
    event_color TEXT,
    intensity REAL,
    comment TEXT
);