-- Views para consulta fácil no DBeaver
-- Execute depois que o backend subir ao menos uma vez

DROP VIEW IF EXISTS v_messages CASCADE;
DROP VIEW IF EXISTS v_servers  CASCADE;
DROP VIEW IF EXISTS v_users    CASCADE;

CREATE VIEW v_users AS
    SELECT id, username, email, display_name, status, created_at
    FROM users
    ORDER BY created_at DESC;

CREATE VIEW v_servers AS
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
    GROUP BY s.id, s.name, s.invite_code, u.username, s.created_at
    ORDER BY s.created_at DESC;

CREATE VIEW v_messages AS
    SELECT
        m.id,
        u.display_name  AS autor,
        c.name          AS canal,
        sv.name         AS servidor,
        m.content,
        m.created_at
    FROM messages m
    JOIN users    u  ON u.id  = m.author_id
    JOIN channels c  ON c.id  = m.channel_id
    JOIN servers  sv ON sv.id = c.server_id
    ORDER BY m.created_at DESC;
