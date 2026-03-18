param(
  [string]$Version = "latest"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repo = if ($env:RUSTCLOUD_REPO) { $env:RUSTCLOUD_REPO } else { "Vegetog/RustCloud" }
$installDir = if ($env:RUSTCLOUD_DIR) { $env:RUSTCLOUD_DIR } else { Join-Path $HOME "rustcloud" }
$token = if ($env:RUSTCLOUD_GITHUB_TOKEN) { $env:RUSTCLOUD_GITHUB_TOKEN } else { $env:GITHUB_TOKEN }
$ref = if ($Version -eq "latest") { "main" } else { $Version }

$ownerDefault = ($repo.Split('/')[0]).ToLowerInvariant()

function Write-Info([string]$Message) {
  Write-Host "[INFO] $Message"
}

function Write-ErrorAndExit([string]$Message) {
  Write-Host "[ERROR] $Message"
  exit 1
}

function Download-RepoFile {
  param(
    [Parameter(Mandatory = $true)][string]$RepoPath,
    [Parameter(Mandatory = $true)][string]$OutputFile
  )

  if ($token) {
    $apiUrl = "https://api.github.com/repos/$repo/contents/$RepoPath?ref=$ref"
    $headers = @{
      Authorization = "Bearer $token"
      Accept = "application/vnd.github.raw"
    }
    Invoke-WebRequest -Uri $apiUrl -Headers $headers -OutFile $OutputFile | Out-Null
    return
  }

  $rawUrl = "https://raw.githubusercontent.com/$repo/$ref/$RepoPath"
  try {
    Invoke-WebRequest -Uri $rawUrl -OutFile $OutputFile | Out-Null
  }
  catch {
    Write-ErrorAndExit "Failed to download $RepoPath from $rawUrl. If the repository is private, set GITHUB_TOKEN or RUSTCLOUD_GITHUB_TOKEN and retry."
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-ErrorAndExit "Docker is not installed."
}

docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
  Write-ErrorAndExit "Docker Compose v2 is required (docker compose)."
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Set-Location $installDir

Write-Info "Downloading deployment files from $repo ..."
Download-RepoFile -RepoPath "docker-compose.prod.yml" -OutputFile "docker-compose.yml"

if (-not (Test-Path ".env.prod")) {
  Download-RepoFile -RepoPath ".env.prod.example" -OutputFile ".env.prod"
  Write-Info "Created .env.prod from template."
}

$envContent = Get-Content ".env.prod" -Raw

if ($envContent -match "(?m)^IMAGE_TAG=") {
  $envContent = [regex]::Replace($envContent, "(?m)^IMAGE_TAG=.*$", "IMAGE_TAG=$Version")
}
else {
  $trimmed = $envContent.TrimEnd("`r", "`n")
  $envContent = "$trimmed`r`nIMAGE_TAG=$Version`r`n"
}

if ($envContent -match "(?m)^IMAGE_OWNER=(.*)$") {
  $currentOwner = $Matches[1].Trim()
  $normalizedOwner = $currentOwner.ToLowerInvariant()
  $envContent = [regex]::Replace($envContent, "(?m)^IMAGE_OWNER=.*$", "IMAGE_OWNER=$normalizedOwner")
}
else {
  $trimmed = $envContent.TrimEnd("`r", "`n")
  $envContent = "$trimmed`r`nIMAGE_OWNER=$ownerDefault`r`n"
}

Set-Content -Path ".env.prod" -Value $envContent -NoNewline

Write-Info "Pulling images (tag: $Version) ..."
docker compose --env-file .env.prod pull
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Info "Starting services ..."
docker compose --env-file .env.prod up -d
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$publicPort = if ($env:PUBLIC_PORT) { $env:PUBLIC_PORT } else { "80" }
Write-Host "[DONE] RustCloud is running."
Write-Host "[INFO] Open: http://localhost:$publicPort"
Write-Host "[INFO] Please edit .env.prod and replace all CHANGE_ME values in production."
