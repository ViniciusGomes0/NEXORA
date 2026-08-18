-- Migração: adiciona sistema de tag estilo Discord aos usuários existentes
-- Execute no DBeaver conectado ao banco "nexora"

-- 1. Adiciona a coluna tag (temporariamente nullable)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tag VARCHAR(4);

-- 2. Gera tags aleatórias únicas para usuários existentes
--    (usa lpad + floor + random para gerar 0001–9999)
UPDATE users
SET tag = lpad(floor(random() * 9999 + 1)::int::text, 4, '0')
WHERE tag IS NULL;

-- 3. Torna a coluna obrigatória
ALTER TABLE users ALTER COLUMN tag SET NOT NULL;

-- 4. Remove a constraint UNIQUE antiga de username (se existir)
DO $$
BEGIN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 5. Adiciona a nova constraint única composta (username, tag)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_tag_key;
ALTER TABLE users ADD CONSTRAINT users_username_tag_key UNIQUE (username, tag);
