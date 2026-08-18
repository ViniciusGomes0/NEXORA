# Como rodar o NEXORA

## Pré-requisitos
- Java 17+ (JDK)
- Maven 3.8+
- PostgreSQL 14+ (com DBeaver instalado)
- Navegador moderno (Chrome/Firefox)

---

## 1. Banco de Dados (PostgreSQL)

1. Abra o **DBeaver** e conecte ao PostgreSQL local
2. Execute o arquivo `database/setup.sql` para criar o banco
   - OU crie manualmente: clique com botão direito → Create Database → Nome: `nexora`
3. Verifique as credenciais em `backend/src/main/resources/application.properties`:
   ```
   spring.datasource.username=postgres
   spring.datasource.password=postgres
   ```
   Altere para sua senha do PostgreSQL.

---

## 2. Backend (Spring Boot)

Abra um terminal na pasta `backend/` e execute:

```bash
mvn spring-boot:run
```

O servidor sobe em `http://localhost:8080`

As tabelas são criadas automaticamente pelo JPA na primeira execução.

---

## 3. Frontend

Abra o arquivo `frontend/index.html` diretamente no navegador.

> **Dica:** Para evitar problemas de CORS com `file://`, use uma extensão como
> "Live Server" no VS Code, ou rode um servidor HTTP simples:
> ```bash
> cd frontend
> npx serve .
> ```
> E acesse `http://localhost:3000`

---

## Funcionalidades

| Feature | Status |
|---|---|
| Registro / Login | ✅ |
| Criar servidores | ✅ |
| Entrar com código convite | ✅ |
| Canais de texto (real-time) | ✅ |
| Canais de voz (WebRTC) | ✅ |
| Compartilhar tela | ✅ |
| Mutar microfone | ✅ |
| Ensurdecer (deafen) | ✅ |
| Criar canais | ✅ |
| JWT Authentication | ✅ |

---

## Estrutura do Projeto

```
NEXORA/
├── backend/          # Java Spring Boot
│   ├── pom.xml
│   └── src/
│       └── main/java/com/nexora/
│           ├── config/       # JWT, Security, WebSocket
│           ├── controller/   # REST + WebSocket handlers
│           ├── dto/          # Data Transfer Objects
│           ├── model/        # JPA Entities
│           ├── repository/   # Spring Data JPA
│           └── service/      # Business logic
├── frontend/         # HTML + CSS + JavaScript puro
│   ├── index.html    # Login/Registro
│   ├── app.html      # App principal
│   ├── css/
│   └── js/
│       ├── api.js        # Chamadas REST
│       ├── app.js        # Lógica principal UI
│       ├── auth.js       # Login/Registro
│       ├── websocket.js  # STOMP/SockJS chat
│       └── webrtc.js     # Voz/Vídeo/Tela
└── database/
    └── setup.sql     # Script de criação do banco
```
