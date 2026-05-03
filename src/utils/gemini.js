// ════════════════════════════════════════════════════════
//  HERMES — Utilitário Gemini (VERSÃO ROBUSTA)
// ════════════════════════════════════════════════════════

const https = require('https');

const MAX_PROMPT_LENGTH = 15000;
const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

// ────────────────────────────────────────────────────────
// 🔹 Função principal de chamada ao Gemini
// ────────────────────────────────────────────────────────
function callGemini(prompt, attempt = 1) {
  return new Promise((resolve, reject) => {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return reject(new Error('GEMINI_API_KEY não configurada'));
    }

    // 🔒 Limita tamanho do prompt
    if (prompt.length > MAX_PROMPT_LENGTH) {
      prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
      console.warn('[HERMES] Prompt truncado para evitar erro da API');
    }

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';

      res.on('data', chunk => data += chunk);

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          // 🔍 Debug (pode comentar depois)
          console.log('[HERMES] Gemini RAW:', JSON.stringify(json).slice(0, 500));

          // ❌ Nenhuma resposta
          if (!json.candidates || json.candidates.length === 0) {
            throw new Error('Nenhuma candidate retornada');
          }

          const parts = json.candidates[0]?.content?.parts;

          // ❌ Estrutura inválida
          if (!parts || parts.length === 0) {
            throw new Error('Resposta sem conteúdo (parts vazio)');
          }

          // ✅ Junta todas as partes
          const text = parts.map(p => p.text || '').join('').trim();

          if (!text) {
            throw new Error('Texto vazio após parse');
          }

          return resolve(text);

        } catch (err) {
          // 🔁 Retry automático
          if (attempt <= MAX_RETRIES) {
            console.warn(`[HERMES] Tentativa ${attempt} falhou. Retentando...`);
            return resolve(callGemini(prompt, attempt + 1));
          }

          return reject(new Error('Gemini: ' + err.message));
        }
      });
    });

    req.on('error', err => {
      if (attempt <= MAX_RETRIES) {
        console.warn(`[HERMES] Erro de rede. Retry ${attempt}`);
        return resolve(callGemini(prompt, attempt + 1));
      }
      reject(err);
    });

    // ⏱️ Timeout
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Timeout ao chamar Gemini'));
    });

    req.write(body);
    req.end();
  });
}

// ────────────────────────────────────────────────────────
// 🔹 Análise de escalas
// ────────────────────────────────────────────────────────
async function analisarEscalas(log, colabs, pergunta = null) {
  if (!log || Object.keys(log).length === 0) {
    return '📊 Nenhuma escala registrada ainda para analisar.';
  }

  const DIAS_NOME = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

  const resumo = {};
  colabs.forEach(c => {
    resumo[c.nome] = {
      int: 0, ext: 0, off: 0, rod: 0, total: 0,
      porDia: {0:0,1:0,2:0,3:0,4:0,5:0,6:0}
    };
  });

  const porDiaSemana = {0:{int:0,ext:0,off:0,total:0},1:{int:0,ext:0,off:0,total:0},2:{int:0,ext:0,off:0,total:0},3:{int:0,ext:0,off:0,total:0},4:{int:0,ext:0,off:0,total:0},5:{int:0,ext:0,off:0,total:0},6:{int:0,ext:0,off:0,total:0}};

  Object.entries(log).forEach(([dateKey, estado]) => {
    const [y,m,d] = dateKey.split('-').map(Number);
    const diaSem = new Date(y, m-1, d).getDay();

    Object.entries(estado).forEach(([nome, { status }]) => {
      if (!resumo[nome]) return;
      if (!['int','ext','off','rod'].includes(status)) return;

      resumo[nome][status]++;
      resumo[nome].total++;

      if (status === 'int') resumo[nome].porDia[diaSem]++;

      porDiaSemana[diaSem][status]++;
      porDiaSemana[diaSem].total++;
    });
  });

  const dadosColabs = colabs.map(c => {
    const r = resumo[c.nome];
    const pct = t => r.total ? Math.round((r[t]/r.total)*100) : 0;
    const melhorDia = Object.entries(r.porDia).sort((a,b)=>b[1]-a[1])[0];

    return `${c.nome}: INT=${r.int}(${pct('int')}%) EXT=${r.ext}(${pct('ext')}%) OFF=${r.off} | Melhor dia: ${DIAS_NOME[melhorDia[0]]}`;
  }).join('\n');

  const dadosDias = Object.entries(porDiaSemana)
    .filter(([,v]) => v.total > 0)
    .map(([dia, v]) => `${DIAS_NOME[dia]}: ${v.int} internos | ${v.ext} externos | ${v.off} OFF`)
    .join('\n');

  const periodoInicio = Object.keys(log).sort()[0];
  const periodoFim = Object.keys(log).sort().reverse()[0];

  let prompt = `
Você é um analista de gestão de equipes.

Período: ${periodoInicio} até ${periodoFim}

Colaboradores:
${dadosColabs}

Dias:
${dadosDias}

${pergunta ? `Pergunta: ${pergunta}` : `Faça uma análise geral com insights e sugestões.`}

Responda de forma objetiva, clara e com no máximo 1200 caracteres.
`;

  return await callGemini(prompt);
}

module.exports = { analisarEscalas, callGemini };