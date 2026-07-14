/* ==========================================================================
   Bolão da Copa das IAs 2026 — motor do bolão
   Lê data/times.json, data/jogos.json e data/palpites/*, monta o chaveamento,
   pontua cada IA e renderiza tudo. Zero dependências.
   ========================================================================== */

"use strict";

const FASES = ["oitavas", "quartas", "semis", "terceiro", "final"];
const NOME_FASE = {
  oitavas: "Oitavas de final",
  quartas: "Quartas de final",
  semis: "Semifinais",
  terceiro: "Disputa de 3º lugar",
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
  iniciarPopoverPalpites();
  iniciarPopoverPontos();
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
// Jogo com usa_perdedor (disputa de 3º lugar) recebe o PERDEDOR do alimentador.
function timeNoLado(jogo, n) {
  if (jogo["time" + n]) return jogo["time" + n];
  const alimentador =
    jogo.alimentado_por && POR_ID[jogo.alimentado_por[n - 1]];
  if (alimentador && alimentador.vencedor) {
    if (!jogo.usa_perdedor) return alimentador.vencedor;
    return (
      (alimentador.vencedor === alimentador.time1
        ? alimentador.time2
        : alimentador.time1) || null
    );
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
    ["terceiro", p.terceiro],
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
  if (jogo.usa_perdedor) {
    return aindaDisputaTerceiro(pick.time, jogo) ? "pendente" : "errou";
  }
  if (ELIMINADOS.has(pick.time)) return "errou";
  if (!caminhoDoTime(pick.time).includes(pick.jogo)) return "errou";
  return "pendente";
}

// A disputa de 3º lugar foge da régua da chave: quem chega nela é quem PERDE
// uma semi — "eliminado" não mata o pick e o caminho do time não passa por ela.
// O pick segue vivo enquanto o time puder perder uma semi (ou já a perdeu).
function aindaDisputaTerceiro(cod, jogo) {
  for (const idAlim of jogo.alimentado_por || []) {
    const semi = POR_ID[idAlim];
    if (!semi) continue;
    if (semi.vencedor) {
      const perdedor =
        semi.vencedor === semi.time1 ? semi.time2 : semi.time1;
      if (perdedor === cod) return true;
    } else {
      if (timeNoLado(semi, 1) === cod || timeNoLado(semi, 2) === cod) return true;
      if (!ELIMINADOS.has(cod) && caminhoDoTime(cod).includes(semi.id)) return true;
    }
  }
  return false;
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
        <td class="num celula-pontos" data-pontos-ia="${escapar(palpite.id)}"
          title="Extrato de pontos de ${escapar(palpite.modelo)} — jogo a jogo, com a conta"><span class="pontos">${placar.pontos}</span></td>
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

// Rodapé dos cards de jogo: data/hora (e cidade, quando definida) da partida.
function dataJogoHTML(jogo) {
  return `<div class="jogo-data">📅 ${dataCurta(jogo.data)}${jogo.cidade ? " · " + escapar(jogo.cidade) : ""}</div>`;
}

function jogoHTML(jogo) {
  const ehFinal = jogo.fase === "final";
  const penaltis = jogo.penaltis
    ? `<div class="jogo-penaltis">Pênaltis: ${escapar(jogo.penaltis)}</div>`
    : "";
  const banner =
    ehFinal && jogo.vencedor
      ? `<div class="campeao-banner">🏆 ${escapar(nomeDoTime(jogo.vencedor))} CAMPEÃO!</div>`
      : jogo.fase === "terceiro" && jogo.vencedor
        ? `<div class="campeao-banner">🥉 ${escapar(nomeDoTime(jogo.vencedor))} fica com o bronze!</div>`
        : "";
  return `<div class="jogo ${ehFinal ? "final-card" : ""}" id="jogo-${jogo.id}" data-jogo="${jogo.id}">
    <div class="jogo-meta"><span>${escapar(jogo.rotulo)}</span>
    <span class="jogo-palpites-dica">🤖 palpites</span></div>
    ${ladoHTML(jogo, 1)}${ladoHTML(jogo, 2)}${penaltis}${banner}${dataJogoHTML(jogo)}</div>`;
}

function renderizarChave() {
  const colunas = [
    { titulo: "Oitavas", ids: ["O1", "O2", "O3", "O4"] },
    { titulo: "Quartas", ids: ["Q1", "Q2"] },
    { titulo: "Semifinal", ids: ["S1"] },
    { titulo: "🏆 Final", ids: ["F", "T"] },
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

// Pick completo { vencedor, placar, penaltis } que uma fonte-IA registrou para
// o jogo (a final vira pick também: campeão + placar apostado).
function pickCompletoDaFonte(fonte, jogoId) {
  const p = fonte.palpite.palpites || {};
  if (jogoId === "F") {
    return normalizarPick(
      p.final
        ? { vencedor: p.final.campeao, placar: p.final.placar, penaltis: p.final.penaltis }
        : null
    );
  }
  const bruto =
    (p.oitavas && p.oitavas[jogoId]) ||
    (p.quartas && p.quartas[jogoId]) ||
    (p.semis && p.semis[jogoId]) ||
    (p.terceiro && p.terceiro[jogoId]) ||
    null;
  return normalizarPick(bruto);
}

// Quem a fonte diz que vence o jogo (para o real: só depois de decidido).
function pickDaFonte(fonte, jogoId) {
  if (fonte.ehReal) return (POR_ID[jogoId] && POR_ID[jogoId].vencedor) || null;
  return pickCompletoDaFonte(fonte, jogoId).vencedor;
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
  const pick = pickCompletoDaFonte(fonte, jogoId);
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
  return jogo.alimentado_por.map((idAlim) => {
    const vencedor = pickDaFonte(fonte, idAlim);
    if (!jogo.usa_perdedor) return vencedor;
    // disputa de 3º: o lado projetado é quem a fonte põe na semi e NÃO avança
    const [c1, c2] = confrontoDaFonte(fonte, POR_ID[idAlim]);
    return vencedor === c1 ? c2 : vencedor === c2 ? c1 : null;
  });
}

// Cabeçalho do card: o confronto do jogo (Time 1 × Time 2, com bandeiras).
// Lado ainda sem dono mostra de onde ele virá (ex.: "Venc. Q1"). Com comPlacar,
// o miolo traz o PLACAR REAL do jogo já decidido (ex.: 0 × 0) com o vencedor
// destacado e os pênaltis embaixo — é o resultado de referência do comparador.
function confrontoHeaderHTML(jogo, comPlacar = false) {
  const decidido =
    comPlacar && jogo.vencedor && jogo.placar1 != null && jogo.placar2 != null;

  const ladoHTML = (n) => {
    const cod = timeNoLado(jogo, n);
    const dir = n === 2 ? " cc-dir" : "";
    if (!cod) {
      const alimentador = jogo.alimentado_por && jogo.alimentado_por[n - 1];
      return `<span class="cc-time${dir}"><span class="cc-nome cc-indef">${alimentador ? (jogo.usa_perdedor ? "Perd. " : "Venc. ") + escapar(alimentador) : "A definir"}</span></span>`;
    }
    const venceu = decidido && jogo.vencedor === cod ? " cc-venceu" : "";
    return `<span class="cc-time${dir}${venceu}">${bandeiraHTML(cod)}<span class="cc-nome" title="${escapar(nomeDoTime(cod))}">${escapar(cod)}</span></span>`;
  };

  let miolo;
  if (decidido) {
    const v1 = jogo.vencedor === timeNoLado(jogo, 1) ? " cc-gol-vc" : "";
    const v2 = jogo.vencedor === timeNoLado(jogo, 2) ? " cc-gol-vc" : "";
    miolo =
      `<span class="cc-placar"><span class="cc-gol${v1}">${jogo.placar1}</span>` +
      `<span class="cc-x">×</span><span class="cc-gol${v2}">${jogo.placar2}</span></span>`;
  } else {
    miolo = `<span class="cc-placar"><span class="cc-x">×</span></span>`;
  }

  const pen = decidido && jogo.penaltis
    ? `<div class="cc-pen">pênaltis ${escapar(jogo.penaltis)}</div>`
    : "";

  return `<div class="comp-confronto">${ladoHTML(1)}${miolo}${ladoHTML(2)}</div>${pen}`;
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
  return `<div class="jogo jogo-comp ${ehFinal ? "final-card" : ""}" data-jogo="${jogo.id}">
    <div class="jogo-meta"><span>${escapar(jogo.rotulo)}</span>${v.badge}</div>
    ${confrontoHeaderHTML(jogo, true)}
    ${ladoComparacaoHTML(fa, jogo, v.a, v.classeA)}
    ${ladoComparacaoHTML(fb, jogo, v.b, v.classeB)}
    ${placares}${dataJogoHTML(jogo)}</div>`;
}

function renderizarComparacao() {
  fecharPopoverPalpites(); // os cards antigos saem do DOM; popover aberto ficaria órfão
  const ias = listarFontes().filter((f) => !f.ehReal);
  const fa = ias.find((f) => f.id === $("#comp-a").value) || ias[0];
  const fb = ias.find((f) => f.id === $("#comp-b").value) || ias[1] || ias[0];

  const colunas = [
    { titulo: "Oitavas", ids: ["O1", "O2", "O3", "O4"] },
    { titulo: "Quartas", ids: ["Q1", "Q2"] },
    { titulo: "Semifinal", ids: ["S1"] },
    { titulo: "🏆 Final", ids: ["F", "T"] },
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

  const ias = listarFontes().filter((f) => !f.ehReal);
  if (ias.length < 2) {
    $("#chave-comparar").innerHTML = `<p class="secao-sub">Precisa de pelo menos duas IAs no
      bolão para comparar dois chaveamentos — assim que a segunda entrar, a comparação abre aqui.</p>`;
    $("#comp-resumo").textContent = "";
    return;
  }

  const opcoes = ias
    .map((f) => `<option value="${escapar(f.id)}">${escapar(f.emoji)} ${escapar(f.rotulo)}</option>`)
    .join("");
  selA.innerHTML = opcoes;
  selB.innerHTML = opcoes;
  selA.value = ias[0].id;
  selB.value = ias[1].id;

  selA.addEventListener("change", renderizarComparacao);
  selB.addEventListener("change", renderizarComparacao);
  renderizarComparacao();
}

/* ---------- popover: palpites de todas as IAs por jogo ---------- */

let PP_CARD = null;    // card (.jogo) dono do popover aberto
let PP_FIXADO = false; // aberto por clique/toque: só fecha em novo clique, fora ou Esc

function fecharPopoverPalpites() {
  const pop = $("#popover-palpites");
  if (pop) pop.hidden = true;
  PP_CARD = null;
  PP_FIXADO = false;
}

// Conteúdo do popover: confronto, resultado real e o pick de cada IA no jogo.
function popoverPalpitesHTML(jogo) {
  const fontes = listarFontes();
  const real = fontes[0];

  const placarReal = placarDoJogoDaFonte(real, jogo.id);
  const linhaReal = jogo.vencedor
    ? `<div class="pp-linha pp-real"><span class="pp-emoji">⚽</span>
        <span class="pp-modelo">Resultado</span>
        <span class="pp-pick">${bandeiraHTML(jogo.vencedor)}<b>${escapar(jogo.vencedor)}</b></span>
        ${placarReal ? `<span class="pp-placar">${escapar(placarReal)}</span>` : ""}</div>`
    : `<div class="pp-linha pp-real"><span class="pp-emoji">⚽</span>
        <span class="pp-modelo">Resultado</span>
        <span class="pp-sem">aguardando</span></div>`;

  const votos = {};
  const linhas = fontes
    .filter((f) => !f.ehReal)
    .map((f) => {
      const pick = pickCompletoDaFonte(f, jogo.id);
      const cod = pick.vencedor;
      if (cod) votos[cod] = (votos[cod] || 0) + 1;

      let classe = "";
      let icone = "";
      if (cod) {
        const status = avaliarPick({ jogo: jogo.id, time: cod });
        if (status === "acertou") {
          const cravou = cravouPlacar({ jogo: jogo.id, time: cod, placar: pick.placar });
          classe = cravou ? "pp-acertou pp-cravou" : "pp-acertou";
          icone = cravou ? "🎯" : "✓";
        } else if (status === "errou") {
          classe = "pp-errou";
          icone = "✗";
        }
      }
      const placar = placarComPen(pick.placar, pick.penaltis);
      return `<div class="pp-linha ${classe}">
        <span class="pp-emoji">${escapar(f.emoji)}</span>
        <span class="pp-modelo" title="${escapar(f.rotulo)}">${escapar(f.rotulo)}</span>
        ${cod
          ? `<span class="pp-pick">${bandeiraHTML(cod)}<b title="${escapar(nomeDoTime(cod))}">${escapar(cod)}</b></span>`
          : `<span class="pp-sem">sem palpite</span>`}
        ${placar ? `<span class="pp-placar" title="Placar apostado (vencedor na frente)">${escapar(placar)}</span>` : ""}
        ${icone ? `<span class="pp-status">${icone}</span>` : ""}
      </div>`;
    });

  const consenso = Object.entries(votos)
    .sort((a, b) => b[1] - a[1])
    .map(([cod, n]) => `${n}× ${escapar(cod)}`)
    .join(" · ");

  return `<div class="pp-cabeca">
      <div>
        <div class="pp-rotulo">${escapar(jogo.rotulo)}</div>
        <div class="pp-data">📅 ${dataCurta(jogo.data)}${jogo.cidade ? " · " + escapar(jogo.cidade) : ""}</div>
      </div>
      <button class="pp-fechar" type="button" aria-label="Fechar">✕</button>
    </div>
    ${confrontoHeaderHTML(jogo)}
    <div class="pp-lista">${linhaReal}${linhas.join("")}</div>
    ${consenso ? `<div class="pp-consenso">🤖 Palpites: ${consenso}</div>` : ""}`;
}

// Hover mostra, clique/toque fixa (clica de novo, fora ou Esc para fechar).
// Delegado no document porque os cards do comparador re-renderizam.
function iniciarPopoverPalpites() {
  const pop = $("#popover-palpites");
  if (!pop) return;

  const posicionar = () => {
    if (!PP_CARD || pop.hidden) return;
    const r = PP_CARD.getBoundingClientRect();
    const margem = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    // preferência: à direita do card; senão à esquerda; senão abaixo/acima
    let x = r.right + margem;
    if (x + pw > vw - 8) x = r.left - pw - margem;
    let y = r.top + r.height / 2 - ph / 2;
    if (x < 8) {
      x = r.left + r.width / 2 - pw / 2;
      y = r.bottom + margem + ph > vh - 8 ? r.top - ph - margem : r.bottom + margem;
    }
    pop.style.left = Math.max(8, Math.min(x, vw - pw - 8)) + "px";
    pop.style.top = Math.max(8, Math.min(y, vh - ph - 8)) + "px";
  };

  const abrir = (card, fixar) => {
    const jogo = POR_ID[card.dataset.jogo];
    if (!jogo) return;
    fecharPopoverPontos(); // um popover por vez
    if (card !== PP_CARD) {
      pop.innerHTML = popoverPalpitesHTML(jogo);
      pop.hidden = false;
      PP_CARD = card;
    }
    PP_FIXADO = fixar;
    posicionar();
  };

  document.addEventListener("mouseover", (e) => {
    if (PP_FIXADO) return;
    const card = e.target.closest(".jogo[data-jogo]");
    if (card) abrir(card, false);
  });

  document.addEventListener("mouseout", (e) => {
    if (PP_FIXADO || !PP_CARD) return;
    const para = e.relatedTarget;
    if (para && (PP_CARD.contains(para) || pop.contains(para))) return;
    if (PP_CARD.contains(e.target) || pop.contains(e.target)) fecharPopoverPalpites();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".pp-fechar")) {
      fecharPopoverPalpites();
      return;
    }
    const card = e.target.closest(".jogo[data-jogo]");
    if (card) {
      if (PP_FIXADO && card === PP_CARD) fecharPopoverPalpites();
      else abrir(card, true);
      return;
    }
    if (!pop.contains(e.target)) fecharPopoverPalpites();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharPopoverPalpites();
  });

  // segue o card quando a página (ou o trilho horizontal da chave) rola
  window.addEventListener("scroll", posicionar, true);
  window.addEventListener("resize", posicionar);
}

/* ---------- popover: extrato de pontos (auditoria do ranking) ---------- */

let EPT_CELULA = null;  // célula do ranking dona do extrato aberto
let EPT_FIXADO = false; // aberto por clique/toque: só fecha em novo clique, fora ou Esc

function fecharPopoverPontos() {
  const pop = $("#popover-pontos");
  if (pop) pop.hidden = true;
  EPT_CELULA = null;
  EPT_FIXADO = false;
}

// Uma linha do extrato: jogo · aposta → resultado real · conta dos pontos.
function linhaExtratoHTML(d) {
  const jogo = POR_ID[d.jogo];
  const apostaPlacar = placarComPen(d.placar, d.penaltis);
  const aposta = d.time
    ? `<span class="pp-pick">${bandeiraHTML(d.time)}<b title="${escapar(nomeDoTime(d.time))}">${escapar(d.time)}</b></span>` +
      (apostaPlacar
        ? `<span class="pp-placar" title="Placar apostado (vencedor na frente)">${escapar(apostaPlacar)}</span>`
        : "")
    : `<span class="pp-sem">sem palpite</span>`;

  let real;
  if (jogo && jogo.vencedor) {
    const placarReal = placarDoJogoDaFonte({ ehReal: true }, d.jogo);
    real =
      `<span class="pp-pick">${bandeiraHTML(jogo.vencedor)}<b title="${escapar(nomeDoTime(jogo.vencedor))}">${escapar(jogo.vencedor)}</b></span>` +
      (placarReal
        ? `<span class="pp-placar" title="Resultado real (vencedor na frente)">${escapar(placarReal)}</span>`
        : "");
  } else {
    real = `<span class="pp-sem">aguarda</span>`;
  }

  let classe = "";
  let calc;
  if (d.status === "acertou") {
    classe = d.cravou ? "pp-acertou pp-cravou" : "pp-acertou";
    calc = d.cravou
      ? `🎯${d.cravouPen ? "🥅" : ""} ${d.pontos}×2 = <b>${d.pontos * 2}</b>`
      : `✓ <b>+${d.pontos}</b>`;
  } else if (d.status === "errou") {
    classe = "pp-errou";
    calc = `✗ <b>0</b>`;
  } else {
    const teto = parsePlacar(d.placar) ? d.pontos * 2 : d.pontos;
    calc = `<span class="ep-pend">⏳ vale ${d.pontos}${teto > d.pontos ? "–" + teto : ""}</span>`;
  }

  return `<div class="pp-linha ${classe}">
    <span class="ep-id">${escapar(d.jogo)}</span>
    ${aposta}
    <span class="ep-seta">→</span>
    ${real}
    <span class="ep-calc">${calc}</span>
  </div>`;
}

// Conteúdo do popover: cada pick da IA com o resultado real e a conta,
// agrupado por fase, com subtotal e o somatório final auditável.
function popoverPontosHTML(palpite) {
  const placar = pontuarPalpite(palpite);

  const blocos = FASES.map((fase) => {
    const picks = placar.detalhes.filter((d) => d.fase === fase);
    if (!picks.length) return "";
    const subtotal = picks.reduce(
      (soma, d) => soma + (d.status === "acertou" ? (d.cravou ? d.pontos * 2 : d.pontos) : 0),
      0
    );
    const valor = PONTUACAO[fase];
    return `<div class="ep-fase"><span>${NOME_FASE[fase]}</span>
        <span>${valor} pt${valor > 1 ? "s" : ""}/acerto · subtotal ${subtotal}</span></div>` +
      picks.map(linhaExtratoHTML).join("");
  }).join("");

  // conta auditável: um termo por acerto (cravada aparece como "N×2")
  const termos = placar.detalhes
    .filter((d) => d.status === "acertou")
    .map((d) => (d.cravou ? `${d.pontos}×2` : `${d.pontos}`));
  const conta = termos.length ? `${termos.join(" + ")} = ` : "";

  return `<div class="pp-cabeca">
      <div>
        <div class="pp-rotulo">🧾 Extrato de pontos</div>
        <div class="pp-data">${escapar(palpite.emoji || "🤖")} ${escapar(palpite.modelo)}</div>
      </div>
      <button class="pp-fechar ep-fechar" type="button" aria-label="Fechar">✕</button>
    </div>
    <div class="pp-lista">${blocos}</div>
    <div class="ep-total">
      <div class="ep-conta">Total: ${conta}<b>${placar.pontos} pt${placar.pontos === 1 ? "" : "s"}</b></div>
      ${placar.cravadas ? `<div>🎯 Placar exato cravado ${placar.cravadas}× — dobra os pontos do jogo</div>` : ""}
      ${placar.penCravadas ? `<div>🥅 Pênaltis cravados: ${placar.penCravadas} (critério de desempate)</div>` : ""}
      <div>📈 Somando o que ainda está em aberto, pode chegar a <b>${placar.possivel} pts</b></div>
    </div>
    <div class="ep-legenda">✓ acertou quem avança · 🎯 cravou o placar (×2) · ✗ errou (0) · ⏳ em aberto</div>`;
}

// Mesmo comportamento do popover de palpites: hover mostra, clique/toque fixa.
function iniciarPopoverPontos() {
  const pop = $("#popover-pontos");
  if (!pop) return;

  const posicionar = () => {
    if (!EPT_CELULA || pop.hidden) return;
    const r = EPT_CELULA.getBoundingClientRect();
    const margem = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let x = r.right + margem;
    if (x + pw > vw - 8) x = r.left - pw - margem;
    let y = r.top + r.height / 2 - ph / 2;
    if (x < 8) {
      x = r.left + r.width / 2 - pw / 2;
      y = r.bottom + margem + ph > vh - 8 ? r.top - ph - margem : r.bottom + margem;
    }
    pop.style.left = Math.max(8, Math.min(x, vw - pw - 8)) + "px";
    pop.style.top = Math.max(8, Math.min(y, vh - ph - 8)) + "px";
  };

  const abrir = (celula, fixar) => {
    const palpite = PALPITES.find((p) => p.id === celula.dataset.pontosIa);
    if (!palpite) return;
    fecharPopoverPalpites(); // um popover por vez
    if (celula !== EPT_CELULA) {
      pop.innerHTML = popoverPontosHTML(palpite);
      pop.hidden = false;
      EPT_CELULA = celula;
    }
    EPT_FIXADO = fixar;
    posicionar();
  };

  document.addEventListener("mouseover", (e) => {
    if (EPT_FIXADO) return;
    const celula = e.target.closest("[data-pontos-ia]");
    if (celula) abrir(celula, false);
  });

  document.addEventListener("mouseout", (e) => {
    if (EPT_FIXADO || !EPT_CELULA) return;
    const para = e.relatedTarget;
    if (para && (EPT_CELULA.contains(para) || pop.contains(para))) return;
    if (EPT_CELULA.contains(e.target) || pop.contains(e.target)) fecharPopoverPontos();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".ep-fechar")) {
      fecharPopoverPontos();
      return;
    }
    const celula = e.target.closest("[data-pontos-ia]");
    if (celula) {
      if (EPT_FIXADO && celula === EPT_CELULA) fecharPopoverPontos();
      else abrir(celula, true);
      return;
    }
    if (!pop.contains(e.target)) fecharPopoverPontos();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharPopoverPontos();
  });

  window.addEventListener("scroll", posicionar, true);
  window.addEventListener("resize", posicionar);
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
