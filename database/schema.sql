-- ============================================================
--  NEXORA — Schema completo do banco de dados
--  Execute no DBeaver conectado ao banco "nexora"
-- ============================================================

-- Limpar (opcional, apenas para recriar do zero)
-- DROP TABLE IF EXISTS messages       CASCADE;
-- DROP TABLE IF EXISTS server_members CASCADE;
-- DROP TABLE IF EXISTS channels       CASCADE;
-- DROP TABLE IF EXISTS servers        CASCADE;
-- DROP TABLE IF EXISTS users          CASCADE;

-- ============================================================
--  USERS — Contas dos usuários
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id           BIGSERIAL    PRIMARY KEY,
    username     VARCHAR(32)  NOT NULL,
    tag          VARCHAR(4)   NOT NULL,              -- 0001–9999, gerado automaticamente
    email        VARCHAR(255) NOT NULL UNIQUE,
    password     VARCHAR(255) NOT NULL,
    display_name VARCHAR(64),
    avatar_url   TEXT,
    status       VARCHAR(20)  NOT NULL DEFAULT 'online',
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (username, tag)                           -- Gomes#1234 é único; Gomes#5678 pode existir
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- ============================================================
--  SERVERS — Servidores (comunidades)
-- ============================================================
CREATE TABLE IF NOT EXISTS servers (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url    TEXT,
    invite_code VARCHAR(50)  UNIQUE,                -- código de convite
    owner_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servers_owner       ON servers (owner_id);
CREATE INDEX IF NOT EXISTS idx_servers_invite_code ON servers (invite_code);

-- ============================================================
--  SERVER_MEMBERS — Relação usuário ↔ servidor
-- ============================================================
CREATE TABLE IF NOT EXISTS server_members (
    server_id BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id   BIGINT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members (user_id);

-- ============================================================
--  CHANNELS — Canais dentro de um servidor
-- ============================================================
CREATE TABLE IF NOT EXISTS channels (
    id         BIGSERIAL    PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    type       VARCHAR(10)  NOT NULL DEFAULT 'TEXT', -- TEXT | VOICE
    server_id  BIGINT       NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_server ON channels (server_id);

-- ============================================================
--  MESSAGES — Mensagens de texto nos canais
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id         BIGSERIAL PRIMARY KEY,
    content    TEXT      NOT NULL,
    author_id  BIGINT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    channel_id BIGINT    NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    edited_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_channel    ON messages (channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_author     ON messages (author_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (channel_id, created_at DESC);

-- ============================================================
--  VIEWS úteis para consulta no DBeaver
-- ============================================================

-- Ver todos os usuários cadastrados
CREATE OR REPLACE VIEW v_users AS
    SELECT id, username, email, display_name, status, created_at
    FROM users
    ORDER BY created_at DESC;

-- Ver servidores com nome do dono e quantidade de membros
CREATE OR REPLACE VIEW v_servers AS
    SELECT
        s.id,
        s.name          AS servidor,
        s.invite_code,
        u.username      AS dono,
        COUNT(sm.user_id) AS total_membros,
        s.created_at
    FROM servers s
    JOIN users u ON u.id = s.owner_id
    LEFT JOIN server_members sm ON sm.server_id = s.id
    GROUP BY s.id, u.username
    ORDER BY s.created_at DESC;

-- Ver mensagens com autor e canal
CREATE OR REPLACE VIEW v_messages AS
    SELECT
        m.id,
        u.display_name  AS autor,
        c.name          AS canal,
        s.name          AS servidor,
        m.content,
        m.created_at
    FROM messages m
    JOIN users    u ON u.id = m.author_id
    JOIN channels c ON c.id = m.channel_id
    JOIN servers  s ON s.id = c.server_id
    ORDER BY m.created_at DESC;
