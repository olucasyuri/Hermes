// ════════════════════════════════════════════════════════
//  HERMES — Utilitário OpenAI / ChatGPT
//  Analisa histórico de escalas com IA
//  Arquivo: src/utils/openai.js
// ════════════════════════════════════════════════════════

const https = require('https');

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_PROMPT_LENGTH = 15000;
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

function callOpenAI(prompt, attempt = 1) {
  return new Promise((resolve, reject) => {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      return reject(new Error('OPENAI_API_KEY não configurada no Railway'));
    }

    if (!prompt || !prompt.trim()) {
      return reject(new Error('Prompt vazio enviado para OpenAI'));
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
      console.warn('[HERMES] Prompt truncado para evitar excesso de tokens');
    }

    const body = JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Você é um analista de gestão de equipes. Responda sempre em português brasileiro, de forma clara, objetiva e humanizada.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const req = https.request('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';

      res.on('data', chunk => data += chunk);

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          console.log('[HERMES] OpenAI RAW:', JSON.stringify(json).slice(0, 500));

          if (json.error) {
            throw new Error(json.error.message || 'Erro retornado pela OpenAI');
          }

          const text = json.choices?.[0]?.message?.content?.trim();

          if (!text) {
            throw new Error('Resposta vazia da OpenAI');
          }

          return resolve(text);

        } catch (err) {
          if (attempt <= MAX_RETRIES) {
            console.warn(`[HERMES] OpenAI tentativa ${attempt} falhou. Retentando...`);
            return resolve(callOpenAI(prompt, attempt + 1));
          }

          return reject(new Error('OpenAI: ' + err.message));
        }
      });
    });

    req.on('error', err => {
      if (attempt <= MAX_RETRIES) {
        console.warn(`[HERMES] Erro de rede na OpenAI. Retry ${attempt}`);
        return resolve(callOpenAI(prompt, attempt + 1));
      }

      reject(new Error('OpenAI: ' + err.message));
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Timeout ao chamar OpenAI'));
    });

    req.write(body);
    req.end();
  });
}

async function analisarEscalas(log, colabs, pergunta = null) {
  if (!log || Object.keys(log).length === 0) {
    return '📊 Nenhuma escala registrada ainda para analisar.';
  }

  const DIAS_NOME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const resumo = {};

  colabs.forEach(c => {
    resumo[c.nome] = {
      int: 0,
      ext: 0,
      off: 0,
      rod: 0,
      total: 0,
      porDia: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    };
  });

  const porDiaSemana = {
    0: { int: 0, ext: 0, off: 0, rod: 0, total: 0 },
    1: { int: 0, ext: 0, off: 0, rod: 0, total: 0 },
    2: { int: 0, ext: 0, off: 0, rod: 0, total: 0 },
    3: { int: 0, ext: 0, off: 0, rod: 0, total: 0 },
    4: { int: 0, ext: 0, off: 0, rod: 0, total: 0 },
    5: { int: 0, ext: 0, off: 0, rod: 0, total: 0 },
    6: { int: 0, ext: 0, off: 0, rod: 0, total: 0 }
  };

  Object.entries(log).forEach(([dateKey, estado]) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const diaSem = dt.getDay();

    Object.entries(estado).forEach(([nome, dados]) => {
      const status = dados?.status;

      if (!resumo[nome]) return;
      if (!['int', 'ext', 'off', 'rod'].includes(status)) return;

      resumo[nome][status]++;
      resumo[nome].total++;

      if (status === 'int') {
        resumo[nome].porDia[diaSem]++;
      }

      porDiaSemana[diaSem][status]++;
      porDiaSemana[diaSem].total++;
    });
  });

  const dadosColabs = colabs.map(c => {
    const r = resumo[c.nome];

    const pct = t => r.total > 0 ? Math.round((r[t] / r.total) * 100) : 0;
    const melhorDia = Object.entries(r.porDia).sort((a, b) => b[1] - a[1])[0];

    return `${c.nome} (${c.regiao}): INT=${r.int}d(${pct('int')}%) EXT=${r.ext}d(${pct('ext')}%) OFF=${r.off}d(${pct('off')}%) ROD=${r.rod}d(${pct('rod')}%) | Melhor dia interno: ${DIAS_NOME[melhorDia[0]]} (${melhorDia[1]}x)`;
  }).join('\n');

  const dadosDias = Object.entries(porDiaSemana)
    .filter(([, v]) => v.total > 0)
    .map(([dia, v]) => {
      const pct = t => v.total > 0 ? Math.round((v[t] / v.total) * 100) : 0;

      return `${DIAS_NOME[dia]}: ${v.int} internos (${pct('int')}%) | ${v.ext} externos (${pct('ext')}%) | ${v.off} OFF (${pct('off')}%) | ${v.rod} rodízio (${pct('rod')}%)`;
    })
    .join('\n');

  const datas = Object.keys(log).sort();
  const periodoInicio = datas[0];
  const periodoFim = datas[datas.length - 1];
  const totalDias = datas.length;

  const prompt = `
Você é um analista de gestão de equipes da empresa PEV.

Analise os dados abaixo e gere uma resposta clara, objetiva e útil para o gestor.
Use emojis com moderação.
Evite texto muito longo.
Responda em no máximo 1500 caracteres.

PERÍODO ANALISADO:
${periodoInicio} até ${periodoFim} (${totalDias} dia(s) registrados)

DADOS POR COLABORADOR:
${dadosColabs}

DADOS POR DIA DA SEMANA:
${dadosDias}

${pergunta
  ? `PERGUNTA DO GESTOR:
"${pergunta}"

Responda diretamente com base nos dados acima.`
  : `Gere uma análise contendo:
1. 📊 Visão geral da equipe
2. 🏆 Top colaboradores com mais dias internos
3. 📅 Dias com maior presença interna
4. ⚠️ Pontos de atenção
5. 💡 Sugestões práticas para o gestor`
}
`;

  return await callOpenAI(prompt);
}

module.exports = {
  analisarEscalas,
  callOpenAI
};