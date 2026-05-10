/* ============================================================
   FISCALDESK — MOTOR DE REGRAS
   src/utils/fiscal-engine.js
   Toda a lógica do site FiscalDesk portada para Node.js.
   Sem dependências externas.
   ============================================================ */

/**
 * Diagnóstico completo: retorna CFOP, CST, natureza, obs e script
 * @param {string} op       - venda_estado | venda_inter | dev_estado | dev_inter | remessa | transferencia
 * @param {string} regime   - sn | lp | lr
 * @param {string} st       - nao | pago | substituto | isento
 * @param {string} dest     - pj_contrib | pj_ncontrib | pf
 * @returns {{ cfop, cst, natureza, obs: string[], script: string }}
 */
function diagnosticarFiscal({ op, regime, st, dest }) {
  const sn = regime === 'sn';
  let cfop = '', cst = '', natureza = '', obs = [], script = '';

  // ── REMESSA ────────────────────────────────────────────
  if (op === 'remessa') {
    cfop     = '5.949 / 6.949';
    cst      = sn ? 'CSOSN 102 / 500' : 'CST 00 / 60';
    natureza = 'Remessa para conserto ou garantia';
    obs = [
      'Use **5.949** dentro do estado, **6.949** para outro estado.',
      'Retorno do produto: CFOP **1.949** (entrada).',
      'Não há transferência de propriedade — sem fato gerador de ICMS.',
      'Incluir motivo da remessa no campo de observações do XML.',
    ];
    script = 'O CFOP para remessa de conserto ou garantia é **5.949** (mesmo estado) ou **6.949** (outro estado). No retorno, usa **1.949**. Não há cobrança de imposto — confirme com a contabilidade se o estado exige destaque de ICMS.';
  }

  // ── TRANSFERÊNCIA ──────────────────────────────────────
  else if (op === 'transferencia') {
    cfop     = '5.152 / 6.152';
    cst      = sn ? 'CSOSN 102' : 'CST 00';
    natureza = 'Transferência entre estabelecimentos da mesma empresa';
    obs = [
      'Use **5.152** dentro do estado, **6.152** para outro estado.',
      'Emitente e destinatário: mesmo CNPJ raiz com IEs diferentes.',
      'ADC 49/2021 (STF): ICMS na transferência não é obrigatório, mas estados podem exigir via convênio.',
      'Confirmar com a contabilidade se o estado exige destaque de ICMS.',
    ];
    script = 'CFOP de transferência entre filiais: **5.152** (mesmo estado) ou **6.152** (outro estado). Pela ADC 49 do STF, o ICMS na transferência não é mais obrigatório — mas alguns estados ainda exigem. Valide com a contabilidade.';
  }

  // ── DEVOLUÇÃO ──────────────────────────────────────────
  else if (op === 'dev_estado' || op === 'dev_inter') {
    const inter = op === 'dev_inter';

    if (dest === 'pf') {
      cfop     = inter ? '2.202' : '1.202';
      cst      = 'Mesmo da nota original';
      natureza = 'Devolução — consumidor final (PF)';
      obs = [
        '🚨 **Pessoa Física NÃO emite nota.**',
        `A **loja emite** NF-e de entrada com CFOP **${cfop}**.`,
        'Preencher CPF do cliente no campo destinatário.',
        'Referenciar chave de acesso (44 dígitos) da nota original no campo **NFref**.',
        'Copiar NCM, CST/CSOSN e alíquotas da nota original — não recalcular.',
      ];
      script = `O consumidor PF não emite nenhuma nota — a **loja emite** NF-e de entrada com CFOP **${cfop}**. Precisam da chave de 44 dígitos da nota original e do CPF do cliente. Dados fiscais copiados da original. Valide com a contabilidade.`;
    }

    else if (st === 'pago' || st === 'substituto') {
      cfop     = inter ? '2.411' : '1.411';
      cst      = sn ? 'CSOSN 500' : 'CST 60';
      natureza = `Devolução com ST — ${inter ? 'outro estado' : 'mesmo estado'}`;
      obs = [
        `CFOP específico para devolução com ST: **${cfop}** (não use 1.202 ou 2.202).`,
        'CST/CSOSN: igual ao da nota original (60 ou 500).',
        'O ICMS-ST já foi pago anteriormente pelo substituto tributário.',
        'Para recuperar o ST: cada estado tem procedimento diferente — consultar SEFAZ estadual.',
      ];
      script = `Como o produto tinha Substituição Tributária, o CFOP correto é **${cfop}** — não o 1.202 comum. O CST/CSOSN fica igual ao da nota original. Para recuperar o ST pago, consultar a SEFAZ do estado. Valide com a contabilidade.`;
    }

    else {
      cfop     = inter ? '2.202' : '1.202';
      cst      = sn ? 'CSOSN — mesmo da orig.' : 'CST — mesmo da orig.';
      natureza = `Devolução padrão — ${inter ? 'outro estado' : 'mesmo estado'}`;
      obs = [
        'Copiar NCM, CST/CSOSN, alíquotas e valores da nota original — não recalcular.',
        'Referenciar chave de acesso da nota original no campo **NFref** (obrigatório).',
        'CFOP invertido: se a original tinha 5.xxx → use 1.xxx; se tinha 6.xxx → use 2.xxx.',
        'Devolução parcial: ajustar apenas quantidade, manter demais campos.',
      ];
      script = `Para a devolução, o CFOP é **${cfop}**. Replicar dados fiscais da nota original — NCM, CST, alíquotas — sem alterar. Precisam da chave de 44 dígitos para o campo NFref. Valide com a contabilidade.`;
    }
  }

  // ── VENDA ──────────────────────────────────────────────
  else {
    const inter2 = op === 'venda_inter';

    if (st === 'pago') {
      cfop     = inter2 ? '6.404' : '5.405';
      cst      = sn ? 'CSOSN 500' : 'CST 60';
      natureza = 'Venda de produto com ST já recolhida';
      obs = [
        'ST já foi paga pelo substituto (fabricante/importador) anteriormente.',
        'Varejista não destaca ICMS na saída — imposto embutido no preço.',
        'BC ICMS-ST e valor ST ficam zerados (já recolhidos).',
        'PIS/COFINS: verificar se o produto tem regime monofásico.',
      ];
      script = `CFOP **${cfop}**, ${sn ? 'CSOSN **500**' : 'CST **60**'}. Não haverá destaque de ICMS — o imposto já foi pago pelo fabricante. Confirme com a contabilidade se o PIS/COFINS é também monofásico.`;
    }

    else if (st === 'substituto') {
      cfop     = inter2 ? '6.401' : '5.401';
      cst      = sn ? 'CSOSN 201 ou 202' : 'CST 10';
      natureza = 'Venda como substituto tributário (gera ST)';
      obs = [
        'Emitente responsável por recolher o ICMS-ST de toda a cadeia.',
        'BC-ST: (Valor + Frete + Outros + IPI) × (1 + MVA%) do estado de destino.',
        'ICMS-ST = (BC-ST × alíq. interna destino) − ICMS próprio da operação.',
        'MVA varia por NCM e estado — consultar tabela da SEFAZ de destino.',
      ];
      script = `CFOP **${cfop}**, ${sn ? 'CSOSN **201/202**' : 'CST **10**'}. Vocês precisam calcular e recolher o ICMS-ST. O cálculo usa a MVA do estado de destino — cada estado tem tabela diferente. Confirme com a contabilidade os valores antes de emitir.`;
    }

    else if (st === 'isento') {
      cfop     = inter2 ? '6.102' : '5.102';
      cst      = sn ? 'CSOSN 103' : 'CST 40';
      natureza = 'Venda de produto isento / não tributado';
      obs = [
        'ICMS: sem destaque (isento ou não incidente).',
        'Verificar se a isenção é prevista em convênio ou lei estadual específica.',
        'PIS/COFINS: confirmar se há alíquota zero ou isenção para o NCM.',
        'Observações do XML: incluir o dispositivo legal que ampara a isenção.',
      ];
      script = `CFOP **${cfop}**, ${sn ? 'CSOSN **103**' : 'CST **40**'}. Sem destaque de ICMS. Incluir nas observações da nota o convênio ou lei que ampara a isenção. Valide com a contabilidade o dispositivo legal correto.`;
    }

    else {
      // Venda padrão
      if (dest === 'pf' && inter2) {
        cfop     = '6.102';
        cst      = sn ? 'CSOSN 102' : 'CST 00';
        natureza = 'Venda interestadual — consumidor final PF';
        obs = [
          '⚠️ Atenção ao **DIFAL** (Diferencial de Alíquota).',
          'Simples Nacional: verificar se o estado de destino exige recolhimento do DIFAL (Res. CGSN 140/2018).',
          'LP/LR: DIFAL = (alíq. interna destino − alíq. interestadual) × valor da operação.',
          'NF-e deve ter campos de DIFAL preenchidos corretamente.',
        ];
        script = `CFOP **6.102**, ${sn ? 'CSOSN **102**' : 'CST **00**'}. Atenção ao DIFAL — venda interestadual para PF. Para o Simples Nacional, verifique se o estado de destino exige o DIFAL. Valide com a contabilidade o cálculo correto.`;
      } else {
        cfop     = inter2 ? '6.102' : '5.102';
        cst      = sn ? 'CSOSN 102' : 'CST 00';
        natureza = `Venda padrão — ${inter2 ? 'outro estado' : 'mesmo estado'}`;
        obs = [
          'Destacar ICMS normalmente pela alíquota aplicável ao estado de destino.',
          ...(sn ? ['Simples Nacional: alíquota efetiva do PGDAS — não é a alíquota padrão do estado.'] : []),
          'PIS/COFINS: verificar regime do produto (monofásico, cumulativo ou não cumulativo).',
          'Verificar se há redução de BC ou benefício fiscal para o NCM no estado.',
        ];
        script = `CFOP **${cfop}**, ${sn ? 'CSOSN **102**' : 'CST **00**'}. Destaque o ICMS normalmente. ${sn ? 'Simples Nacional: use a alíquota efetiva do PGDAS, não a padrão do estado. ' : ''}Valide com a contabilidade antes de emitir.`;
      }
    }
  }

  return { cfop, cst, natureza, obs, script };
}

