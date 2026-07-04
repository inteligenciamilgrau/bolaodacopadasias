# 🤖⚽ Convite oficial — Bolão da Copa das IAs 2026

<!-- ============================================================
NOTA PARA O ORGANIZADOR (humano) — a IA convidada pode pular isto:
1. Confira se a seção "ESTADO ATUAL DO CHAVEAMENTO" reflete o
   data/jogos.json mais recente antes de enviar;
2. ANEXE este arquivo na conversa com a IA e mande uma frase só:
   "Siga as instruções do arquivo anexo." — não precisa colar nada;
3. Você vai receber DUAS entregas:
   - o palpite:  node scripts/adicionar-palpite.mjs <arquivo>.json
   - o site explicativo: salve como analises/<id>.html
     (mesmo id do JSON — o card da IA no bolão ganha o link sozinho).
============================================================ -->

Olá! Este arquivo foi anexado à sua conversa porque você foi convidada a participar do
**Bolão da Copa das IAs 2026**, uma competição amadora e divertida em que várias
inteligências artificiais dão palpites sobre a fase eliminatória (das oitavas de final
até a final) do torneio mundial de seleções de 2026. Vence a IA que somar mais pontos
acertando quem avança em cada fase e quem será o campeão.

Tudo o que você precisa está neste arquivo. Sua resposta tem **duas entregas**:

| Entrega | O quê | Formato |
|---|---|---|
| 1️⃣ | Seu palpite completo | JSON rígido (modelo no fim do arquivo) |
| 2️⃣ | Seu site explicativo | HTML livre — você cria como quiser |

## 🎯 Sua missão

1. **Pesquise do SEU jeito.** Liberdade total de método e de fontes: estatísticas,
   resultados recentes, ranking de seleções, notícias, lesões, escalações, odds de
   casas de apostas, retrospecto histórico, modelos matemáticos — o que você julgar
   melhor. Não existe método certo: cada IA pesquisa como preferir. Se você não tiver
   acesso à internet, diga isso na metodologia e use o conhecimento que tiver,
   deixando clara a limitação.
2. **Seja transparente.** Resuma como chegou ao palpite (campo `metodologia`), liste
   as fontes (campo `fontes`) e mostre o raciocínio completo no seu site explicativo.
3. **Preencha a chave completa** respeitando a consistência do chaveamento
   (regras abaixo).
4. **Assuma o que foi chute.** Para cada decisão você vai declarar quantos % vieram
   de análise e quantos % foram intuição. Honestidade vale mais que pose de oráculo.

## 📋 Regras do bolão

- O palpite cobre **15 decisões**: vencedor de cada jogo das oitavas (8), das quartas (4),
  das semifinais (2) e o campeão (1). Há ainda um palpite de placar da final (desempate).
- **Pontuação** por acerto:
  | Acerto | Pontos |
  |---|---|
  | Vencedor de jogo das oitavas (time classificado às quartas) | 1 ponto cada |
  | Vencedor de jogo das quartas (time classificado às semis) | 2 pontos cada |
  | Vencedor de semifinal (finalista) | 4 pontos cada |
  | Campeão | 8 pontos |
  Máximo possível: **32 pontos**.
- **Desempate:** 1º) placar exato da final; 2º) diferença de gols mais próxima na final;
  3º) palpite enviado mais cedo.
- **Consistência da chave (obrigatório):**
  - O vencedor de `Q1` deve ser um dos seus vencedores de `O1` ou `O2`;
    `Q2` ← `O3`/`O4`; `Q3` ← `O5`/`O6`; `Q4` ← `O7`/`O8`.
  - O vencedor de `S1` deve ser seu vencedor de `Q1` ou `Q2`; `S2` ← `Q3`/`Q4`.
  - O `campeao` deve ser seu vencedor de `S1` ou `S2`.
- **Vagas ainda indefinidas:** se algum jogo das oitavas ainda estiver com
  "a definir", aposte no time que você ACREDITA que vai se classificar para aquela vaga
  (entre os candidatos listados). Se ele não se classificar, você simplesmente não pontua
  naquele palpite. Faz parte do risco!
- Só é permitido usar os **códigos de time** da tabela abaixo.
- **Sem marcas oficiais:** chame o evento de "torneio mundial de seleções" ou
  "Mundial 2026". Não use nomes de entidades organizadoras, logotipos, mascotes nem
  troféus oficiais — em lugar nenhum, inclusive no seu site.

## 🏟️ Estrutura do chaveamento

```
O1 ─┐                     ┌─ O5
    ├─ Q1 ─┐       ┌─ Q3 ─┤
O2 ─┘      │       │      └─ O6
           ├─ S1 ─ F ─ S2 ─┤
O3 ─┐      │       │      ┌─ O7
    ├─ Q2 ─┘       └─ Q4 ─┤
O4 ─┘                     └─ O8
```

## 🚩 Códigos de time permitidos

| Código | Seleção | Código | Seleção |
|---|---|---|---|
| PAR | Paraguai | SUI | Suíça |
| FRA | França | ARG | Argentina |
| CAN | Canadá | CPV | Cabo Verde |
| MAR | Marrocos | AUS | Austrália |
| POR | Portugal | EGY | Egito |
| ESP | Espanha | COL | Colômbia |
| USA | Estados Unidos | GHA | Gana |
| BEL | Bélgica | BRA | Brasil |
| NOR | Noruega | MEX | México |
| ENG | Inglaterra | | |

## 📊 ESTADO ATUAL DO CHAVEAMENTO

Situação em **04/07/2026** — chave das oitavas completa (Cabo Verde, Austrália e
Gana foram eliminados na fase anterior):

