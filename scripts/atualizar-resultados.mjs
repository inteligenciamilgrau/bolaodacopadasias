#!/usr/bin/env node
/**
 * Importador de resultados — Bolão da Copa das IAs 2026
 * ------------------------------------------------------
 * Busca os jogos do torneio na API gratuita da football-data.org,
 * preenche vagas "a definir", atualiza placares/vencedores em
 * data/jogos.json e marca eliminados em data/times.json.
 *
 * Uso:
 *   FOOTBALL_DATA_TOKEN=seu_token node scripts/atualizar-resultados.mjs [--dry-run]
 *
 * Token gratuito: https://www.football-data.org/client/register
 * Sem token o script apenas avisa e sai (os JSONs também podem ser
 * editados na mão — o site lê tudo de data/).
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARQ_JOGOS = join(RAIZ, "data", "jogos.json");
const ARQ_TIMES = join(RAIZ, "data", "times.json");
const DRY_RUN = process.argv.includes("--dry-run");

const API_URL = "https://api.football-data.org/v4/competitions/WC/matches";

// Fases da API → fases do bolão (nomes variam entre temporadas da API)
const FASE_API = {
  LAST_16: "oitavas",
  ROUND_OF_16: "oitavas",
  QUARTER_FINALS: "quartas",
  SEMI_FINALS: "semis",
  THIRD_PLACE: "terceiro",
  THIRD_PLACE_PLAYOFF: "terceiro",
  PLAY_OFF_FOR_THIRD_PLACE: "terceiro",
  FINAL: "final",
};
const FASES_R32 = ["LAST_32", "ROUND_OF_32", "PLAY_OFF_ROUND"];

// Nome em inglês na API → nosso código (reserva, caso a TLA da API difira)
const APELIDOS = {
  "Brazil": "BRA", "France": "FRA", "England": "ENG", "Spain": "ESP",
  "Portugal": "POR", "Belgium": "BEL", "Morocco": "MAR", "Canada": "CAN",
  "Mexico": "MEX", "Norway": "NOR", "Paraguay": "PAR", "Switzerland": "SUI",
  "Argentina": "ARG", "Australia": "AUS", "Egypt": "EGY", "Colombia": "COL",
  "Ghana": "GHA", "Cape Verde": "CPV", "Cabo Verde": "CPV",
  "United States": "USA", "USA": "USA",
};

const mudancas = [];
const registrar = (msg) => { mudancas.push(msg); console.log("  •", msg); };

function codigoDoTime(timeApi, codigosValidos) {
  if (!timeApi) return null;
  if (timeApi.tla && codigosValidos.has(timeApi.tla)) return timeApi.tla;
  if (timeApi.name && APELIDOS[timeApi.name]) return APELIDOS[timeApi.name];
  const nome = (timeApi.name || "").toLowerCase();
  for (const [apelido, cod] of Object.entries(APELIDOS)) {
    if (nome.includes(apelido.toLowerCase())) return cod;
  }
  return null;
}

function vencedorDe(partidaApi, cod1, cod2) {
  if (partidaApi.status !== "FINISHED") return null;
  const w = partidaApi.score?.winner;
  if (w === "HOME_TEAM") return cod1;
  if (w === "AWAY_TEAM") return cod2;
  return null; // DRAW não acontece em mata-mata decidido
}

function aplicarResultado(jogo, partidaApi, codCasa, codFora) {
  // Orientação: nosso time1 pode ser o mandante ou o visitante da API
  const invertido = jogo.time1 === codFora || jogo.time2 === codCasa;
  const score = partidaApi.score || {};
  let casa = score.fullTime?.home;
  let fora = score.fullTime?.away;
  const pen = score.penalties;
  const foiPenaltis =
    score.duration === "PENALTY_SHOOTOUT" ||
    score.duration === "PENALTIES" ||
    (pen && pen.home != null && pen.away != null);

  // Jogo decidido nos pênaltis: o tempo normal/prorrogação é sempre EMPATE.
  // A football-data.org às vezes devolve em fullTime o placar da própria
  // disputa (ex.: 4×3 num jogo que foi 0×0) — isso jogava o resultado dos
  // pênaltis para dentro do placar do jogo. Se fullTime não é empate, ele não
  // presta para o placar: preservamos o valor curado à mão e só avisamos.
  // (console.warn e não registrar: um aviso não deve forçar gravação/commit.)
  if (foiPenaltis && casa != null && fora != null && casa !== fora) {
    console.warn(`  ⚠️  ${jogo.id}: jogo por pênaltis, mas a API mandou ${casa}×${fora} ` +
      `no tempo normal — placar do jogo preservado (confira à mão).`);
    casa = fora = null; // não sobrescreve placar1/placar2
  }

  const antes = JSON.stringify([jogo.placar1, jogo.placar2, jogo.vencedor, jogo.penaltis]);

  if (casa != null && fora != null) {
    jogo.placar1 = invertido ? fora : casa;
    jogo.placar2 = invertido ? casa : fora;
  }
  // Uma disputa de pênaltis não termina empatada — valor empatado é lixo da API.
  if (pen && pen.home != null && pen.away != null) {
    if (pen.home === pen.away) {
      console.warn(`  ⚠️  ${jogo.id}: pênaltis ${pen.home}×${pen.away} (empate impossível) — ignorado.`);
    } else {
      jogo.penaltis = invertido ? `${pen.away}x${pen.home}` : `${pen.home}x${pen.away}`;
    }
  }
  const vencedor = vencedorDe(partidaApi, codCasa, codFora);
  if (vencedor) jogo.vencedor = vencedor;

  if (antes !== JSON.stringify([jogo.placar1, jogo.placar2, jogo.vencedor, jogo.penaltis])) {
    const t1 = jogo.time1 || "?", t2 = jogo.time2 || "?";
    registrar(`${jogo.id}: ${t1} ${jogo.placar1 ?? "-"}×${jogo.placar2 ?? "-"} ${t2}` +
      (jogo.penaltis ? ` (pên. ${jogo.penaltis})` : "") +
      (jogo.vencedor ? ` — classificado: ${jogo.vencedor}` : ""));
  }
}

async function principal() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.log("ℹ️  FOOTBALL_DATA_TOKEN não definido — nada foi atualizado.");
    console.log("   Crie um token gratuito em https://www.football-data.org/client/register");
    console.log("   ou edite data/jogos.json manualmente (o site lê direto de lá).");
    return;
  }

  const jogosDoc = JSON.parse(await readFile(ARQ_JOGOS, "utf8"));
  const timesDoc = JSON.parse(await readFile(ARQ_TIMES, "utf8"));
  const codigosValidos = new Set(Object.keys(timesDoc.times));
  const porId = Object.fromEntries(jogosDoc.jogos.map((j) => [j.id, j]));

  console.log("🌐 Consultando football-data.org…");
  const resp = await fetch(API_URL, { headers: { "X-Auth-Token": token } });
  if (!resp.ok) {
    throw new Error(`API respondeu ${resp.status}: ${await resp.text()}`);
  }
  const dados = await resp.json();
  const partidas = dados.matches || [];
  console.log(`   ${partidas.length} partidas recebidas.\n`);

  const eliminar = new Set();
  const classificar = new Set();

  // ---- 1) Fase anterior (32 seleções): resolve vagas "a definir" das oitavas
  const partidasR32 = partidas.filter((p) => FASES_R32.includes(p.stage));
  for (const p of partidasR32) {
    if (p.status !== "FINISHED") continue;
    const codCasa = codigoDoTime(p.homeTeam, codigosValidos);
    const codFora = codigoDoTime(p.awayTeam, codigosValidos);
    if (!codCasa && !codFora) continue; // partida de um lado da chave que não acompanhamos

    for (const jogo of jogosDoc.jogos.filter((j) => j.fase === "oitavas")) {
      for (const n of [1, 2]) {
        const candidatos = jogo["candidatos" + n];
        if (!candidatos || jogo["time" + n]) continue;
        const envolve = (c) => c === codCasa || c === codFora;
        if (!candidatos.some(envolve)) continue;

        const vencedor = vencedorDe(p, codCasa, codFora);
        if (!vencedor || !candidatos.includes(vencedor)) continue;

        jogo["time" + n] = vencedor;
        classificar.add(vencedor);
        candidatos.filter((c) => c !== vencedor).forEach((c) => eliminar.add(c));
        registrar(`${jogo.id}: vaga preenchida por ${vencedor} (${jogo["origem" + n]})`);
      }
    }
  }

  // ---- 2) Propaga vencedores já conhecidos para as fases seguintes
  // (jogo com usa_perdedor — a disputa de 3º lugar — recebe o PERDEDOR)
  const propagar = () => {
    for (const jogo of jogosDoc.jogos) {
      if (!jogo.alimentado_por) continue;
      for (const n of [1, 2]) {
        const alimentador = porId[jogo.alimentado_por[n - 1]];
        if (jogo["time" + n] || !alimentador?.vencedor) continue;
        const avanca = jogo.usa_perdedor
          ? (alimentador.vencedor === alimentador.time1 ? alimentador.time2 : alimentador.time1)
          : alimentador.vencedor;
        if (!avanca) continue;
        jogo["time" + n] = avanca;
        registrar(jogo.usa_perdedor
          ? `${jogo.id}: ${avanca} cai para a disputa de 3º lugar (perdeu ${alimentador.id})`
          : `${jogo.id}: ${avanca} avança de ${alimentador.id}`);
      }
    }
  };
  propagar();

  // ---- 3) Placar e vencedor dos jogos do mata-mata (oitavas → final)
  for (const p of partidas) {
    const fase = FASE_API[p.stage];
    if (!fase) continue;
    const codCasa = codigoDoTime(p.homeTeam, codigosValidos);
    const codFora = codigoDoTime(p.awayTeam, codigosValidos);
    if (!codCasa || !codFora) continue;

    // O nome da fase do 3º lugar varia entre temporadas da API — se ela vier
    // rotulada como FINAL, o par de times desambigua (finalistas × perdedores
    // das semis nunca se repetem) e o filtro de horário (<24h) separa os dias.
    const nossos = jogosDoc.jogos.filter(
      (j) => j.fase === fase || (fase === "final" && j.fase === "terceiro")
    );
    // preferir jogo com o mesmo par de times; senão, o de horário mais próximo
    let jogo = nossos.find(
      (j) =>
        (j.time1 === codCasa && j.time2 === codFora) ||
        (j.time1 === codFora && j.time2 === codCasa)
    );
    if (!jogo) {
      const alvo = new Date(p.utcDate).getTime();
      jogo = nossos
        .filter((j) => !j.time1 || !j.time2)
        .map((j) => ({ j, delta: Math.abs(new Date(j.data).getTime() - alvo) }))
        .filter((x) => x.delta < 24 * 3600 * 1000)
        .sort((a, b) => a.delta - b.delta)[0]?.j;
      if (jogo) {
        if (!jogo.time1) { jogo.time1 = codCasa; registrar(`${jogo.id}: ${codCasa} confirmado`); }
        if (!jogo.time2) { jogo.time2 = codFora; registrar(`${jogo.id}: ${codFora} confirmado`); }
      }
    }
    if (!jogo) continue;

    // Só grava resultado de partida ENCERRADA. Durante o jogo a API devolve o
    // placar PARCIAL dentro de fullTime (com winner ainda null) — sem esta
    // guarda, cada ciclo de 30 min commitava o parcial do momento (1×0, 1×1…)
    // sem vencedor, sujando o site ao vivo. AWARDED cobre W.O./decisão de mesa.
    if (p.status !== "FINISHED" && p.status !== "AWARDED") continue;

    aplicarResultado(jogo, p, codCasa, codFora);
    if (jogo.vencedor) {
      const perdedor = jogo.vencedor === jogo.time1 ? jogo.time2 : jogo.time1;
      if (perdedor) eliminar.add(perdedor);
    }
  }
  propagar();

  // ---- 4) Atualiza status em times.json
  for (const cod of classificar) {
    if (timesDoc.times[cod] && timesDoc.times[cod].status !== "classificado") {
      timesDoc.times[cod].status = "classificado";
      registrar(`times.json: ${cod} → classificado`);
    }
  }
  for (const cod of eliminar) {
    if (timesDoc.times[cod] && timesDoc.times[cod].status !== "eliminado") {
      timesDoc.times[cod].status = "eliminado";
      registrar(`times.json: ${cod} → eliminado`);
    }
  }

  // ---- 5) Grava
  if (!mudancas.length) {
    console.log("✅ Tudo já estava em dia — nenhuma mudança.");
    return;
  }
  if (DRY_RUN) {
    console.log(`\n🔎 --dry-run: ${mudancas.length} mudança(s) detectada(s), nada gravado.`);
    return;
  }
  const agora = new Date().toISOString();
  jogosDoc.atualizado_em = agora;
  timesDoc.atualizado_em = agora;
  await writeFile(ARQ_JOGOS, JSON.stringify(jogosDoc, null, 2) + "\n", "utf8");
  await writeFile(ARQ_TIMES, JSON.stringify(timesDoc, null, 2) + "\n", "utf8");
  console.log(`\n💾 Gravado! ${mudancas.length} mudança(s) em data/jogos.json e data/times.json.`);
}

principal().catch((erro) => {
  console.error("❌ Erro ao atualizar:", erro.message);
  process.exit(1);
});