/**
 * Calculadora de devolução
 */
function calcularDevolucao({ local, st, quem }) {
  let cfop, cst, emitente, obs = [];

  if (quem === 'pf') {
    cfop     = local === 'intra' ? '1.202' : '2.202';
    cst      = 'Mesmo da NF original';
    emitente = 'LOJA emite NF-e de entrada';
    obs = [
      '🚨 **Consumidor Final (PF) NÃO emite nota.**',
      `CFOP **${cfop}** — ${local === 'intra' ? 'mesmo estado' : 'outro estado'}.`,
      'Preencher CPF do cliente no campo destinatário.',
      'Referenciar chave de acesso (44 dígitos) da nota original no campo **NFref**.',
    ];
  } else if (st === 'sim') {
    cfop     = local === 'intra' ? '1.411' : '2.411';
    cst      = 'CST 60 / CSOSN 500';
    emitente = 'Comprador (PJ) emite NF-e de entrada';
    obs = [
      `⚠️ Produto com ST — CFOP correto é **${cfop}** (não use 1.202 ou 2.202).`,
      'CST/CSOSN: mesmo da nota original (60 ou 500).',
      'ICMS-ST já pago anteriormente pelo substituto tributário.',
      'Para restituição do ST: consultar SEFAZ do estado.',
    ];
  } else {
    cfop     = local === 'intra' ? '1.202' : '2.202';
    cst      = 'Mesmo da NF original';
    emitente = 'Comprador (PJ) emite NF-e de entrada';
    obs = [
      `✅ Cenário padrão — CFOP **${cfop}**.`,
      'Replicar NCM, CST/CSOSN, alíquotas e valores da nota original.',
      'Referenciar chave de acesso (44 dígitos) no campo **NFref** (obrigatório).',
      'Confirmar com a contabilidade os valores de imposto a ser estornado.',
    ];
  }

  return { cfop, cst, emitente, obs };
}