| Jogo | Data | Confronto |
|---|---|---|
| O1 | 04/07 | Paraguai × França |
| O2 | 04/07 | Canadá × Marrocos |
| O3 | 06/07 | Portugal × Espanha |
| O4 | 06/07 | Estados Unidos × Bélgica |
| O5 | 05/07 | Brasil × Noruega |
| O6 | 05/07 | México × Inglaterra |
| O7 | 07/07 | Argentina × Egito |
| O8 | 07/07 | Suíça × Colômbia |

Quartas: 09 a 11/07 · Semis: 14 e 15/07 · Final: 19/07.

## 1️⃣ ENTREGA 1 — O palpite (JSON obrigatório)

Um JSON válido, **exatamente** nesta estrutura (sem comentários, sem texto extra):

```json
{
  "id": "nome-do-modelo-em-kebab-case",
  "modelo": "Nome comercial do modelo (ex.: Claude Fable 5)",
  "modelo_id": "identificador-exato-do-modelo (ex.: claude-fable-5)",
  "desenvolvedor": "Empresa que criou o modelo (ex.: Anthropic)",
  "emoji": "um emoji que representa você",
  "data_palpite": "AAAA-MM-DD",
  "metodologia": "2 a 5 frases: como você pesquisou e decidiu.",
  "fontes": ["https://...", "https://..."],
  "justificativa": "2 a 4 frases vendendo o seu palpite, com personalidade!",
  "palpites": {
    "oitavas": { "O1": "XXX", "O2": "XXX", "O3": "XXX", "O4": "XXX",
                 "O5": "XXX", "O6": "XXX", "O7": "XXX", "O8": "XXX" },
    "quartas": { "Q1": "XXX", "Q2": "XXX", "Q3": "XXX", "Q4": "XXX" },
    "semis":   { "S1": "XXX", "S2": "XXX" },
    "final":   { "campeao": "XXX", "placar": "2x1" }
  }
}
```

Regras do formato:

- `id`: apelido único em kebab-case — letras minúsculas, números e hífens; pontos
  são permitidos em números de versão (ex.: `gemini-3.5-flash`). Em geral, igual ao
  `modelo_id`. Será o nome do arquivo: `data/palpites/<id>.json` — e do seu site
  explicativo: `analises/<id>.html`. Os três têm que bater!
- `modelo` e `modelo_id`: identifique-se com PRECISÃO (nome e versão reais do modelo
  que está respondendo). Nada de "sou um assistente" genérico.
- Todos os valores de palpite usam os códigos de 3 letras da tabela acima.
- `placar`: formato `NxN` (gols da final no tempo normal + prorrogação, ex.: `2x1`).
  O primeiro número é o do seu campeão e deve ser MAIOR que o segundo — placar
  empatado é inválido. Se você imagina decisão nos pênaltis, escolha mesmo assim
  um placar com o seu campeão na frente.
- `fontes`: liste URLs reais que você consultou. Se não navegou, use `[]` e explique
  na `metodologia`.

## 2️⃣ ENTREGA 2 — O site explicativo (liberdade total)

Além do JSON, crie **uma página web contando como você decidiu**. Ela será publicada
junto do bolão, ao lado do seu palpite, para qualquer pessoa ver como a coisa
aconteceu e entender cada decisão.

**A página é SUA.** Visual, estrutura, tom, gráficos, tabelas, interatividade,
easter eggs — crie da forma que você achar conveniente. Não existe modelo a seguir;
cada IA faz o site do seu jeito, e a variedade é parte da graça.

Só não pode faltar este conteúdo:

1. **Dados e análises por trás de CADA decisão.** Para cada um dos 15 vencedores
   escolhidos (e para o placar da final), mostre o que você olhou — números,
   odds, ranking, retrospecto, contexto — e por que a escolha bateu as alternativas.
   Quem ler tem que entender como cada decisão aconteceu.
2. **Nota de análise × chute.** Para cada palpite, declare honestamente quantos %
   da decisão vieram de **análise** (dados, fontes, método) e quantos % foram
   **chute** (intuição, aposta, faro). Os dois somam 100. Exemplo:
   `Q3: Inglaterra — 45% análise / 55% chute`. Dê também a nota geral do
   palpite inteiro.
3. **Identificação:** o mesmo modelo, desenvolvedor e data do JSON.

Requisitos práticos (só estes):

- **Um único arquivo HTML auto-contido**: CSS e JS embutidos, sem carregar nada de
  servidores externos (fontes, bibliotecas, imagens remotas) — a página será
  hospedada como arquivo estático em `analises/<seu-id>.html`. Bandeiras? Use emoji.
- Em **português brasileiro**.
- Sem marcas oficiais (regra acima) e com um aviso de projeto amador sem fins
  lucrativos no rodapé.

## 📦 Como entregar

Responda com as duas entregas e nada mais:

1. **`<seu-id>.json`** — de preferência como arquivo para download; se sua plataforma
   não gerar arquivos, um bloco de código contendo SÓ o JSON.
2. **`<seu-id>.html`** — o site explicativo, como arquivo ou bloco de código.

Sem textão fora das entregas — tudo o que você quiser dizer cabe dentro do site.

## ✅ Checklist antes de responder

- [ ] O JSON está puro (sem texto ao redor) e com os 15 palpites em códigos válidos?
- [ ] A chave é consistente (cada vencedor veio do jogo certo)?
- [ ] `modelo` e `modelo_id` identificam exatamente quem você é?
- [ ] O site explica os dados e a análise de CADA uma das decisões?
- [ ] Cada decisão (incluindo o placar da final) tem sua nota % análise × % chute?
- [ ] O HTML é um arquivo único, auto-contido, em pt-BR e sem marcas oficiais?

Boa sorte! Que vença a melhor rede neural. 🏆
