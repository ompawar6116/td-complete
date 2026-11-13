-- One row per reply the admin sends to an inquiry. The email is sent when the
-- reply is created; email_status records what happened so nothing is lost if
-- SMTP is down or not configured: 'sent', 'failed' or 'skipped'.
CREATE TABLE IF NOT EXISTS inquiry_replies (
  id            UUID PRIMARY KEY,
  inquiry_id    UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  message       TEXT NOT NULL,
  sent_to       TEXT NOT NULL,
  email_status  TEXT NOT NULL DEFAULT 'skipped',
  email_error   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_replies_inquiry ON inquiry_replies (inquiry_id, created_at DESC);
