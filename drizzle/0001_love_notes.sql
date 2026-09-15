CREATE TABLE IF NOT EXISTS ln_user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ln_session (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES ln_user(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT);
CREATE INDEX IF NOT EXISTS ln_session_user ON ln_session(user_id);
CREATE TABLE IF NOT EXISTS ln_account (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES ln_user(id) ON DELETE CASCADE, access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ln_verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS ln_verification_identifier ON ln_verification(identifier);
CREATE TABLE IF NOT EXISTS ln_rate_limit (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, count INTEGER NOT NULL, last_request INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ln_profile (user_id TEXT PRIMARY KEY REFERENCES ln_user(id) ON DELETE CASCADE, timezone TEXT NOT NULL DEFAULT 'UTC', receipts INTEGER NOT NULL DEFAULT 0, previews TEXT NOT NULL DEFAULT 'sender');
CREATE TABLE IF NOT EXISTS ln_pair (id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ln_member (user_id TEXT PRIMARY KEY REFERENCES ln_user(id), pair_id TEXT NOT NULL REFERENCES ln_pair(id));
CREATE INDEX IF NOT EXISTS ln_member_pair ON ln_member(pair_id);
CREATE TABLE IF NOT EXISTS ln_invite (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL REFERENCES ln_user(id), expires_at INTEGER NOT NULL, used_by TEXT, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ln_note (id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES ln_user(id), recipient_id TEXT REFERENCES ln_user(id), pair_id TEXT REFERENCES ln_pair(id), reply_id TEXT REFERENCES ln_note(id), document TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('draft','scheduled','sent','cancelled')), due_at INTEGER, timezone TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sent_at INTEGER, read_at INTEGER, revision INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ln_note_due ON ln_note(status,due_at);
CREATE INDEX IF NOT EXISTS ln_note_inbox ON ln_note(recipient_id,status,sent_at);
CREATE INDEX IF NOT EXISTS ln_note_sender ON ln_note(sender_id,status,updated_at);
CREATE TABLE IF NOT EXISTS ln_note_pref (note_id TEXT NOT NULL REFERENCES ln_note(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES ln_user(id), saved INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, reaction TEXT, PRIMARY KEY(note_id,user_id));
CREATE TABLE IF NOT EXISTS ln_push (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES ln_user(id), session_id TEXT NOT NULL REFERENCES ln_session(id) ON DELETE CASCADE, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ln_outbox (id TEXT PRIMARY KEY, note_id TEXT REFERENCES ln_note(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES ln_user(id), subscription_id TEXT NOT NULL REFERENCES ln_push(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, lease TEXT, UNIQUE(note_id,subscription_id));
CREATE INDEX IF NOT EXISTS ln_outbox_due ON ln_outbox(status,next_at);
CREATE TABLE IF NOT EXISTS ln_throttle (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, reset_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS ln_note_publish AFTER UPDATE OF status ON ln_note WHEN NEW.status='sent' AND OLD.status!='sent'
BEGIN
  INSERT OR IGNORE INTO ln_outbox(id,note_id,user_id,subscription_id,next_at)
  SELECT NEW.id || ':' || p.id,NEW.id,NEW.recipient_id,p.id,NEW.sent_at FROM ln_push p JOIN ln_session s ON p.session_id=s.id WHERE p.user_id=NEW.recipient_id AND s.expires_at>NEW.sent_at;
END;
