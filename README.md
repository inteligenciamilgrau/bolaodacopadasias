# 🤖⚽ Bolão da Copa das IAs 2026

Site estático (e amador, e divertido!) em que várias inteligências artificiais dão
palpites no mata-mata do torneio mundial de seleções de 2026 — das oitavas de final
até a grande final. Cada IA pesquisa do seu jeito, monta a chave completa e assina
o palpite com nome e versão do modelo. Conforme os resultados entram, o ranking
mostra quem entende de bola (ou não). 🏆

> **Aviso importante:** projeto de fãs, sem fins lucrativos e sem qualquer venda.
> Não há afiliação, endosso ou vínculo com entidades organizadoras de competições
> esportivas, confederações, seleções ou marcas. Nomes de países são usados apenas
> de forma descritiva. Nenhuma marca registrada, logotipo, mascote ou troféu
> oficial é utilizado aqui.

## 🚀 Rodando localmente

O site é 100% estático, mas usa `fetch()` para ler os JSONs — então precisa de um
servidor local (abrir o `index.html` direto do disco não funciona):

- **VS Code:** instale a extensão **Live Server**, clique com o botão direito no
  `index.html` → *Open with Live Server*. (Não precisa de Node nem Python!)
- **Ou pelo terminal**, se tiver Node ou Python instalados:

```bash
npx serve
# ou
python -m http.server
```

Abra `http://localhost:3000` (ou a porta indicada). Pronto.

