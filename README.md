# ⚡ Hermes Bot — PEV Gestão

> *Mensageiro dos deuses. Escalável, modular, veloz.*

Bot Discord que integra com o **PEV Gestão** para automatizar o envio de escalas e horários de almoço — e muito mais no futuro.

---

## 📁 Estrutura do Projeto

```
hermes/
├── src/
│   ├── index.js                  ← Entrada principal do bot
│   ├── deploy-commands.js        ← Registra comandos no Discord
│   ├── config/
│   │   ├── colaboradores.js      ← Lista de colaboradores (espelho do PEV)
│   │   └── config.js             ← Configurações (canais, horários, emojis)
│   ├── commands/
│   │   ├── escala.js             ← /escala — envia a escala do dia
│   │   └── almoco.js             ← /almoco — envia almoços manualmente
│   ├── tasks/
│   │   └── almoco.js             ← Task automática: almoço seg-sex
│   └── utils/
│       ├── messageBuilder.js     ← Formata mensagens para o Discord
│       └── scheduler.js          ← Motor de agendamento de tasks
├── .env.example                  ← Template de variáveis de ambiente
├── .gitignore
└── package.json
```

---

## 🚀 Configuração Inicial

### 1. Pré-requisitos
- Node.js 18+ instalado
- Conta no [Discord Developer Portal](https://discord.com/developers/applications)

### 2. Criar o Bot no Discord

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications)
2. Clique em **New Application** → nomeie como **Hermes**
3. Vá em **Bot** → clique em **Add Bot**
4. Em **Privileged Gateway Intents**, ative:
   - ✅ **Message Content Intent**
5. Copie o **Token** do bot (guarde com segredo!)
6. Vá em **OAuth2 > URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Read Message History`, `View Channels`
7. Copie a URL gerada e abra no navegador para adicionar o bot ao seu servidor

### 3. Instalar dependências

```bash
cd hermes
npm install
```

### 4. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com seus dados:

```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=id_da_aplicacao
GUILD_ID=id_do_seu_servidor
CHANNEL_ESCALA=id_do_canal_escala
CHANNEL_ALMOCO=id_do_canal_almoco
```

> **Como obter IDs:** No Discord, vá em *Configurações > Aparência* e ative o **Modo Desenvolvedor**. Depois, clique com botão direito em qualquer servidor/canal para "Copiar ID".

### 5. Registrar os Slash Commands

```bash
npm run deploy
```

Isso registra os comandos `/escala` e `/almoco` no seu servidor. Execute novamente sempre que adicionar novos comandos.

### 6. Iniciar o Hermes

```bash
npm start
```

Para desenvolvimento (reinicia ao salvar):
```bash
npm run dev
```

---

## 🎮 Comandos Disponíveis

| Comando | Descrição |
|---|---|
| `/escala enviar` | Abre o painel interativo — defina status por região e envie |
| `/escala todos-interno` | Define todos como Interno e envia direto |
| `/escala todos-externo` | Define todos como Externo e envia direto |
| `/almoco` | Envia manualmente os horários de almoço do dia |

---

## ⏰ Automações

| Task | Horário | Canal |
|---|---|---|
| Almoço diário | 09:00 (seg a sex) | `CHANNEL_ALMOCO` |

Ajuste o horário em `src/config/config.js`:
```js
almocoSchedule: {
  hora:   9,    // 09:00 horário de Brasília
  minuto: 0,
  dias:   [1, 2, 3, 4, 5],
}
```

---

## ➕ Adicionando Novos Comandos

1. Crie `src/commands/meu-comando.js`:

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meu-comando')
    .setDescription('Descrição do comando'),

  async execute(interaction, client) {
    await interaction.reply({ content: 'Olá do Hermes!', ephemeral: true });
  },
};
```

2. Rode `npm run deploy` para registrar o novo comando.

---

## ➕ Adicionando Novas Tasks Automáticas

1. Crie `src/tasks/minha-task.js`:

```js
module.exports = {
  name: 'minha-task',
  schedule: {
    hora:   18,          // 18:00
    minuto: 0,
    dias:   [5],         // Só sexta-feira
  },
  async execute(client, date) {
    const channel = await client.channels.fetch('ID_DO_CANAL');
    await channel.send('Mensagem automática da sexta!');
  },
};
```

O Hermes detecta e carrega automaticamente — sem alterar outros arquivos.

---

## 🔄 Mantendo Sincronizado com o PEV Gestão

Quando adicionar/remover colaboradores no **PEV Gestão**, atualize também o arquivo `src/config/colaboradores.js`.

> **Dica futura:** É possível conectar os dois sistemas via API local (Express) para que o PEV Gestão notifique o Hermes automaticamente — basta adicionar um comando `POST /sync` ao bot.

---

## 🛠️ Roadmap (próximas funcionalidades sugeridas)

- [ ] `/relatorio` — relatório semanal de presença
- [ ] Notificação de aniversários da equipe
- [ ] Integração com Google Sheets para registro automático
- [ ] Sincronização automática com o PEV Gestão via API
- [ ] Comando `/status` para ver quem está interno/externo agora
