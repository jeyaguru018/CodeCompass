-- Add sharing capabilities to chat_sessions
ALTER TABLE chat_sessions
ADD COLUMN is_public BOOLEAN DEFAULT FALSE,
ADD COLUMN shared_token VARCHAR(255) UNIQUE;

-- Create an index on shared_token for fast lookup of public chat links
CREATE INDEX idx_chat_sessions_shared_token ON chat_sessions(shared_token);

-- Add updated_at for tracking stuck analysis jobs
ALTER TABLE repositories
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
