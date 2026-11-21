-- Core schema for the textbook loan system. Additive only.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','librarian')),
  password_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_name);
CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  form TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  isbn TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL UNIQUE,
  title_id INTEGER NOT NULL REFERENCES titles(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','loaned','damaged','lost','retired')),
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_copies_title ON copies(title_id);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copy_id INTEGER NOT NULL REFERENCES copies(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  borrowed_at TEXT NOT NULL DEFAULT (date('now')),
  due_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'out' CHECK (state IN ('out','returned','owed','cleared')),
  condition TEXT CHECK (condition IN ('good','damaged','lost')),
  closed_at TEXT,
  cleared_at TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loans_state ON loans(state);
CREATE INDEX IF NOT EXISTS idx_loans_copy ON loans(copy_id);
CREATE INDEX IF NOT EXISTS idx_loans_student ON loans(student_id);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('due_date', '2026-11-14');
INSERT OR IGNORE INTO settings (key, value) VALUES ('session_label', '2026 session');
