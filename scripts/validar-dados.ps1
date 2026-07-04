# Validador de dados do Bolao (PowerShell -- nao precisa de Node!)
# -----------------------------------------------------------------
# Confere os JSONs de data/, a consistencia da chave de TODOS os palpites
# do manifest e avisa quais IAs tem site explicativo em analises/.
# (Mensagens sem acentos de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI.)
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\validar-dados.ps1

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$erros = 0
function Falha($msg) { Write-Host "  X $msg" -ForegroundColor Red; $script:erros++ }
function Ok($msg) { Write-Host "  OK $msg" -ForegroundColor Green }

# ---- 1) times.json e jogos.json
$times = (Get-Content (Join-Path $raiz "data\times.json") -Raw -Encoding UTF8 | ConvertFrom-Json).times
$jogos = (Get-Content (Join-Path $raiz "data\jogos.json") -Raw -Encoding UTF8 | ConvertFrom-Json).jogos
$codigos = $times.PSObject.Properties.Name

$idsEsperados = @("O1","O2","O3","O4","O5","O6","O7","O8","Q1","Q2","Q3","Q4","S1","S2","F")
$ids = @($jogos | ForEach-Object { $_.id })
if (($ids -join ",") -ne ($idsEsperados -join ",")) { Falha "jogos.json: IDs inesperados ($($ids -join ','))" }
else { Ok "jogos.json: 15 jogos na ordem esperada" }

foreach ($j in $jogos) {
  foreach ($t in @($j.time1, $j.time2)) {
    if ($t -and ($codigos -notcontains $t)) { Falha "Jogo $($j.id): time desconhecido '$t'" }
  }
  if ($j.vencedor -and ($j.vencedor -ne $j.time1) -and ($j.vencedor -ne $j.time2)) {
    Falha "Jogo $($j.id): vencedor '$($j.vencedor)' nao e nenhum dos dois times"
  }
}
Ok "jogos.json: times e vencedores coerentes"

# ---- 2) todos os palpites do manifest
$manifest = Get-Content (Join-Path $raiz "data\palpites\manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$regras = @(
  @{ jogo="Q1"; fase="quartas"; origem=@("O1","O2") }, @{ jogo="Q2"; fase="quartas"; origem=@("O3","O4") },
  @{ jogo="Q3"; fase="quartas"; origem=@("O5","O6") }, @{ jogo="Q4"; fase="quartas"; origem=@("O7","O8") },
  @{ jogo="S1"; fase="semis"; origem=@("Q1","Q2") },   @{ jogo="S2"; fase="semis"; origem=@("Q3","Q4") }
)

foreach ($entrada in $manifest.palpites) {
  $arq = $entrada.Trim(); if (-not $arq.EndsWith(".json")) { $arq += ".json" }
  $caminho = Join-Path $raiz "data\palpites\$arq"
  Write-Host ""
  Write-Host "--- $arq" -ForegroundColor Cyan
  if (-not (Test-Path $caminho)) { Falha "manifest aponta para arquivo inexistente"; continue }
  $p = Get-Content $caminho -Raw -Encoding UTF8 | ConvertFrom-Json
  $errosAntes = $erros

  foreach ($campo in @("id","modelo","modelo_id","desenvolvedor","data_palpite","metodologia")) {
    if (-not $p.$campo) { Falha "campo obrigatorio ausente: '$campo'" }
  }
  if ($p.id -and ($p.id -notmatch '^[a-z0-9]+([.-][a-z0-9]+)*$')) { Falha "id fora do padrao: '$($p.id)'" }
  if ($p.id -and ("$($p.id).json" -ne $arq)) { Falha "id '$($p.id)' nao bate com o nome do arquivo '$arq'" }

  # Cada jogo pode ser { vencedor, placar } (novo) ou so o codigo (legado, sem bonus)
  $semPlacar = @()
  function VencedorDe($valor) { if ($valor -is [string]) { return $valor } if ($valor) { return $valor.vencedor } return $null }
  function ChecarPlacar($rotulo, $valor) {
    if ($valor -is [string]) { $script:semPlacar += $rotulo; return }
    $placar = $valor.placar
    if (-not $placar) { $script:semPlacar += $rotulo; return }
    if ($placar -notmatch '^(\d+)\s*[xX]\s*(\d+)$') { Falha "$rotulo`: placar invalido '$placar' (formato NxN)"; return }
    $g1 = [int]$Matches[1]; $g2 = [int]$Matches[2]
    if ($g1 -lt $g2) { Falha "$rotulo`: o primeiro numero e o de gols do vencedor apostado ('$placar')"; return }
    $pen = $valor.penaltis
    if ($g1 -eq $g2) {
      # empate leva aos penaltis: campo obrigatorio, com vencedor na frente
      if (-not $pen) { Falha "$rotulo`: placar empatado ($placar) exige campo 'penaltis' com o placar da disputa (ex.: 4x2)"; return }
      if ($pen -notmatch '^(\d+)\s*[xX]\s*(\d+)$') { Falha "$rotulo`: penaltis invalido '$pen' (formato NxN)"; return }
      if ([int]$Matches[1] -le [int]$Matches[2]) { Falha "$rotulo`: penaltis deve ter o vencedor apostado na frente, sem empate ('$pen')" }
    } elseif ($pen) {
      Falha "$rotulo`: campo 'penaltis' so e usado com placar empatado (placar $placar)"
    }
  }

  $oit = $p.palpites.oitavas; $qua = $p.palpites.quartas; $sem = $p.palpites.semis
  $picks = @{}
  foreach ($o in @("O1","O2","O3","O4","O5","O6","O7","O8")) {
    $v = VencedorDe $oit.$o
    if ($codigos -notcontains $v) { Falha "oitavas.$o invalido: '$v'" }
    ChecarPlacar "oitavas.$o" $oit.$o
    $picks[$o] = $v
  }
  foreach ($r in $regras) {
    $obj = if ($r.fase -eq "quartas") { $qua } else { $sem }
    $valor = $obj.($r.jogo); $pick = VencedorDe $valor
    $permitidos = $r.origem | ForEach-Object { $picks[$_] }
    if ($permitidos -notcontains $pick) { Falha "chave inconsistente em $($r.jogo): '$pick' nao veio de $($r.origem -join '/')" }
    ChecarPlacar "$($r.fase).$($r.jogo)" $valor
    $picks[$r.jogo] = $pick
  }
  $campeao = $p.palpites.final.campeao
  if (@($picks["S1"], $picks["S2"]) -notcontains $campeao) { Falha "campeao '$campeao' nao e um dos finalistas" }
  ChecarPlacar "final" $p.palpites.final
  if ($semPlacar.Count -gt 0) {
    Write-Host "  !  $($semPlacar.Count) jogo(s) sem placar (formato antigo) -- sem chance de bonus: $($semPlacar -join ', ')" -ForegroundColor Yellow
  }

  if ($erros -eq $errosAntes) { Ok "palpite valido -- campeao: $campeao" }
  $analise = Join-Path $raiz "analises\$($p.id).html"
  if (Test-Path $analise) { Ok "site explicativo encontrado: analises/$($p.id).html" }
  else { Write-Host "  !  sem site explicativo (analises/$($p.id).html) -- o chip 'como decidi' nao aparece" -ForegroundColor Yellow }
}

Write-Host ""
if ($erros -gt 0) { Write-Host "RESULTADO: $erros problema(s) encontrado(s)" -ForegroundColor Red; exit 1 }
Write-Host "RESULTADO: tudo certo! Bolao consistente." -ForegroundColor Green
