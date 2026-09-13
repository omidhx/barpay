# scripts/restore.ps1 — barnameh-pay Automated Database Restore
param(
  [Parameter(Mandatory=$true)]
  [string]$DumpFile,
  [string]$ContainerName = "barnameh-pay-db",
  [string]$DatabaseName = "barnameh_pay",
  [string]$DbUser = "postgres"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DumpFile)) {
  Write-Error "Backup file '$DumpFile' not found!"
  exit 1
}

Write-Host "Restoring database '$DatabaseName' from '$DumpFile'..." -ForegroundColor Yellow

# Copy dump into container
$containerDumpPath = "/tmp/restore.dump"
docker cp $DumpFile "${ContainerName}:${containerDumpPath}"

# Execute pg_restore
docker exec $ContainerName pg_restore -U $DbUser -d $DatabaseName --clean --if-exists --no-owner --no-privileges $containerDumpPath

# Remove temporary file
docker exec $ContainerName rm -f $containerDumpPath

Write-Host "Database restored successfully from $DumpFile." -ForegroundColor Green

# Verify row counts
$waybillCount = (docker exec $ContainerName psql -U $DbUser -d $DatabaseName -t -A -c "SELECT COUNT(*) FROM waybills;").Trim()
$orgCount = (docker exec $ContainerName psql -U $DbUser -d $DatabaseName -t -A -c "SELECT COUNT(*) FROM organizations;").Trim()

Write-Host "Verification: Organizations count = $orgCount | Waybills count = $waybillCount" -ForegroundColor Cyan
