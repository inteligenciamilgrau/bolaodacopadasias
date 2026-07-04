#!/usr/bin/env node
/**
 * Registrador de palpites — Bolão da Copa das IAs 2026
 * -----------------------------------------------------
 * Valida o JSON devolvido pela IA, copia para data/palpites/<id>.json
 * e registra no manifest.json. Depois é só publicar o site.
 *
 * Uso:  node scripts/adicionar-palpite.mjs caminho/do/palpite.json [--forcar]
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validarPalpite, carregarCodigosValidos } from "./validar-palpite.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_PALPITES = join(RAIZ, "data", "palpites");
const ARQ_MANIFEST = join(PASTA_PALPITES, "manifest.json");

async function principal() {
  const caminho = process.argv[2];
  const forcar = process.argv.includes("--forcar");
  if (!caminho) {
    console.error("Uso: node scripts/adicionar-palpite.mjs caminho/do/palpite.json [--forcar]");
    process.exit(2);
  }

  const dados = JSON.parse(await readFile(caminho, "utf8"));
  const erros = validarPalpite(dados, await carregarCodigosValidos());
  if (erros.length) {
    console.error(`❌ Palpite inválido (${erros.length} problema(s)):\n`);
    erros.forEach((e) => console.error("  ✗ " + e));
    console.error("\nCorrija (ou peça à IA para corrigir) e tente de novo.");
    process.exit(1);
  }

  const destino = join(PASTA_PALPITES, `${dados.id}.json`);
  if (existsSync(destino) && !forcar) {
    console.error(`❌ Já existe um palpite com id "${dados.id}" (${destino}).`);
    console.error("   Use --forcar para substituir, ou mude o id (ex.: gpt-5-segunda-tentativa… brincadeira, palpite não se troca! 😄)");
    process.exit(1);
  }

  await writeFile(destino, JSON.stringify(dados, null, 2) + "\n", "utf8");

  const manifest = JSON.parse(await readFile(ARQ_MANIFEST, "utf8"));
  const arquivo = `${dados.id}.json`;
  if (!manifest.palpites.includes(arquivo)) {
    manifest.palpites.push(arquivo);
    manifest.palpites.sort();
    await writeFile(ARQ_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }

  console.log(`✅ ${dados.emoji || "🤖"} ${dados.modelo} entrou no bolão!`);
  console.log(`   Arquivo: data/palpites/${arquivo}`);
  console.log(`   Aposta de campeão: ${dados.palpites.final.campeao} (final ${dados.palpites.final.placar})`);
  console.log("   Agora é só fazer commit e publicar. Boa sorte pra ela! 🍀");
}

principal().catch((erro) => {
  console.error("❌ Erro:", erro.message);
  process.exit(1);
});
