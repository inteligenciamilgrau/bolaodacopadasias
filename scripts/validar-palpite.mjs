#!/usr/bin/env node
/**
 * Validador de palpites — Bolão da Copa das IAs 2026
 * ---------------------------------------------------
 * Confere se o JSON devolvido por uma IA segue o formato padronizado
 * do PROMPT.md e se a chave é consistente.
 *
 * Uso:  node scripts/validar-palpite.mjs caminho/do/palpite.json
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const OITAVAS = ["O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8"];
const QUARTAS = { Q1: ["O1", "O2"], Q2: ["O3", "O4"], Q3: ["O5", "O6"], Q4: ["O7", "O8"] };
const SEMIS = { S1: ["Q1", "Q2"], S2: ["Q3", "Q4"] };

export function validarPalpite(dados, codigosValidos) {
  const erros = [];
  const erro = (msg) => erros.push(msg);

  // --- identificação
  if (!/^[a-z0-9]+([.-][a-z0-9]+)*$/.test(dados.id || "")) {
    erro(`"id" deve ser kebab-case, com pontos permitidos em versões (ex.: claude-fable-5, gemini-3.5-flash). Recebido: ${JSON.stringify(dados.id)}`);
  }
  for (const campo of ["modelo", "modelo_id", "desenvolvedor", "metodologia"]) {
    if (typeof dados[campo] !== "string" || !dados[campo].trim()) {
      erro(`Campo obrigatório ausente ou vazio: "${campo}"`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data_palpite || "")) {
    erro(`"data_palpite" deve estar no formato AAAA-MM-DD. Recebido: ${JSON.stringify(dados.data_palpite)}`);
  }
  if (!Array.isArray(dados.fontes)) {
    erro(`"fontes" deve ser uma lista de URLs (use [] se a IA não navegou).`);
  }

  // --- estrutura dos palpites
  const p = dados.palpites || {};
  const validarFase = (nome, esperados, obj) => {
    const chaves = Object.keys(obj || {});
    for (const id of esperados) {
      const time = (obj || {})[id];
      if (!time) erro(`Falta o palpite de "${nome}.${id}"`);
      else if (!codigosValidos.has(time)) erro(`"${nome}.${id}": código de time desconhecido "${time}"`);
    }
    for (const extra of chaves.filter((c) => !esperados.includes(c))) {
      erro(`"${nome}.${extra}" não é um jogo válido`);
    }
  };
  validarFase("oitavas", OITAVAS, p.oitavas);
  validarFase("quartas", Object.keys(QUARTAS), p.quartas);
  validarFase("semis", Object.keys(SEMIS), p.semis);

  const campeao = p.final && p.final.campeao;
  if (!campeao) erro(`Falta "final.campeao"`);
  else if (!codigosValidos.has(campeao)) erro(`"final.campeao": código desconhecido "${campeao}"`);

  const placar = p.final && p.final.placar;
  const m = /^(\d+)\s*[xX]\s*(\d+)$/.exec(placar || "");
  if (!m) erro(`"final.placar" deve ter o formato NxN (ex.: 2x1). Recebido: ${JSON.stringify(placar)}`);
  else if (Number(m[1]) <= Number(m[2])) {
    erro(`"final.placar": o primeiro número é o do campeão e deve ser maior (recebido ${placar})`);
  }

  // --- consistência da chave
  if (!erros.length) {
    for (const [q, origem] of Object.entries(QUARTAS)) {
      const permitidos = origem.map((o) => p.oitavas[o]);
      if (!permitidos.includes(p.quartas[q])) {
        erro(`Chave inconsistente: "${q}" (${p.quartas[q]}) deveria ser um dos seus vencedores de ${origem.join("/")} (${permitidos.join(" ou ")})`);
      }
    }
    for (const [s, origem] of Object.entries(SEMIS)) {
      const permitidos = origem.map((q) => p.quartas[q]);
      if (!permitidos.includes(p.semis[s])) {
        erro(`Chave inconsistente: "${s}" (${p.semis[s]}) deveria ser um dos seus vencedores de ${origem.join("/")} (${permitidos.join(" ou ")})`);
      }
    }
    if (![p.semis.S1, p.semis.S2].includes(campeao)) {
      erro(`Chave inconsistente: o campeão (${campeao}) deveria ser um dos seus finalistas (${p.semis.S1} ou ${p.semis.S2})`);
    }
  }

  return erros;
}

export async function carregarCodigosValidos() {
  const timesDoc = JSON.parse(await readFile(join(RAIZ, "data", "times.json"), "utf8"));
  return new Set(Object.keys(timesDoc.times));
}

async function cli() {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error("Uso: node scripts/validar-palpite.mjs caminho/do/palpite.json");
    process.exit(2);
  }
  let dados;
  try {
    dados = JSON.parse(await readFile(caminho, "utf8"));
  } catch (e) {
    console.error(`❌ Não consegui ler JSON de ${caminho}: ${e.message}`);
    process.exit(1);
  }
  const erros = validarPalpite(dados, await carregarCodigosValidos());
  if (erros.length) {
    console.error(`❌ Palpite inválido (${erros.length} problema(s)):\n`);
    erros.forEach((e) => console.error("  ✗ " + e));
    console.error("\nDevolva os erros à IA e peça o JSON corrigido. 😉");
    process.exit(1);
  }
  console.log(`✅ Palpite válido! ${dados.emoji || "🤖"} ${dados.modelo} apostou no título de ${dados.palpites.final.campeao}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
