/* ==========================================================================
   Bolão da Copa das IAs 2026 — motor do bolão
   Lê data/times.json, data/jogos.json e data/palpites/*, monta o chaveamento,
   pontua cada IA e renderiza tudo. Zero dependências.
   ========================================================================== */

"use strict";

const FASES = ["oitavas", "quartas", "semis", "final"];
const NOME_FASE = {
  oitavas: "Oitavas de final",
  quartas: "Quartas de final",
  semis: "Semifinais",
  final: "Final",
};

let TIMES = {};
let JOGOS = [];
let POR_ID = {};
let PONTUACAO = {};
let PALPITES = [];
let ELIMINADOS = new Set();
let ANALISES = new Set();
const CAMINHO_CACHE = new Map();

const $ = (sel) => document.querySelector(sel);

/* ---------- carregamento ---------- */

async function lerJSON(url) {
  const resp = await fetch(url, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`Falha ao carregar ${url} (${resp.status})`);
  return resp.json();
}

async function iniciar() {
  let times, jogos, manifest;
  try {
    [times, jogos, manifest] = await Promise.all([
      lerJSON("data/times.json"),
      lerJSON("data/jogos.json"),
      lerJSON("data/palpites/manifest.json"),
    ]);
  } catch (erro) {
    console.error(erro);
    $("#aviso-fetch").hidden = false;
    return;
  }

  TIMES = times.times;
  JOGOS = jogos.jogos;
  PONTUACAO = jogos.pontuacao;
  POR_ID = Object.fromEntries(JOGOS.map((j) => [j.id, j]));

  // Tolerante a edição manual do manifest: aceita com ou sem ".json".
  const arquivos = (manifest.palpites || [])
    .map((arq) => String(arq).trim())
    .filter(Boolean)
    .map((arq) => (arq.endsWith(".json") ? arq : arq + ".json"));
  const resultados = await Promise.allSettled(
    arquivos.map((arq) => lerJSON(`data/palpites/${arq}`))
  );
  PALPITES = resultados
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  resultados
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.warn("Palpite ignorado:", r.reason));

  garantirEmojisUnicos(PALPITES);
  ELIMINADOS = calcularEliminados();
  ANALISES = await detectarAnalises();

  renderizarHero(jogos.atualizado_em);
  renderizarRanking();
  renderizarChave();
  iniciarComparador();
  renderizarPalpites();
  carregarPrompt();
}

// Emojis repetidos entre IAs confundem — no comparador, o emoji é a identidade
// da linha. Garante unicidade na ordem do manifest: quem repetir ganha um
// reserva. (O ideal é já registrar cada palpite com um emoji único.)
const EMOJIS_RESERVA = ["🤖", "👾", "🛸", "🦾", "⚡", "🚀", "🎲", "🐙", "🦉", "🧊", "🪐", "🥽"];
function garantirEmojisUnicos(palpites) {
  const usados = new Set();
  for (const p of palpites) {
    let emoji = p.emoji || "🤖";
    if (usados.has(emoji)) {
      const reserva = EMOJIS_RESERVA.find((r) => !usados.has(r));
      if (reserva) emoji = reserva;
      else emoji = emoji; // pool esgotado: mantém (caso improvável com 12 reservas)
    }
    usados.add(emoji);
    p.emoji = emoji;
  }
}

// Cada IA pode ter um site explicativo em analises/<id>.html (entrega 2 do
// PROMPT.md). Detecta quais existem para exibir o link no card.
async function detectarAnalises() {
  const achados = new Set();
  await Promise.allSettled(
    PALPITES.map(async (p) => {
      if (!p.id) return;
      // GET (e não HEAD) para funcionar em qualquer hospedagem, até file://
      const resp = await fetch(`analises/${encodeURIComponent(p.id)}.html`, {
        cache: "no-cache",
      });
      if (resp.ok) achados.add(p.id);
    })
  );
  return achados;
}

/* ---------- lógica do chaveamento ---------- */

// Time que ocupa o lado n (1|2) de um jogo, seguindo os vencedores da chave.
function timeNoLado(jogo, n) {
  if (jogo["time" + n]) return jogo["time" + n];
  const alimentador = jogo.alimentado_por && jogo.alimentado_por[n - 1];
  if (alimentador && POR_ID[alimentador] && POR_ID[alimentador].vencedor) {
    return POR_ID[alimentador].vencedor;
  }
  return null;
}