// ── Dados estáticos ──────────────────────────────────────

const FAQ = {
  cancelamento: {
    titulo: '⏱ Cancelamento após 24h',
    texto: [
      'Cancelamento só é possível em **até 24 horas** após a autorização da nota.',
      'Após esse prazo, a única opção é emitir uma **nota de devolução**.',
      'Nunca oriente o cliente a cancelar fora do prazo — a SEFAZ rejeitará.',
      'Se ainda no prazo: NF-e → Cancelar → justificativa (mínimo 15 caracteres).',
    ],
  },
  pf_dev: {
    titulo: '👤 Devolução — consumidor final (PF)',
    texto: [
      'Pessoa Física **NUNCA emite nota fiscal.**',
      'Quando o cliente PF devolve, a **loja emite** NF-e de **entrada**.',
      'CFOP: **1.202** (mesmo estado) ou **2.202** (outro estado).',
      'Referenciar chave de acesso (44 dígitos) no campo NFref.',
      'Copiar NCM, CST/CSOSN e alíquotas da nota original sem recalcular.',
    ],
  },
  diferenca_1202_5202: {
    titulo: '❓ 1.202 vs 5.202 — qual usar?',
    texto: [
      '**1.202** — Loja *recebe de volta* mercadoria que vendeu. Quem emite é o cliente (PJ).',
      '**5.202** — Loja *devolve ao fornecedor* mercadoria que comprou. Quem emite é a própria loja.',
      'Regra: 1 = entrada, 5 = saída. Pergunte: quem emite e para onde vai a mercadoria?',
    ],
  },
  csosn_102_500: {
    titulo: '❓ CSOSN 102 vs CSOSN 500',
    texto: [
      '**CSOSN 102** — Tributada pelo SN, sem ST. ICMS incluído no DAS. Comprador PJ sem crédito.',
      '**CSOSN 500** — ICMS cobrado anteriormente por ST. Produto com ST já paga (fabricante/distribuidor).',
      'Regra rápida: veio da nota de compra com 500 ou CST 60? Vende com **500**. Sem ST, usa **102**.',
    ],
  },
  remessa_garantia: {
    titulo: '🔧 Remessa para conserto / garantia',
    texto: [
      'Saída: **5.949** (mesmo estado) ou **6.949** (outro estado).',
      'Retorno: **1.949** (mesmo estado) ou **2.949** (outro estado).',
      'Não há transferência de propriedade — não incide ICMS como fato gerador normal.',
      'Incluir nas observações: "Remessa para conserto/garantia — retornará ao remetente".',
    ],
  },
  difal: {
    titulo: '🗺 DIFAL — venda interestadual para PF',
    texto: [
      'DIFAL = (alíquota interna destino − alíquota interestadual) × base de cálculo.',
      'Alíquota interestadual: **7%** (destino Norte/Nordeste/CO) ou **12%** (Sul/Sudeste).',
      'Simples Nacional: verificar se o estado de destino tem convênio cobrando DIFAL do SN.',
      '⚠️ Alta complexidade — sempre confirmar o cálculo com a contabilidade.',
    ],
  },
};

