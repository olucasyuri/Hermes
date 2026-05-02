# ⚡ Integração PEV Gestão ↔ Hermes — Guia Completo

## Arquitetura final

```
[Site Vercel] ──POST /api/hermes──► [Vercel API Route]
                                           │
                                    repassa + autenticação
                                           │
                                           ▼
                              [Hermes no Railway] ──► [Discord]
                                    (24/7 online)

[Vercel Cron] ──POST /api/hermes──► mesma rota ──► Hermes ──► Discord
 (horário fixo)
```

---

## PARTE 1 — Hermes no Railway

### 1.1 Criar conta no Railway
Acesse https://railway.app e entre com sua conta GitHub.

### 1.2 Subir o Hermes
1. Crie um novo projeto: **New Project → Deploy from GitHub repo**
2. Selecione o repositório do Hermes
3. Railway detecta automaticamente que é Node.js

### 1.3 Configurar variáveis de ambiente no Railway
No painel do projeto → **Variables**, adicione:

```
DISCORD_TOKEN       = seu_token_do_bot
CLIENT_ID           = id_da_aplicacao
GUILD_ID            = id_do_servidor
CHANNEL_ESCALA      = id_do_canal_escala
CHANNEL_ALMOCO      = id_do_canal_almoco
PORT                = 3001
API_SECRET          = (gere uma chave aleatória longa, ex: 64 caracteres)
SITE_URL            = https://seu-site.vercel.app
```

**Como gerar a API_SECRET:** use qualquer gerador online de strings aleatórias
ou rode no terminal: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 1.4 Arquivos para adicionar/substituir no Hermes

Substitua `src/index.js` pelo arquivo `hermes-additions/index.js`
Adicione `src/server.js` (arquivo `hermes-additions/server.js`)

### 1.5 Pegar a URL pública do Hermes
No Railway, vá em **Settings → Networking → Generate Domain**
Copie a URL gerada (ex: `https://hermes-production-xxxx.up.railway.app`)

---

## PARTE 2 — Vercel (Site)

### 2.1 Estrutura de arquivos no projeto do site

```
seu-projeto-vercel/
├── api/
│   └── hermes.js        ← arquivo vercel-api/hermes.js
├── vercel.json          ← arquivo vercel-api/vercel.json
├── index.html
├── gestao-pev.css
└── gestao-pev.js        ← usar gestao-pev-hermes.js (versão atualizada)
```

### 2.2 Variáveis de ambiente no Vercel
No painel do Vercel → **Settings → Environment Variables**:

```
HERMES_URL    = https://hermes-production-xxxx.up.railway.app
API_SECRET    = (a mesma chave que você usou no Railway)
```

### 2.3 Configurar o vercel.json (Cron Jobs)
O arquivo `vercel.json` já está configurado com dois crons:

- `0 11 * * 1-5` → **08h (Brasília)** de segunda a sexta — ajuste o horário desejado para escala
- `0 12 * * 1-5` → **09h (Brasília)** — ajuste para o horário do almoço

> **Atenção:** O Vercel Cron usa UTC. Brasília = UTC-3.
> Para disparar às 08h Brasília → use `0 11 * * 1-5` (11h UTC)
> Para disparar às 09h Brasília → use `0 12 * * 1-5` (12h UTC)

O Vercel Cron envia o body automaticamente para `/api/hermes`.
Para que o cron saiba qual tipo enviar, você precisa diferenciar as rotas:

**Opção simples:** crie dois arquivos de cron separados:
- `api/cron-escala.js` — chama `/send/escala` no Hermes
- `api/cron-almoco.js` — chama `/send/almoco` no Hermes

E no vercel.json:
```json
{
  "crons": [
    { "path": "/api/cron-escala", "schedule": "0 11 * * 1-5" },
    { "path": "/api/cron-almoco", "schedule": "0 12 * * 1-5" }
  ]
}
```

---

## PARTE 3 — Testando

### 3.1 Verificar se o Hermes está online
Acesse no navegador: `https://sua-url-railway.up.railway.app/health`
Deve retornar: `{ "status": "ok", "bot": "Hermes#1234" }`

### 3.2 Testar envio manual
No site, monte a escala normalmente e clique **"Enviar Escala"**.
O fluxo será: Site → `/api/hermes` → Railway → Discord ✓

### 3.3 Verificar cron
No painel do Vercel → **Cron Jobs** você pode ver o histórico de execuções
e disparar manualmente para testar.

---

## Horários recomendados (Brasília → UTC)

| Evento        | Brasília | UTC (vercel.json) |
|---------------|----------|-------------------|
| Escala manhã  | 08:00    | `0 11 * * 1-5`    |
| Almoço        | 09:00    | `0 12 * * 1-5`    |
| Escala tarde  | 13:00    | `0 16 * * 1-5`    |

---

## Resumo de custos

| Serviço      | Plano     | Custo       |
|--------------|-----------|-------------|
| Vercel       | Hobby     | Gratuito    |
| Railway      | Hobby     | ~$5/mês (ou gratuito com créditos iniciais) |
| Discord Bot  | —         | Gratuito    |
