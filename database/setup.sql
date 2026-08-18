-- Execute este script no DBeaver para criar o banco NEXORA
-- Conecte ao PostgreSQL como superuser primeiro

CREATE DATABASE nexora
    WITH
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Portuguese_Brazil.1252'
    LC_CTYPE = 'Portuguese_Brazil.1252'
    TEMPLATE = template0;

-- Após criar, conecte ao banco "nexora" e execute:
-- (O Spring Boot criará as tabelas automaticamente via JPA com ddl-auto=update)

-- Caso queira criar manualmente:
/*
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(32) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(64),
    avatar_url TEXT,
    status VARCHAR(20) DEFAULT 'online',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE servers (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url TEXT,
    invite_code VARCHAR(50) UNIQUE,
    owner_id BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE server_members (
    server_id BIGINT REFERENCES servers(id),
    user_id BIGINT REFERENCES users(id),
    PRIMARY KEY (server_id, user_id)
);

CREATE TABLE channels (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'TEXT',
    server_id BIGINT REFERENCES servers(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    author_id BIGINT REFERENCES users(id),
    channel_id BIGINT REFERENCES channels(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    edited_at TIMESTAMP
);
*/