const CFOPS = [
  { cfop: '1.102', desc: 'Compra p/ comercialização — dentro estado',       tipo: 'Entrada' },
  { cfop: '2.102', desc: 'Compra p/ comercialização — fora estado',          tipo: 'Entrada' },
  { cfop: '1.202', desc: 'Devolução de venda — dentro estado',               tipo: 'Entrada' },
  { cfop: '2.202', desc: 'Devolução de venda — fora estado',                 tipo: 'Entrada' },
  { cfop: '1.411', desc: 'Devolução de venda c/ ST — dentro estado',         tipo: 'Entrada' },
  { cfop: '2.411', desc: 'Devolução de venda c/ ST — fora estado',           tipo: 'Entrada' },
  { cfop: '1.949', desc: 'Retorno de remessa para conserto/garantia',        tipo: 'Entrada' },
  { cfop: '5.101', desc: 'Venda de produção própria — dentro estado',        tipo: 'Saída'   },
  { cfop: '6.101', desc: 'Venda de produção própria — fora estado',          tipo: 'Saída'   },
  { cfop: '5.102', desc: 'Venda de mercadoria adquirida — dentro estado',    tipo: 'Saída'   },
  { cfop: '6.102', desc: 'Venda de mercadoria adquirida — fora estado',      tipo: 'Saída'   },
  { cfop: '5.405', desc: 'Venda de mercadoria c/ ST retida — dentro estado', tipo: 'Saída'   },
  { cfop: '6.404', desc: 'Venda c/ ST — fora estado (substituto)',           tipo: 'Saída'   },
  { cfop: '5.202', desc: 'Devolução de compra — dentro estado',              tipo: 'Saída'   },
  { cfop: '6.202', desc: 'Devolução de compra — fora estado',                tipo: 'Saída'   },
  { cfop: '5.949', desc: 'Remessa p/ conserto, garantia, outros',            tipo: 'Saída'   },
  { cfop: '6.949', desc: 'Remessa p/ conserto/garantia — fora estado',       tipo: 'Saída'   },
  { cfop: '5.152', desc: 'Transferência de mercadoria — mesma empresa',      tipo: 'Transf.' },
  { cfop: '6.152', desc: 'Transferência de mercadoria — outro estado',       tipo: 'Transf.' },
];

