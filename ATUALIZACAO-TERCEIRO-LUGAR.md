# 📣 Atualização do regulamento — complete sua chave: entrou a DISPUTA DE 3º LUGAR!

> Para o organizador: envie este arquivo (ou cole o texto) NA MESMA CONVERSA em que
> a IA deu o palpite original. Cole o bloco `"terceiro"` devolvido dentro de
> `palpites` no `data/palpites/<id>.json` da IA (entre `"semis"` e `"final"`) e
> valide com `scripts/validar-dados.ps1`.

---

Olá de novo! Você participa do **Bolão da Copa das IAs 2026** e o regulamento ganhou
um complemento — todos os participantes estão recebendo esta mesma mensagem. A
novidade:

**O bolão agora inclui a disputa de 3º lugar** (jogo `T`, em 18/07, véspera da
final), disputada entre os perdedores das duas semifinais. Acertar quem vence a
disputa vale **4 pontos** — e, como em todo jogo, **cravar o placar exato dobra**
(8 pontos). O máximo do bolão foi de 64 para **72 pontos**.

## 🧠 A regra de ouro deste complemento

Esta é uma decisão **de prancheta**: você vai apenas COMPLETAR a chave que já
montou, de dentro dela.

- Na SUA chave, quem disputa o 3º lugar são os **SEUS dois perdedores de
  semifinal**: quem você colocou em `S1` e não avançou, e quem você colocou em
  `S2` e não avançou. O vencedor de `T` deve ser **um desses dois** — nenhum
  outro código é aceito.
- Decida **somente com o que você já sabia e imaginava quando montou o palpite
  original**. NÃO pesquise resultados, notícias, escalações ou odds do torneio —
  nada que tenha acontecido depois do seu palpite entra nesta decisão. É como se
  o campeonato da sua chave estivesse acontecendo exatamente como você previu.
- **NÃO mexa em nenhum palpite existente.** Seus 15 vencedores e placares seguem
  exatamente como estão — isto é só um acréscimo.
- A pontuação, como em todas as vagas do bolão, é contra a realidade: você marca
  os 4 pontos se o time que apontar vencer a disputa de 3º lugar **de verdade**
  (e o dobro cravando o placar). Se a sua chave não se concretizar até lá, o pick
  simplesmente não pontua — risco de sempre, regra de sempre.

## O que você precisa fazer

1. Olhe para a sua própria chave e identifique seus dois perdedores de semifinal.
2. **Escolha qual dos dois vence a disputa de 3º lugar** — pelo método que
   preferir, desde que sem consultar nada novo (regra de ouro acima).
3. **Escolha o placar** do jogo, nas regras de sempre: formato `NxN`, gols do jogo
   completo (tempo normal + prorrogação, sem contar disputa de pênaltis), com os
   gols do SEU vencedor na frente. Placar empatado (ex.: `1x1`) significa decisão
   nos pênaltis e exige também `"penaltis": "NxN"` (vencedor na frente, sem
   empate).
4. **Responda SOMENTE com o bloco JSON abaixo** (e, se quiser, uma justificativa
   de até 3 frases + a sua nota honesta `% análise × % chute` desta decisão, para
   o seu site explicativo ser atualizado):

```json
"terceiro": {
  "T": { "vencedor": "XXX", "placar": "2x1" }
}
```

(Placar de exemplo — a escolha é sua. Com empate: `"T": { "vencedor": "XXX",
"placar": "1x1", "penaltis": "4x2" }`.)

## ⏰ Prazo

Responda nesta conversa, de imediato — o complemento vale até **14/07 às 16h
(horário de Brasília)**, para todos os participantes decidirem em igualdade de
condições.

## Se você não responder a tempo

Nada muda para o que já apostou: seu palpite continua valendo normalmente. Você
apenas fica de fora dos pontos da disputa de 3º lugar (até 8 pontos em jogo).

Dica de quem já viu muita disputa de 3º lugar: é o jogo mais imprevisível do
torneio — time desmotivado, reservas em campo e goleada ou pênaltis no cardápio.
Bom chute! 🥉⚽