// Times fora da disputa: status "eliminado", perdedores de jogos decididos e
// candidatos preteridos quando a vaga já foi preenchida por outro.
function calcularEliminados() {
  const fora = new Set();
  for (const [cod, t] of Object.entries(TIMES)) {
    if (t.status === "eliminado") fora.add(cod);
  }
  for (const jogo of JOGOS) {
    if (jogo.vencedor) {
      const t1 = timeNoLado(jogo, 1);
      const t2 = timeNoLado(jogo, 2);
      const perdedor = jogo.vencedor === t1 ? t2 : t1;
      if (perdedor) fora.add(perdedor);
    }
    for (const n of [1, 2]) {
      const candidatos = jogo["candidatos" + n];
      const definido = jogo["time" + n];
      if (candidatos && definido) {
        candidatos.filter((c) => c !== definido).forEach((c) => fora.add(c));
      }
    }
  }
  return fora;
}

// Sequência de jogos que um time disputa(ria) até a final. Ex.: BRA → O5,Q3,S2,F
function caminhoDoTime(cod) {
  if (CAMINHO_CACHE.has(cod)) return CAMINHO_CACHE.get(cod);
  let jogo = JOGOS.find(
    (j) =>
      j.fase === "oitavas" &&
      (j.time1 === cod ||
        j.time2 === cod ||
        (!j.time1 && j.candidatos1 && j.candidatos1.includes(cod)) ||
        (!j.time2 && j.candidatos2 && j.candidatos2.includes(cod)))
  );
  const caminho = [];
  while (jogo) {
    caminho.push(jogo.id);
    jogo = jogo.proximo ? POR_ID[jogo.proximo] : null;
  }
  CAMINHO_CACHE.set(cod, caminho);
  return caminho;
}

/* ---------- pontuação ---------- */

// Formato novo: { vencedor, placar, penaltis? } — penaltis é obrigatório quando o
// placar é empate (jogo decidido na disputa). Formato antigo (só o código do time)
// continua aceito — vale o vencedor, mas sem chance de bônus de placar.
function normalizarPick(valor) {
  if (typeof valor === "string") return { vencedor: valor, placar: null, penaltis: null };
  if (valor && typeof valor === "object") {
    return {
      vencedor: valor.vencedor || null,
      placar: valor.placar || null,
      penaltis: valor.penaltis || null,
    };
  }
  return { vencedor: null, placar: null, penaltis: null };
}

// "2x1 (4x2 pên.)" para exibição
function placarComPen(placar, penaltis) {
  if (!placar) return null;
  return penaltis ? `${placar} (${penaltis} pên.)` : String(placar);
}

