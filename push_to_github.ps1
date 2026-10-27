# ==============================================================================
# ATC VISION - SCRIPT SEGURO DE ENVIO (PUSH) PARA O GITHUB (POWERSHELL)
# ==============================================================================

[CmdletBinding()]
param(
    [string]$CommitMessage = "feat: implantacao e atualizacao do sistema ATC Vision Full-Stack",
    [switch]$Force
)

$ErrorActionPreference = "Continue"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "       ATC VISION - ENVIO SEGURO PARA O REPOSITORIO GITHUB                    " -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar se o arquivo .env existe
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "[ERRO CRITICO] Arquivo .env nao encontrado na raiz do projeto!" -ForegroundColor Red
    Write-Host "Crie o arquivo .env a partir de .env.example e preencha suas variaveis." -ForegroundColor Yellow
    exit 1
}

# 2. Carregar variaveis do .env com seguranca (parsing linha por linha)
$envLines = Get-Content $envFile -Encoding UTF8
$repoUrl = ""
$username = ""
$token = ""
$branch = "main"

foreach ($line in $envLines) {
    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#") -or [string]::IsNullOrWhiteSpace($trimmed)) { continue }
    if ($trimmed -match '^GITHUB_REPO_URL\s*=\s*(.+)$') { 
        $repoUrl = $matches[1].Trim().Trim('"').Trim("'") 
    }
    elseif ($trimmed -match '^GITHUB_USERNAME\s*=\s*(.+)$') { 
        $username = $matches[1].Trim().Trim('"').Trim("'") 
    }
    elseif ($trimmed -match '^GITHUB_TOKEN\s*=\s*(.+)$') { 
        $token = $matches[1].Trim().Trim('"').Trim("'") 
    }
    elseif ($trimmed -match '^GITHUB_BRANCH\s*=\s*(.+)$') { 
        $branch = $matches[1].Trim().Trim('"').Trim("'") 
    }
}

# 3. Validacao dos campos obrigatorios
if ([string]::IsNullOrWhiteSpace($repoUrl) -or ($repoUrl -like '*SEU_USUARIO*')) {
    Write-Host "[ERRO] GITHUB_REPO_URL nao configurado corretamente no .env!" -ForegroundColor Red
    Write-Host "Defina a URL completa do seu repositorio no .env (ex: https://github.com/usuario/ATC_Vision.git)" -ForegroundColor Yellow
    exit 1
}

if ([string]::IsNullOrWhiteSpace($token) -or ($token -like '*ghp_SEU_TOKEN*')) {
    Write-Host "[ERRO] GITHUB_TOKEN nao configurado no .env!" -ForegroundColor Red
    Write-Host "Gere um Personal Access Token (PAT) no GitHub com escopo 'repo' e cole no .env" -ForegroundColor Yellow
    Write-Host "Acesse: https://github.com/settings/tokens" -ForegroundColor Cyan
    exit 1
}

if ([string]::IsNullOrWhiteSpace($username) -or ($username -like '*SEU_USUARIO*')) {
    if ($repoUrl -match 'github\.com/([^/]+)/') {
        $username = $matches[1]
    } else {
        $username = "git"
    }
}

# 4. Verificacao de Seguranca Anti-Vazamento (Zero-Leakage Check)
Write-Host "[1/5] Executando auditoria de seguranca anti-vazamento..." -ForegroundColor Blue

# 4.1 Verificar se .gitignore existe e ignora o .env
$ignored = & git check-ignore .env 2>$null
if (-not $ignored) {
    Write-Host "[ERRO DE SEGURANCA MAXIMA] O arquivo .env NAO esta protegido pelo .gitignore!" -ForegroundColor Red
    Write-Host "Abortando imediatamente para prevenir vazamento de credenciais na nuvem." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] O arquivo .env esta rigorosamente protegido pelo .gitignore." -ForegroundColor Green

