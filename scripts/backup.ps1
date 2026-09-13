# scripts/backup.ps1 — barnameh-pay Automated Database Backup
param(
  [string]$ContainerName = "barnameh-pay-db",
  [string]$DatabaseName = "barnameh_pay",
  [string]$DbUser = "postgres",
  [string]$BackupDir = "backups"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpFile = "$BackupDir/backup-$timestamp.dump"
$metaFile = "$BackupDir/backup-$timestamp.json"

Write-Host "Creating backup of database '$DatabaseName' from container '$ContainerName'..." -ForegroundColor Cyan

# 1. Execute pg_dump -Fc inside container and copy to host to prevent text-encoding issues
$containerDump = "/tmp/backup-$timestamp.dump"
docker exec $ContainerName pg_dump -U $DbUser -d $DatabaseName -Fc -f $containerDump
docker cp "${ContainerName}:${containerDump}" $dumpFile
docker exec $ContainerName rm -f $containerDump

if ((Get-Item $dumpFile).Length -eq 0) {
  Write-Error "Backup file is empty! Backup failed."
  exit 1
}

Write-Host "Backup created successfully: $dumpFile ($( [math]::Round((Get-Item $dumpFile).Length / 1KB, 2) ) KB)" -ForegroundColor Green

# 2. Record row counts and metadata
$waybillCount = (docker exec $ContainerName psql -U $DbUser -d $DatabaseName -t -A -c "SELECT COUNT(*) FROM waybills;").Trim()
$orgCount = (docker exec $ContainerName psql -U $DbUser -d $DatabaseName -t -A -c "SELECT COUNT(*) FROM organizations;").Trim()
$auditCount = (docker exec $ContainerName psql -U $DbUser -d $DatabaseName -t -A -c "SELECT COUNT(*) FROM audit_logs;").Trim()

$sha256 = (Get-FileHash -Path $dumpFile -Algorithm SHA256).Hash

$metadata = [PSCustomObject]@{
  timestamp = $timestamp
  dumpFile = $dumpFile
  sha256 = $sha256
  database = $DatabaseName
  waybillCount = [int]$waybillCount
  orgCount = [int]$orgCount
  auditCount = [int]$auditCount
}

$metadata | ConvertTo-Json -Depth 4 | Out-File -FilePath $metaFile -Encoding utf8
Write-Host "Backup metadata saved: $metaFile" -ForegroundColor Green
