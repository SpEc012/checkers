ALTER TABLE ln_user ADD COLUMN username TEXT;
ALTER TABLE ln_user ADD COLUMN display_username TEXT;
CREATE UNIQUE INDEX ln_user_username_unique ON ln_user(username);