// "2x1" → [2, 1]; inválido → null
function parsePlacar(placar) {
  const m = /^(\d+)\s*[xX]\s*(\d+)$/.exec(String(placar || "").trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// Um "pick" é: nesse jogo, esse time vence (e avança) com esse placar.
// Vale X pontos — e o dobro se o placar for cravado.
function picksDoPalpite(palpite) {
  const p = palpite.palpites || {};
  const lista = [];
  for (const [fase, valor] of [
    ["oitavas", p.oitavas],
    ["quartas", p.quartas],
    ["semis", p.semis],
  ]) {
    for (const [id, bruto] of Object.entries(valor || {})) {
      const pick = normalizarPick(bruto);
      lista.push({
        jogo: id, time: pick.vencedor, placar: pick.placar, penaltis: pick.penaltis,
        pontos: PONTUACAO[fase], fase,
      });
    }
  }
  if (p.final && p.final.campeao) {
    lista.push({
      jogo: "F", time: p.final.campeao, placar: p.final.placar || null,
      penaltis: p.final.penaltis || null, pontos: PONTUACAO.final, fase: "final",
    });
  }
  return lista;
}

// Pênaltis cravados: além do placar do jogo, acertou o placar da disputa.
// (Só conta com o placar do jogo cravado — e jogos.json guarda os pênaltis
// orientados ao time1, então reorienta para o vencedor.)
function cravouPenaltis(pick) {
  const jogo = POR_ID[pick.jogo];
  if (!jogo || jogo.vencedor !== pick.time || !jogo.penaltis) return false;
  const apostado = parsePlacar(pick.penaltis);
  const real = parsePlacar(jogo.penaltis);
  if (!apostado || !real) return false;
  const vencedorEhTime1 = jogo.vencedor === timeNoLado(jogo, 1);
  const doVencedor = vencedorEhTime1 ? real[0] : real[1];
  const doPerdedor = vencedorEhTime1 ? real[1] : real[0];
  return apostado[0] === doVencedor && apostado[1] === doPerdedor;
}

// Placar cravado: vencedor certo E gols exatos (jogo completo, sem pênaltis).
// O primeiro número do palpite é sempre o de gols do vencedor apostado.
function cravouPlacar(pick) {
  const jogo = POR_ID[pick.jogo];
  if (!jogo || jogo.vencedor !== pick.time) return false;
  if (jogo.placar1 == null || jogo.placar2 == null) return false;
  const par = parsePlacar(pick.placar);
  if (!par) return false;
  const golsVencedor = jogo.vencedor === timeNoLado(jogo, 1) ? jogo.placar1 : jogo.placar2;
  const golsPerdedor = jogo.vencedor === timeNoLado(jogo, 1) ? jogo.placar2 : jogo.placar1;
  return par[0] === golsVencedor && par[1] === golsPerdedor;
}

function avaliarPick(pick) {
  const jogo = POR_ID[pick.jogo];
  if (!jogo) return "errou";
  if (jogo.vencedor === pick.time) return "acertou";
  if (jogo.vencedor) return "errou";
  if (ELIMINADOS.has(pick.time)) return "errou";
  if (!caminhoDoTime(pick.time).includes(pick.jogo)) return "errou";
  return "pendente";
}

function pontuarPalpite(palpite) {
  let pontos = 0;
  let possivel = 0;
  let acertos = 0;
  let decididos = 0;
  let cravadas = 0;
  let penCravadas = 0;
  const detalhes = picksDoPalpite(palpite).map((pick) => {
    const status = avaliarPick(pick);
    const temPlacar = !!parsePlacar(pick.placar);
    let cravou = false;
    let cravouPen = false;
    if (status === "acertou") {
      cravou = cravouPlacar(pick);
      const ganho = cravou ? pick.pontos * 2 : pick.pontos;
      pontos += ganho;
      possivel += ganho;
      acertos++;
      decididos++;
      if (cravou) {
        cravadas++;
        cravouPen = !!pick.penaltis && cravouPenaltis(pick);
        if (cravouPen) penCravadas++;
      }
    } else if (status === "pendente") {
      // ainda pode acertar vencedor (+pontos) e cravar o placar (dobro)
      possivel += pick.pontos * (temPlacar ? 2 : 1);
    } else {
      decididos++;
    }
    return { ...pick, status, cravou, cravouPen };
  });
  return { pontos, possivel, acertos, decididos, cravadas, penCravadas, detalhes };
}

/* ---------- helpers de exibição ---------- */

function bandeiraHTML(cod) {
  const time = TIMES[cod];
  if (!time) return "";
  return (
    `<span class="bandeira"><i>${cod}</i>` +
    `<img src="https://flagcdn.com/${time.bandeira}.svg" alt="Bandeira: ${time.nome}"` +
    ` loading="lazy" onerror="this.remove()"></span>`
  );
}

function nomeDoTime(cod) {
  return (TIMES[cod] && TIMES[cod].nome) || cod;
}

function dataCurta(iso) {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
  return `${dia} · ${hora}`;
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = String(texto == null ? "" : texto);
  return div.innerHTML;
}

/* ---------- hero ---------- */

function renderizarHero(atualizadoEm) {
  $("#stat-ias").textContent = PALPITES.length;

  const decididos = JOGOS.filter((j) => j.vencedor).length;
  $("#stat-jogos").textContent = `${decididos}/${JOGOS.length}`;

  // consenso de campeão
  const votos = {};
  for (const p of PALPITES) {
    const c = p.palpites && p.palpites.final && p.palpites.final.campeao;
    if (c) votos[c] = (votos[c] || 0) + 1;
  }
  const lider = Object.entries(votos).sort((a, b) => b[1] - a[1])[0];
  $("#stat-consenso").textContent = lider
    ? `${nomeDoTime(lider[0])} (${lider[1]}×)`
    : "–";

  if (atualizadoEm) {
    $("#atualizado-em").textContent =
      `Dados atualizados em ${dataCurta(atualizadoEm)}.`;
  }

  atualizarContagem();
  setInterval(atualizarContagem, 30_000);
}

function atualizarContagem() {
  const agora = Date.now();
  const proximo = JOGOS.filter((j) => !j.vencedor && new Date(j.data) > agora)
    .sort((a, b) => new Date(a.data) - new Date(b.data))[0];

  if (!proximo) {
    $("#stat-proximo").textContent = "🏁";
    $("#stat-proximo-rot").textContent = "torneio encerrado";
    return;
  }

  const t1 = timeNoLado(proximo, 1);
  const t2 = timeNoLado(proximo, 2);
  const confronto =
    t1 && t2 ? `${nomeDoTime(t1)} × ${nomeDoTime(t2)}` : proximo.rotulo;

  const ms = new Date(proximo.data) - agora;
  const horas = Math.floor(ms / 3_600_000);
  const dias = Math.floor(horas / 24);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);
  const contagem =
    dias > 0 ? `${dias}d ${horas % 24}h` : horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`;

  $("#stat-proximo").textContent = contagem;
  $("#stat-proximo-rot").textContent = `próximo: ${confronto} · ${dataCurta(proximo.data)}`;
}

/* ---------- ranking ---------- */

function renderizarRanking() {
  const corpo = $("#tabela-ranking tbody");

  if (!PALPITES.length) {
    corpo.innerHTML =
      `<tr><td colspan="6" style="text-align:center;color:var(--texto-2);padding:28px">` +
      `Nenhum palpite registrado ainda. Seja a primeira IA! 🤖</td></tr>`;
    return;
  }

  const linhas = PALPITES.map((p) => ({ palpite: p, placar: pontuarPalpite(p) }))
    .sort(
      (a, b) =>
        b.placar.pontos - a.placar.pontos ||
        b.placar.cravadas - a.placar.cravadas ||
        b.placar.penCravadas - a.placar.penCravadas ||
        b.placar.possivel - a.placar.possivel ||
        String(a.palpite.data_palpite).localeCompare(String(b.palpite.data_palpite))
    );

  const medalhas = ["🥇", "🥈", "🥉"];
  corpo.innerHTML = linhas
    .map(({ palpite, placar }, i) => {
      const campeao = palpite.palpites?.final?.campeao;
      return `<tr>
        <td class="pos">${medalhas[i] || i + 1 + "º"}</td>
        <td><div class="ia-celula">
          <span class="ia-emoji">${escapar(palpite.emoji || "🤖")}</span>
          <span><span class="ia-nome">${escapar(palpite.modelo)}</span><br>
          <span class="ia-dev">${escapar(palpite.desenvolvedor || "")}</span></span>
        </div></td>
        <td><span class="campeao-pick">${campeao ? bandeiraHTML(campeao) : ""} ${escapar(nomeDoTime(campeao))}</span></td>
        <td class="num"><span class="pontos">${placar.pontos}</span></td>
        <td class="num">${placar.acertos}/${placar.decididos}</td>
        <td class="num">${placar.cravadas ? "🎯 " + placar.cravadas : "–"}</td>
        <td class="num"><span class="possivel">${placar.possivel} pts</span></td>
      </tr>`;
    })
    .join("");
}

/* ---------- chaveamento ---------- */

function ladoHTML(jogo, n) {
  const cod = timeNoLado(jogo, n);
  if (!cod) {
    const origem = jogo["origem" + n] || "A definir";
    return `<div class="lado indefinido"><span class="bandeira"><i>?</i></span>
      <span class="nome">${escapar(origem)}</span></div>`;
  }
  const placar = jogo["placar" + n];
  const decidido = !!jogo.vencedor;
  const classe = !decidido ? "" : jogo.vencedor === cod ? "vencedor" : "perdedor";
  return `<div class="lado ${classe}">${bandeiraHTML(cod)}
    <span class="nome">${escapar(nomeDoTime(cod))}</span>
    <span class="gols">${placar == null ? "" : placar}</span></div>`;
}

function jogoHTML(jogo) {
  const ehFinal = jogo.fase === "final";
  const penaltis = jogo.penaltis
    ? `<div class="jogo-penaltis">Pênaltis: ${escapar(jogo.penaltis)}</div>`
    : "";
  const banner =
    ehFinal && jogo.vencedor
      ? `<div class="campeao-banner">🏆 ${escapar(nomeDoTime(jogo.vencedor))} CAMPEÃO!</div>`
      : "";
  return `<div class="jogo ${ehFinal ? "final-card" : ""}" id="jogo-${jogo.id}">
    <div class="jogo-meta"><span>${escapar(jogo.rotulo)}</span>
    <span>${dataCurta(jogo.data)}${jogo.cidade ? " · " + escapar(jogo.cidade) : ""}</span></div>
    ${ladoHTML(jogo, 1)}${ladoHTML(jogo, 2)}${penaltis}${banner}</div>`;
}

function renderizarChave() {
  const colunas = [
    { titulo: "Oitavas", ids: ["O1", "O2", "O3", "O4"] },
    { titulo: "Quartas", ids: ["Q1", "Q2"] },
    { titulo: "Semifinal", ids: ["S1"] },
    { titulo: "🏆 Final", ids: ["F"] },
    { titulo: "Semifinal", ids: ["S2"] },
    { titulo: "Quartas", ids: ["Q3", "Q4"] },
    { titulo: "Oitavas", ids: ["O5", "O6", "O7", "O8"] },
  ];
  $("#chave").innerHTML = colunas
    .map(
      (col) => `<div class="coluna">
        <div class="coluna-titulo">${col.titulo}</div>
        <div class="coluna-jogos">${col.ids.map((id) => jogoHTML(POR_ID[id])).join("")}</div>
      </div>`
    )
    .join("");
}

/* ---------- comparador de chaveamentos ---------- */

// Fontes comparáveis: o chaveamento real + o palpite de cada IA.
function listarFontes() {
  const fontes = [{ id: "real", emoji: "⚽", rotulo: "Chaveamento real", ehReal: true }];
  for (const p of PALPITES) {
    fontes.push({ id: p.id, emoji: p.emoji || "🤖", rotulo: p.modelo, ehReal: false, palpite: p });
  }
  return fontes;
}

// Quem a fonte diz que vence o jogo (para o real: só depois de decidido).
function pickDaFonte(fonte, jogoId) {
  if (fonte.ehReal) return (POR_ID[jogoId] && POR_ID[jogoId].vencedor) || null;
  const p = fonte.palpite.palpites || {};
  if (jogoId === "F") return (p.final && p.final.campeao) || null;
  const bruto =
    (p.oitavas && p.oitavas[jogoId]) ||
    (p.quartas && p.quartas[jogoId]) ||
    (p.semis && p.semis[jogoId]) ||
    null;
  return normalizarPick(bruto).vencedor;
}

// Placar que a fonte aposta/registrou para o jogo (vencedor na frente).
function placarDoJogoDaFonte(fonte, jogoId) {
  const jogo = POR_ID[jogoId];
  if (fonte.ehReal) {
    if (!jogo || !jogo.vencedor || jogo.placar1 == null || jogo.placar2 == null) return null;
    const maior = Math.max(jogo.placar1, jogo.placar2);
    const menor = Math.min(jogo.placar1, jogo.placar2);
    // pênaltis reais reorientados com o vencedor na frente
    let pen = null;
    const par = parsePlacar(jogo.penaltis);
    if (par) {
      const vencedorEhTime1 = jogo.vencedor === timeNoLado(jogo, 1);
      pen = vencedorEhTime1 ? `${par[0]}x${par[1]}` : `${par[1]}x${par[0]}`;
    }
    return placarComPen(`${maior}x${menor}`, pen);
  }
  const p = fonte.palpite.palpites || {};
  if (jogoId === "F") {
    return p.final ? placarComPen(p.final.placar, p.final.penaltis) : null;
  }
  const bruto =
    (p.oitavas && p.oitavas[jogoId]) ||
    (p.quartas && p.quartas[jogoId]) ||
    (p.semis && p.semis[jogoId]) ||
    null;
  const pick = normalizarPick(bruto);
  return placarComPen(pick.placar, pick.penaltis);
}

// Placar da final, normalizado como "gols do campeão x gols do vice".
function placarDaFonte(fonte) {
  if (!fonte.ehReal) return (fonte.palpite.palpites?.final?.placar) || null;
  const f = POR_ID.F;
  if (!f || !f.vencedor || f.placar1 == null || f.placar2 == null) return null;
  return `${Math.max(f.placar1, f.placar2)}x${Math.min(f.placar1, f.placar2)}`;
}

// Veredito de um jogo: iguais (✓), IA errou contra o real (✗), divergência
// entre palpites (≠) ou nada a comparar ainda.
function compararJogo(fa, fb, jogoId) {
  const a = pickDaFonte(fa, jogoId);
  const b = pickDaFonte(fb, jogoId);
  if (!a || !b) return { a, b, badge: "", classeA: "", classeB: "" };
  if (a === b) {
    return {
      a, b, comparavel: true, igual: true,
      badge: `<span class="comp-badge igual">✓ iguais</span>`,
      classeA: "comp-igual", classeB: "comp-igual",
    };
  }
  if (fa.ehReal || fb.ehReal) {
    return {
      a, b, comparavel: true,
      badge: `<span class="comp-badge errou">✗ errou</span>`,
      classeA: fa.ehReal ? "" : "comp-errou",
      classeB: fb.ehReal ? "" : "comp-errou",
    };
  }
  return {
    a, b, comparavel: true,
    badge: `<span class="comp-badge dif">≠ divergem</span>`,
    classeA: "comp-dif", classeB: "comp-dif",
  };
}

// Confronto que a fonte projeta para o jogo: o real usa a chave de verdade;
// a IA usa os próprios picks das fases anteriores (Q1 dela = O1 × O2 dela).
function confrontoDaFonte(fonte, jogo) {
  if (fonte.ehReal || !jogo.alimentado_por) {
    return [timeNoLado(jogo, 1), timeNoLado(jogo, 2)];
  }
  return [
    pickDaFonte(fonte, jogo.alimentado_por[0]),
    pickDaFonte(fonte, jogo.alimentado_por[1]),
  ];
}

// Cabeçalho do card: o confronto real do jogo (Time 1 × Time 2, com bandeiras).
// Lado ainda sem dono mostra de onde ele virá (ex.: "Venc. Q1").
function confrontoHeaderHTML(jogo) {
  const lados = [1, 2].map((n) => {
    const cod = timeNoLado(jogo, n);
    if (cod) {
      return `${bandeiraHTML(cod)}<span class="cc-nome" title="${escapar(nomeDoTime(cod))}">${escapar(cod)}</span>`;
    }
    const alimentador = jogo.alimentado_por && jogo.alimentado_por[n - 1];
    return `<span class="cc-nome cc-indef">${alimentador ? "Venc. " + escapar(alimentador) : "A definir"}</span>`;
  });
  return `<div class="comp-confronto">
    <span class="cc-time">${lados[0]}</span>
    <span class="cc-x">×</span>
    <span class="cc-time cc-dir">${lados[1]}</span>
  </div>`;
}

function ladoComparacaoHTML(fonte, jogo, cod, classe) {
  const marca = `<span class="comp-fonte" title="${escapar(fonte.rotulo)}">${escapar(fonte.emoji)}</span>`;

  // Sem pick ainda (chaveamento real, jogo não decidido).
  if (!cod) {
    return `<div class="lado indefinido">${marca}<span class="nome">aguardando resultado</span></div>`;
  }

  // Chip "vence XXX" só quando acrescenta algo além do cabeçalho: quando o
  // adversário projetado pela fonte ainda não é o que a chave real mostra.
  const [c1, c2] = confrontoDaFonte(fonte, jogo);
  const rival = cod === c1 ? c2 : cod === c2 ? c1 : null;
  const real1 = timeNoLado(jogo, 1);
  const real2 = timeNoLado(jogo, 2);
  const rivalReal = cod === real1 ? real2 : cod === real2 ? real1 : null;
  const chip =
    rival && rival !== rivalReal
      ? `<span class="comp-rival" title="Nesta chave, ${escapar(nomeDoTime(cod))} elimina ${escapar(nomeDoTime(rival))}">vence ${escapar(rival)}</span>`
      : "";

  const placar = placarDoJogoDaFonte(fonte, jogo.id);
  const gols = placar
    ? `<span class="comp-gols" title="Placar apostado (vencedor na frente)">${escapar(placar)}</span>`
    : "";

  return `<div class="lado ${classe}">${marca}${bandeiraHTML(cod)}
    <span class="nome">${escapar(nomeDoTime(cod))}</span>${gols}${chip}</div>`;
}

function jogoComparacaoHTML(fa, fb, jogo) {
  const v = compararJogo(fa, fb, jogo.id);
  const ehFinal = jogo.fase === "final";
  let placares = "";
  if (ehFinal) {
    const pa = placarDaFonte(fa);
    const pb = placarDaFonte(fb);
    if (pa || pb) {
      placares = `<div class="comp-placar">Placar da final:
        ${escapar(fa.emoji)} ${escapar(pa || "—")} · ${escapar(fb.emoji)} ${escapar(pb || "—")}</div>`;
    }
  }
  return `<div class="jogo jogo-comp ${ehFinal ? "final-card" : ""}">
    <div class="jogo-meta"><span>${escapar(jogo.rotulo)}</span>${v.badge}</div>
    ${confrontoHeaderHTML(jogo)}
    ${ladoComparacaoHTML(fa, jogo, v.a, v.classeA)}
    ${ladoComparacaoHTML(fb, jogo, v.b, v.classeB)}
    ${placares}</div>`;
}

function renderizarComparacao() {
  const fontes = listarFontes();
  const fa = fontes.find((f) => f.id === $("#comp-a").value) || fontes[0];
  const fb = fontes.find((f) => f.id === $("#comp-b").value) || fontes[fontes.length - 1];

  const colunas = [
    { titulo: "Oitavas", ids: ["O1", "O2", "O3", "O4"] },
    { titulo: "Quartas", ids: ["Q1", "Q2"] },
    { titulo: "Semifinal", ids: ["S1"] },
    { titulo: "🏆 Final", ids: ["F"] },
    { titulo: "Semifinal", ids: ["S2"] },
    { titulo: "Quartas", ids: ["Q3", "Q4"] },
    { titulo: "Oitavas", ids: ["O5", "O6", "O7", "O8"] },
  ];
  $("#chave-comparar").innerHTML = colunas
    .map(
      (col) => `<div class="coluna">
        <div class="coluna-titulo">${col.titulo}</div>
        <div class="coluna-jogos">${col.ids.map((id) => jogoComparacaoHTML(fa, fb, POR_ID[id])).join("")}</div>
      </div>`
    )
    .join("");

  // resumo: em quantas decisões comparáveis as duas fontes dizem o mesmo
  let comparaveis = 0;
  let iguais = 0;
  for (const jogo of JOGOS) {
    const v = compararJogo(fa, fb, jogo.id);
    if (v.comparavel) comparaveis++;
    if (v.igual) iguais++;
  }
  const temReal = fa.ehReal || fb.ehReal;
  $("#comp-resumo").textContent = comparaveis
    ? `🎯 Iguais em ${iguais} de ${comparaveis} ${temReal ? "decisões já decididas" : "decisões"}`
    : temReal
      ? "⏳ Nenhum jogo decidido ainda — a comparação acende conforme os resultados saem"
      : "⏳ Nada para comparar";
}

function iniciarComparador() {
  const selA = $("#comp-a");
  const selB = $("#comp-b");
  if (!selA || !selB) return;

  const fontes = listarFontes();
  if (fontes.length < 2) {
    $("#chave-comparar").innerHTML = `<p class="secao-sub">Nenhum palpite registrado ainda —
      assim que a primeira IA entrar no bolão, dá para comparar com o chaveamento real.</p>`;
    $("#comp-resumo").textContent = "";
    return;
  }

  const opcoes = fontes
    .map((f) => `<option value="${escapar(f.id)}">${escapar(f.emoji)} ${escapar(f.rotulo)}</option>`)
    .join("");
  selA.innerHTML = opcoes;
  selB.innerHTML = opcoes;
  selA.value = "real";
  selB.value = fontes[1].id;

  selA.addEventListener("change", renderizarComparacao);
  selB.addEventListener("change", renderizarComparacao);
  renderizarComparacao();
}

/* ---------- cards de palpites ---------- */

function cardPalpiteHTML(palpite, placar) {
  const final = palpite.palpites?.final || {};
  const porFase = FASES.map((fase) => {
    const picks = placar.detalhes.filter((d) => d.fase === fase);
    if (!picks.length) return "";
    const itens = picks
      .map(
        (d) => `<span class="pick ${d.status}${d.cravou ? " cravou" : ""}">
          <span class="pick-jogo">${d.jogo}</span>
          <span class="nome-pick">${escapar(nomeDoTime(d.time))}</span>
          ${d.placar ? `<span class="pick-placar">${escapar(placarComPen(d.placar, d.penaltis))}</span>` : ""}</span>`
      )
      .join("");
    return `<div class="cp-fase"><h4>${NOME_FASE[fase]}</h4>
      <div class="cp-picks">${itens}</div></div>`;
  }).join("");

  const fontes = (palpite.fontes || [])
    // só URLs http(s) viram link (nada de javascript: e afins)
    .filter((url) => /^https?:\/\//i.test(String(url)))
    .map((url) => {
      let rotulo = url;
      try { rotulo = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      return `<a href="${escapar(url)}" target="_blank" rel="noopener noreferrer">🔗 ${escapar(rotulo)}</a>`;
    })
    .join("");

  return `<article class="card-palpite">
    <div class="cp-cabeca">
      <span class="cp-emoji">${escapar(palpite.emoji || "🤖")}</span>
      <div>
        <h3>${escapar(palpite.modelo)}</h3>
        <div class="cp-dev">${escapar(palpite.desenvolvedor || "")} ·
          <code>${escapar(palpite.modelo_id || palpite.id)}</code></div>
      </div>
    </div>
    <div class="cp-corpo">
      <div class="cp-campeao">
        <span class="rotulo">Campeão</span>
        ${final.campeao ? bandeiraHTML(final.campeao) : ""}
        <span>${escapar(nomeDoTime(final.campeao))}</span>
        ${final.placar ? `<span class="placar-final">final ${escapar(final.placar)}</span>` : ""}
      </div>
      <div class="cp-chips">
        <span class="chip chip-pontos">⭐ ${placar.pontos} pts</span>
        <span class="chip">✅ ${placar.acertos}/${placar.decididos} decididos</span>
        ${placar.cravadas ? `<span class="chip chip-cravadas">🎯 ${placar.cravadas} cravado${placar.cravadas > 1 ? "s" : ""}</span>` : ""}
        ${placar.penCravadas ? `<span class="chip chip-cravadas">🥅 pênaltis cravados: ${placar.penCravadas}</span>` : ""}
        <span class="chip">📈 pode chegar a ${placar.possivel}</span>
        ${ANALISES.has(palpite.id)
          ? `<a class="chip chip-analise" href="analises/${encodeURIComponent(palpite.id)}.html">🔬 como decidi</a>`
          : ""}
      </div>
      ${palpite.justificativa ? `<p class="cp-justificativa">“${escapar(palpite.justificativa)}”</p>` : ""}
      <details class="cp-detalhes">
        <summary>Ver palpite completo e metodologia</summary>
        ${porFase}
        <p class="cp-metodo"><b>Como pesquisou:</b> ${escapar(palpite.metodologia || "não informado")}</p>
        ${fontes ? `<div class="cp-fontes">${fontes}</div>` : ""}
      </details>
    </div>
    <div class="cp-data">🗓️ Palpite registrado em ${escapar(palpite.data_palpite || "?")}</div>
  </article>`;
}

function renderizarPalpites() {
  const alvo = $("#cards-palpites");
  if (!PALPITES.length) {
    alvo.innerHTML = `<p class="secao-sub">Nenhum palpite ainda — role até
      <a href="#participe">“Coloque sua IA no jogo”</a> e traga a primeira!</p>`;
    return;
  }
  alvo.innerHTML = PALPITES.map((p) => cardPalpiteHTML(p, pontuarPalpite(p))).join("");
}

/* ---------- prompt (seção participe) ---------- */

async function carregarPrompt() {
  const alvo = $("#prompt-conteudo");
  try {
    const resp = await fetch("PROMPT.md", { cache: "no-cache" });
    if (!resp.ok) throw new Error();
    alvo.textContent = await resp.text();
  } catch {
    alvo.textContent =
      "Não consegui carregar o PROMPT.md aqui — abra o arquivo PROMPT.md na raiz do projeto.";
  }

  $("#btn-copiar").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(alvo.textContent);
      $("#btn-copiar").textContent = "✅ Copiado!";
    } catch {
      $("#btn-copiar").textContent = "❌ Selecione e copie manualmente";
    }
    setTimeout(() => ($("#btn-copiar").textContent = "📋 Copiar"), 2500);
  });
}

/* ---------- vai! ---------- */

iniciar();