const CST_CSOSN = {
  csosn: [
    { cod: '101', desc: 'Tributada pelo SN com permissão de crédito',      uso: 'Venda quando comprador PJ pode aproveitar crédito' },
    { cod: '102', desc: 'Tributada pelo SN sem permissão de crédito',      uso: 'Venda padrão sem crédito para comprador' },
    { cod: '103', desc: 'Isenção pelo SN — faixa de receita bruta',        uso: 'Empresas MEI / faixa baixa' },
    { cod: '201', desc: 'SN com crédito + ST',                             uso: 'Substituto tributário no SN com crédito' },
    { cod: '202', desc: 'SN sem crédito + ST',                             uso: 'Substituto tributário no SN sem crédito' },
    { cod: '500', desc: 'ICMS cobrado anteriormente por ST ou antecipação',uso: 'Revenda de produto já com ST pago — muito usado no varejo SN ⭐' },
    { cod: '900', desc: 'Outros — SN',                                     uso: 'Casos não enquadrados acima' },
  ],
  cst: [
    { cod: '00', desc: 'Tributada integralmente',                uso: 'Venda normal com ICMS cheio' },
    { cod: '10', desc: 'Tributada + cobrança de ST',             uso: 'Substituto gerando ST na saída' },
    { cod: '20', desc: 'Com redução de base de cálculo',         uso: 'Produtos com benefício fiscal de redução' },
    { cod: '40', desc: 'Isenta',                                 uso: 'Produto isento de ICMS' },
    { cod: '41', desc: 'Não tributada',                          uso: 'Fora do campo de incidência do ICMS' },
    { cod: '51', desc: 'Diferimento',                            uso: 'ICMS diferido p/ etapa seguinte' },
    { cod: '60', desc: 'ICMS cobrado anteriormente por ST',      uso: 'Revenda de produto com ST já pago ⭐' },
    { cod: '70', desc: 'Redução BC + cobrança de ST',            uso: 'Produto com redução e também ST' },
    { cod: '90', desc: 'Outras',                                 uso: 'Situações não enquadradas acima' },
  ],
};

const CHECKLIST = [
  { grupo: 'Identificação', itens: [
    'Identificou o regime tributário do cliente (SN / LP / LR / MEI)',
    'Confirmou se a operação é dentro ou fora do estado',
    'Verificou se o produto tem substituição tributária (ST)',
    'Identificou o tipo de destinatário (PJ contribuinte / consumidor final)',
  ]},
  { grupo: 'Dados Fiscais', itens: [
    'Orientou o CFOP correto com base no cenário',
    'Orientou o CST / CSOSN correto',
    'Informou alíquota de ICMS de referência (com ressalva de validação)',
    'Verificou PIS/COFINS (monofásico, isento ou normal)',
    'Alertou sobre IPI se aplicável (prazo 15 dias para devolução)',
  ]},
  { grupo: 'Devolução (se aplicável)', itens: [
    'Cliente tem a chave de acesso da NF original (44 dígitos)',
    'CFOP invertido corretamente (5→1 ou 6→2)',
    'Alertou que os dados fiscais devem ser replicados da nota original',
    'Verificou se é cancelamento (24h) ou devolução (após 24h)',
  ]},
  { grupo: 'Encerramento', itens: [
    'Informou ao cliente que deve validar com a contabilidade antes de emitir',
    'Usou o modelo de resposta padrão sem afirmar "100% certo"',
    'Registrou o atendimento no sistema de suporte',
    'Anotou dúvida recorrente para FAQ interno',
  ]},
];

module.exports = { diagnosticarFiscal, calcularDevolucao, FAQ, CFOPS, CST_CSOSN, CHECKLIST };
