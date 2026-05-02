// ════════════════════════════════════════════════════════
//  HERMES — Dados dos Colaboradores
//  Espelho do COLABORADORES_DEFAULT do PEV Gestão
// ════════════════════════════════════════════════════════

const COLABORADORES = [
  { nome: "Gabriel Santos",     horario: "08h - 18h",     regiao: "Aracaju",                  almoco: "12:00" },
  { nome: "Michel",             horario: "08h - 18h",     regiao: "Aracaju",                  almoco: "13:12" },
  { nome: "Luan",               horario: "08h - 18h",     regiao: "Aracaju",                  almoco: "11:00" },
  { nome: "Vieira",             horario: "08h - 18h",     regiao: "São Luiz",                 almoco: "13:12" },
  { nome: "Silas",              horario: "08h - 18h",     regiao: "São Luiz",                 almoco: "12:00" },
  { nome: "Pablo Ricardo",      horario: "08h - 14h",     regiao: "São Luiz",                 almoco: "10:30" },
  { nome: "Artur Oliveira",     horario: "08h - 18h",     regiao: "Ipatinga / Teófilo Otoni", almoco: "12:00" },
  { nome: "Lukas Gabriel",      horario: "08h - 18h",     regiao: "Ipatinga / Teófilo Otoni", almoco: "13:12" },
  { nome: "Resende",            horario: "08h - 18h",     regiao: "Ipatinga / Teófilo Otoni", almoco: "11:00" },
  { nome: "Luciano",            horario: "12h - 18h",     regiao: "Ipatinga / Teófilo Otoni", almoco: "15:00" },
  { nome: "Azevedo",            horario: "08h - 18h",     regiao: "Ribeirão Preto",           almoco: "12:00" },
  { nome: "Samuel Shimada",     horario: "08h - 18h",     regiao: "Ribeirão Preto",           almoco: "13:12" },
  { nome: "Assunção",           horario: "08h - 14h",     regiao: "Goiânia",                  almoco: "10:45" },
  { nome: "Matheus Diogo",      horario: "08h - 18h",     regiao: "Goiânia",                  almoco: "12:00" },
  { nome: "Guilherme Ferreira", horario: "12h - 18h",     regiao: "Goiânia",                  almoco: "14:45" },
  { nome: "Glennendy",          horario: "12h - 18h",     regiao: "Juazeiro do Norte",        almoco: "15:30" },
  { nome: "Willy",              horario: "08h - 14h",     regiao: "Juazeiro do Norte",        almoco: "11:30" },
  { nome: "Alvarenga",          horario: "08h - 18h",     regiao: "Cuiabá",                   almoco: "12:00" },
  { nome: "Joadson",            horario: "08h - 18h",     regiao: "Cuiabá",                   almoco: "13:12" },
  { nome: "Firmino",            horario: "14h - 19h",     regiao: "Cuiabá",                   almoco: "15:30" },
  { nome: "Atanael",            horario: "07:30 - 13:30", regiao: "Cuiabá",                   almoco: "10:30" },
];

/**
 * Agrupa colaboradores por região
 * @returns {{ [regiao: string]: Array }}
 */
function groupByRegion(list) {
  return list.reduce((map, c) => {
    if (!map[c.regiao]) map[c.regiao] = [];
    map[c.regiao].push(c);
    return map;
  }, {});
}

module.exports = { COLABORADORES, groupByRegion };