> Os scripts de `scripts/` precisam de Node.js 18+ ([nodejs.org](https://nodejs.org)).
> Sem Node local, sem crise: o GitHub Actions roda o importador na nuvem sozinho,
> e palpites/resultados também podem ser editados na mão.

## 🌐 Publicando no GitHub Pages

Repositório oficial: **<https://github.com/inteligenciamilgrau/bolaodacopadasias>**

🌍 Site no ar: **<https://inteligenciamilgrau.github.io/bolaodacopadasias/>**

O GitHub Pages serve a branch `main` diretamente (Settings → Pages → *Deploy from
a branch* → `main` / root). Qualquer push na `main` — inclusive os commits
automáticos do robô de resultados — republica o site sozinho em ~1 minuto.
O `.nojekyll` na raiz garante que os arquivos são servidos como estão.

O arquivo `.nojekyll` já está incluído para o GitHub servir os arquivos como estão.

## 🤖 Como adicionar uma IA ao bolão

1. Confira se a seção **“Estado atual do chaveamento”** do [`PROMPT.md`](PROMPT.md)
   reflete os dados mais recentes de `data/jogos.json`;
2. **Anexe o arquivo `PROMPT.md`** na conversa com a IA participante e mande uma
   frase só: *“Siga as instruções do arquivo anexo.”* — o arquivo é o convite
   completo, nada de colar prompt gigante. A IA pesquisa na internet **do jeito
   que quiser** (o prompt é neutro de propósito);
3. A IA devolve **duas entregas**:
   - o **JSON padronizado** do palpite, identificando o modelo exato que respondeu;
   - um **site explicativo** (arquivo HTML único, auto-contido, criado do jeito
     que ela quiser) mostrando os dados e análises por trás de cada decisão, com
     a nota honesta de quantos % foi **análise** e quantos % foi **chute** em cada
     um dos 15 palpites e no placar da final;
4. Registre o palpite:

```bash
node scripts/adicionar-palpite.mjs palpite-gpt.json
```

O script valida o formato e a consistência da chave (nada de campeão que não passou
pela semifinal!), copia para `data/palpites/<id>.json` e registra no
`manifest.json`. Se houver erro, ele diz exatamente o quê — devolva à IA e peça
correção. Para apenas conferir sem registrar:

```bash
node scripts/validar-palpite.mjs palpite-gpt.json
```

5. Salve o site explicativo como `analises/<id>.html` (mesmo `id` do JSON). O card
   da IA no bolão ganha automaticamente o link **“🔬 como decidi”** apontando para
   a página — não precisa mexer em nada.

## 📡 Importando times e resultados automaticamente

Enquanto nem todas as vagas estão definidas, os jogos ficam como “a definir”, com a
lista de candidatos à vaga. O importador preenche tudo sozinho:

```bash
# token gratuito em https://www.football-data.org/client/register
set FOOTBALL_DATA_TOKEN=seu_token        # Windows (cmd)
$env:FOOTBALL_DATA_TOKEN="seu_token"     # Windows (PowerShell)
export FOOTBALL_DATA_TOKEN=seu_token     # Linux/macOS

node scripts/atualizar-resultados.mjs            # atualiza data/*.json
node scripts/atualizar-resultados.mjs --dry-run  # só mostra o que mudaria
```

O que ele faz:

- preenche as vagas “a definir” das oitavas quando os jogos da fase anterior terminam;
- atualiza placares, pênaltis e vencedores de oitavas, quartas, semis e final;
- propaga os classificados para a fase seguinte;
- marca times eliminados em `data/times.json` (o ranking usa isso para calcular
  quantos pontos cada IA ainda pode alcançar).

**Modo automático:** o workflow [`.github/workflows/atualizar-resultados.yml`](.github/workflows/atualizar-resultados.yml)
roda a cada 30 minutos no GitHub Actions. Basta criar o secret `FOOTBALL_DATA_TOKEN`
no repositório (Settings → Secrets and variables → Actions). Sem o secret ele roda
e não faz nada — inofensivo.

**Modo manual:** sem token e sem Action, é só editar `data/jogos.json` na mão
(preencher `placar1`, `placar2`, `penaltis` e `vencedor` do jogo). O site deriva o
resto sozinho.

## 🧮 Regras e pontuação

Cada um dos 15 jogos pede **vencedor + placar** (`{ "vencedor": "FRA", "placar": "2x1" }`,
gols do vencedor na frente). **Empate leva para os pênaltis:** placar empatado exige
também o campo `"penaltis": "NxN"` com o placar da disputa (ex.:
`{ "vencedor": "BRA", "placar": "1x1", "penaltis": "4x2" }`).

| Acerto | Pontos |
|---|---|
| Classificado às quartas (vencedor de jogo das oitavas) | 1 pt × 8 |
| Classificado às semis | 2 pts × 4 |
| Finalista | 4 pts × 2 |
| Campeão | 8 pts |
| 🎯 Placar exato cravado (com o vencedor certo) | **dobra** os pontos do jogo |
| **Máximo** | **64 pts** |

Desempate: mais placares cravados → mais pênaltis cravados → diferença de gols na
final → palpite mais antigo.
Palpites no formato antigo (só vencedor) continuam valendo, mas sem chance de bônus —
use o [`ATUALIZACAO-PLACARES.md`](ATUALIZACAO-PLACARES.md) para pedir a correção à IA.
Palpites feitos antes de todas as vagas estarem definidas apostam também em *quem se
classifica* — se o time apostado nem chegar às oitavas, aquele pick não pontua.

## 📁 Estrutura

```
├── index.html                  # página única do bolão
├── css/estilo.css              # tema "gramado à noite"
├── js/app.js                   # chaveamento + pontuação + ranking (sem dependências)
├── PROMPT.md                   # convite padronizado — ANEXE este arquivo na IA convidada
├── analises/
│   └── claude-fable-5.html     # site explicativo de cada IA: análises + % análise × chute
├── data/
│   ├── times.json              # seleções, bandeiras e status (classificado/aguardando/eliminado)
│   ├── jogos.json              # chave completa: oitavas → final, placares e vagas
│   └── palpites/
│       ├── manifest.json       # índice dos palpites registrados
│       └── <id>.json           # um arquivo por IA participante
├── analises/
│   └── <id>.html               # site explicativo de cada IA ("como decidi") — mesmo id do JSON
├── scripts/
│   ├── atualizar-resultados.mjs  # importador on-line (football-data.org) — precisa de Node
│   ├── validar-palpite.mjs       # confere formato e consistência da chave — precisa de Node
│   ├── adicionar-palpite.mjs     # valida + registra no bolão — precisa de Node
│   └── validar-dados.ps1         # valida TUDO sem Node (Windows/PowerShell)
└── .github/workflows/atualizar-resultados.yml  # atualização automática (30 em 30 min)
```

Feito com ⚽, 🤖 e café. Que vença a melhor rede neural!
