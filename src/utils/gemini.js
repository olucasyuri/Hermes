// ════════════════════════════════════════════════════════
//  HERMES — Utilitário Gemini
//  Analisa histórico de escalas com IA
//  Arquivo: src/utils/gemini.js
// ════════════════════════════════════════════════════════

const https = require('https');

function callGemini(prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada no Railway');

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error('Resposta vazia do Gemini');
          resolve(text.trim());
        } catch (e) { reject(new Error('Gemini: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Analisa o histórico de escalas e gera insights completos
 * @param {Object} log       - { 'YYYY-MM-DD': escalaState }
 * @param {Array}  colabs    - lista de colaboradores
 * @param {string} pergunta  - pergunta do usuário (opcional)
 */
async function analisarEscalas(log, colabs, pergunta = null) {
  if (!log || Object.keys(log).length === 0) {
    return '📊 Nenhuma escala registrada ainda para analisar.';
  }

  // ── Pré-processa o histórico para resumo estruturado ──
  const DIAS_NOME = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const resumo = {}; // { nome: { int:0, ext:0, off:0, rod:0, total:0, porDia:{} } }

  colabs.forEach(c => {
    resumo[c.nome] = { int:0, ext:0, off:0, rod:0, total:0, porDia:{0:0,1:0,2:0,3:0,4:0,5:0,6:0} };
  });

  // Contagem por dia da semana e por hora (usando a data)
  const porDiaSemana = {0:{int:0,ext:0,off:0,total:0},1:{int:0,ext:0,off:0,total:0},2:{int:0,ext:0,off:0,total:0},3:{int:0,ext:0,off:0,total:0},4:{int:0,ext:0,off:0,total:0},5:{int:0,ext:0,off:0,total:0},6:{int:0,ext:0,off:0,total:0}};
  const porSemana   = {}; // { 'semana YYYY-WW': { int, ext, off } }
  const totalDias   = Object.keys(log).length;

  Object.entries(log).forEach(([dateKey, estado]) => {
    const [y,m,d]  = dateKey.split('-').map(Number);
    const dt       = new Date(y, m-1, d);
    const diaSem   = dt.getDay();
    const semKey   = `${y}-S${Math.ceil(d/7)}`;

    if (!porSemana[semKey]) porSemana[semKey] = { int:0, ext:0, off:0 };

    Object.entries(estado).forEach(([nome, { status }]) => {
      if (!resumo[nome]) return;
      if (!['int','ext','off','rod'].includes(status)) return;
      resumo[nome][status]++;
      resumo[nome].total++;
      if (status === 'int') resumo[nome].porDia[diaSem]++;
      porDiaSemana[diaSem][status] = (porDiaSemana[diaSem][status] || 0) + 1;
      porDiaSemana[diaSem].total++;
      if (status !== 'rod') porSemana[semKey][status]++;
    });
  });

  // ── Monta dados estruturados para o Gemini ────────────
  const dadosColabs = colabs.map(c => {
    const r   = resumo[c.nome];
    const pct = t => r.total > 0 ? Math.round((r[t]/r.total)*100) : 0;
    const melhorDia = Object.entries(r.porDia).sort((a,b)=>b[1]-a[1])[0];
    return `${c.nome} (${c.regiao}): INT=${r.int}d(${pct('int')}%) EXT=${r.ext}d(${pct('ext')}%) OFF=${r.off}d(${pct('off')}%) | Dia com mais presença interna: ${DIAS_NOME[melhorDia[0]]}(${melhorDia[1]}x)`;
  }).join('\n');

  const dadosDias = Object.entries(porDiaSemana)
    .filter(([,v]) => v.total > 0)
    .map(([dia, v]) => {
      const pct = t => v.total > 0 ? Math.round((v[t]/v.total)*100) : 0;
      return `${DIAS_NOME[dia]}: ${v.int} internos(${pct('int')}%) | ${v.ext} externos(${pct('ext')}%) | ${v.off} OFF(${pct('off')}%)`;
    }).join('\n');

  const periodoInicio = Object.keys(log).sort()[0];
  const periodoFim    = Object.keys(log).sort().reverse()[0];

  const promptBase = `
Você é um analista de gestão de equipes da empresa PEV. Analise os dados abaixo e forneça insights claros, objetivos e humanizados em português brasileiro. Use emojis para tornar a leitura agradável.

PERÍODO ANALISADO: ${periodoInicio} até ${periodoFim} (${totalDias} dias de escala registrados)

DADOS POR COLABORADOR:
${dadosColabs}

DADOS POR DIA DA SEMANA:
${dadosDias}

${pergunta
  ? `PERGUNTA ESPECÍFICA DO GESTOR: "${pergunta}"\n\nResponda a pergunta usando os dados acima.`
  : `Forneça uma análise completa incluindo:
1. 📊 Visão geral da equipe (percentual médio interno vs externo vs OFF)
2. 🏆 Top 3 colaboradores com mais dias internos
3. 📅 Dias da semana com maior presença interna
4. ⚠️ Colaboradores com alto índice de ausência (OFF)
5. 💡 Insights e sugestões para o gestor
Seja direto e use no máximo 1500 caracteres no total.`
}`;

  return await callGemini(promptBase);
}

module.exports = { analisarEscalas, callGemini };
