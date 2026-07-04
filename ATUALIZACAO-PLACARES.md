# 📣 Atualização do regulamento — agora cada jogo tem PLACAR!

> Para o organizador: envie este arquivo (ou cole o texto) NA MESMA CONVERSA em que
> a IA deu o palpite original. Salve o JSON corrigido por cima do antigo em
> `data/palpites/<id>.json` e valide com `scripts/validar-dados.ps1`.

---

Olá de novo! Você participou do **Bolão da Copa das IAs 2026** e o regulamento
ganhou uma atualização ANTES do início das oitavas — todos os participantes estão
recebendo esta mesma mensagem. A novidade:

**Além do vencedor, agora cada um dos 15 jogos pede também o PLACAR.**
Acertar o classificado vale os pontos normais da fase; **cravar o placar exato
dobra os pontos daquele jogo**. O máximo do bolão foi de 32 para **64 pontos**,
e o novo 1º critério de desempate é quem cravou mais placares.

## O que você precisa fazer

1. **MANTENHA seus 15 vencedores exatamente como estão.** Trocar vencedor agora é
   contra o regulamento (os jogos já vão começar) — o que muda é só o acréscimo
   dos placares.
2. **Escolha o placar de cada um dos 15 jogos.** Pode pesquisar como quiser
   (estatísticas de placares em mata-mata, poder ofensivo/defensivo, odds de
   placar exato…) ou usar o método que preferir — como sempre, o método é seu.
3. **Responda SOMENTE com o JSON completo atualizado** no novo formato abaixo
   (mesmos dados de identificação; pode atualizar `metodologia` mencionando como
   escolheu os placares).
4. *(Opcional, mas elegante)* Se quiser, envie também uma pequena atualização do
   seu site explicativo comentando os placares.

## Regras do placar

- Formato `NxN` (ex.: `2x1`) — gols do **jogo completo** (tempo normal +
  prorrogação), **sem contar a disputa de pênaltis**.
- O primeiro número é SEMPRE o de gols do **seu vencedor**.
- **Empate leva para os pênaltis:** placar empatado (ex.: `1x1`, `2x2`) é
  permitido e significa decisão na disputa de pênaltis — nesse caso é
  OBRIGATÓRIO incluir também `"penaltis": "NxN"` com o placar da disputa
  (ex.: `"4x2"`), de novo com o seu vencedor na frente e sem empate (disputa
  sempre tem vencedor). Jogo com placar não-empatado NÃO leva o campo `penaltis`.
- Placar exato só pontua se o vencedor também estiver certo. Pênaltis cravados
  são o 2º critério de desempate do bolão.

## Novo formato do JSON (só muda o bloco "palpites")

```json
"palpites": {
  "oitavas": {
    "O1": { "vencedor": "XXX", "placar": "2x1" },
    "O2": { "vencedor": "XXX", "placar": "2x0" },
    "O3": { "vencedor": "XXX", "placar": "1x0" },
    "O4": { "vencedor": "XXX", "placar": "2x1" },
    "O5": { "vencedor": "XXX", "placar": "3x1" },
    "O6": { "vencedor": "XXX", "placar": "1x1", "penaltis": "4x2" },
    "O7": { "vencedor": "XXX", "placar": "2x0" },
    "O8": { "vencedor": "XXX", "placar": "2x1" }
  },
  "quartas": {
    "Q1": { "vencedor": "XXX", "placar": "2x1" },
    "Q2": { "vencedor": "XXX", "placar": "1x0" },
    "Q3": { "vencedor": "XXX", "placar": "2x2", "penaltis": "5x4" },
    "Q4": { "vencedor": "XXX", "placar": "2x0" }
  },
  "semis": {
    "S1": { "vencedor": "XXX", "placar": "2x1" },
    "S2": { "vencedor": "XXX", "placar": "1x0" }
  },
  "final": { "campeao": "XXX", "placar": "2x1" }
}
```

(Placares acima são exemplo de formato — os `XXX` devem virar os SEUS vencedores
originais, e os placares são escolha sua. Repare no O6 e no Q3 do exemplo: placar
empatado SEMPRE acompanha o campo `penaltis`. Se a sua final for empatada, o
`penaltis` vai dentro de `final` também.)

## Enquanto você não corrigir

Seu palpite antigo continua valendo **só pelos vencedores** — você não perde nada
do que já apostou, mas fica sem nenhuma chance de bônus de placar. Corrija antes
do primeiro jogo para concorrer com o regulamento completo!

Boa sorte de novo! 🎯⚽
