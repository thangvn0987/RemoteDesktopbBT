-- Users table - lưu thông tin từ Google OAuth
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table - lưu session sau khi login
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Remote sessions table - lưu thông tin remote desktop sessions
CREATE TABLE remote_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, active, completed, expired
    target_info JSONB, -- thông tin máy target
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP
);

-- Host relationships (controller-host pairs)
CREATE TABLE host_relationships (
    relationship_id SERIAL PRIMARY KEY,
    controller_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    host_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'blocked')),
    invitation_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(controller_user_id, host_user_id)
);

-- Audit logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    remote_session_id INTEGER REFERENCES remote_sessions(id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_remote_sessions_user ON remote_sessions(user_id);
CREATE INDEX idx_host_relationships_controller ON host_relationships(controller_user_id);
CREATE INDEX idx_host_relationships_host ON host_relationships(host_user_id);
CREATE INDEX idx_host_relationships_host_status ON host_relationships(host_user_id, status);
CREATE INDEX idx_host_relationships_controller_status ON host_relationships(controller_user_id, status);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_host_relationships_updated ON host_relationships;
CREATE TRIGGER trg_host_relationships_updated
BEFORE UPDATE ON host_relationships
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);

-- Insert sample data for development
INSERT INTO users (google_id, name, email, avatar_url) VALUES
('demo_controller_123', 'John Controller', 'john.controller@example.com', 'https://via.placeholder.com/100'),
('demo_host_alice_456', 'Alice Smith', 'alice@example.com', 'https://via.placeholder.com/100'),
('demo_host_bob_789', 'Bob Johnson', 'bob@example.com', 'https://via.placeholder.com/100'),
('demo_host_carol_101', 'Carol Davis', 'carol@example.com', 'https://via.placeholder.com/100');

-- Create host relationships
INSERT INTO host_relationships (controller_user_id, host_user_id, status, invitation_message) VALUES
((SELECT id FROM users WHERE email = 'john.controller@example.com'), 
 (SELECT id FROM users WHERE email = 'alice@example.com'), 'active', 'Hi Alice! I would like to add you as a host for remote control sessions.'),
((SELECT id FROM users WHERE email = 'john.controller@example.com'), 
 (SELECT id FROM users WHERE email = 'bob@example.com'), 'active', NULL),
((SELECT id FROM users WHERE email = 'john.controller@example.com'), 
 (SELECT id FROM users WHERE email = 'carol@example.com'), 'active', 'Hi Carol! Can I add you to my remote control list?');

-- Add some pending requests for demo (reverse relationships for host dashboard)
INSERT INTO users (google_id, name, email, avatar_url) VALUES
('demo_controller_sarah_202', 'Sarah Controller', 'sarah.controller@example.com', 'https://via.placeholder.com/100'),
('demo_controller_mike_303', 'Mike Johnson', 'mike.controller@example.com', 'https://via.placeholder.com/100');

-- Pending requests for Alice (when she logs in as host)
INSERT INTO host_relationships (controller_user_id, host_user_id, status, invitation_message) VALUES
((SELECT id FROM users WHERE email = 'sarah.controller@example.com'), 
 (SELECT id FROM users WHERE email = 'alice@example.com'), 'pending', 'Hi Alice! I need to remotely assist you with some technical issues. Would you allow me access?'),
((SELECT id FROM users WHERE email = 'mike.controller@example.com'), 
 (SELECT id FROM users WHERE email = 'alice@example.com'), 'pending', 'Hello! I would like to help you with your computer setup.');

-- Create some active sessions to show online status
INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES
((SELECT id FROM users WHERE email = 'alice@example.com'), 'demo_alice_session', NOW() + INTERVAL '1 hour'),
((SELECT id FROM users WHERE email = 'carol@example.com'), 'demo_carol_session', NOW() + INTERVAL '1 hour');