# 4.2 Verificar se .env foi acidentalmente rastreado pelo Git
$trackedEnv = & git ls-files .env 2>$null
if ($trackedEnv) {
    Write-Host "  [ALERTA] .env foi rastreado anteriormente! Removendo do indice do Git..." -ForegroundColor Yellow
    & git rm --cached .env 2>$null
}

# 5. Inicializacao e configuracao do Git
Write-Host "[2/5] Verificando repositorio Git local..." -ForegroundColor Blue
if (-not (Test-Path (Join-Path $PSScriptRoot ".git"))) {
    & git init -b $branch
    Write-Host "  [OK] Repositorio Git inicializado na branch '$branch'." -ForegroundColor Green
} else {
    & git branch -M $branch 2>$null
}

# 6. Configurar o Remote Origin com a URL LIMPA (sem token embutido!)
# Isso garante que quem inspecionar .git/config JAMAIS vera seu token.
$cleanRepoUrl = $repoUrl -replace 'https://[^@]+@', 'https://'
$remotes = git remote
if ($remotes -contains 'origin') {
    git remote set-url origin $cleanRepoUrl
} else {
    git remote add origin $cleanRepoUrl
}
Write-Host "  [OK] Remoto 'origin' apontado para: $cleanRepoUrl" -ForegroundColor Green
Write-Host "  [OK] Credenciais NAO foram salvas em .git/config (protecao total)." -ForegroundColor Green

# 7. Preparar arquivos para commit (git add)
Write-Host "[3/5] Indexando arquivos permitidos..." -ForegroundColor Blue
& git add .

# 8. Verificacao final de staged files para garantir que nenhum segredo escapou
$stagedFiles = & git diff --name-only --cached
$leakDetected = $false
foreach ($file in $stagedFiles) {
    if ($file -match '^\.env' -and $file -ne '.env.example') {
        Write-Host "[ERRO CRITICO] Arquivo de segredo detectado na area de stage: $file" -ForegroundColor Red
        $leakDetected = $true
    }
}

if ($leakDetected) {
    Write-Host "Cancelando envio. Remova os arquivos sensiveis antes de continuar." -ForegroundColor Red
    & git reset
    exit 1
}

# 9. Realizar o Commit
Write-Host "[4/5] Criando commit..." -ForegroundColor Blue
$status = & git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "  [INFO] Nenhuma alteracao pendente para commit." -ForegroundColor Yellow
} else {
    & git commit -m "$CommitMessage"
    Write-Host "  [OK] Commit realizado com sucesso." -ForegroundColor Green
}

# 10. Realizar o Push usando autenticacao segura em memoria
Write-Host "[5/5] Enviando para o GitHub ($branch)..." -ForegroundColor Blue

$cleanHostPath = $cleanRepoUrl -replace '^https?://', ''
$pushUrl = "https://${username}:${token}@${cleanHostPath}"

try {
    if ($Force) {
        & git push --force $pushUrl $branch
    } else {
        & git push -u $pushUrl $branch
    }
    
    # Sanitiza o .git/config para garantir que o remote gravado seja apenas 'origin'
    & git config "branch.$branch.remote" origin
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "==============================================================================" -ForegroundColor Green
        Write-Host "       [SUCESSO] PROJETO ENVIADO COM SUCESSO PARA O GITHUB!                   " -ForegroundColor Green
        Write-Host "==============================================================================" -ForegroundColor Green
        Write-Host "Repositorio: $cleanRepoUrl" -ForegroundColor Cyan
        Write-Host "Branch:      $branch" -ForegroundColor Cyan
        Write-Host "Seguranca:   Credenciais mantidas 100% seguras no arquivo local .env" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[ERRO NO PUSH] O Git retornou codigo de erro $LASTEXITCODE." -ForegroundColor Red
        Write-Host "Dica: se o repositorio remoto contiver commits previos, use:" -ForegroundColor Yellow
        Write-Host "  .\push_to_github.ps1 -Force" -ForegroundColor Yellow
    }
} finally {
    $token = $null
    $pushUrl = $null
    [System.GC]::Collect()
}
