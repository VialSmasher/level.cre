[CmdletBinding()]
param([string]$Python)

$ErrorActionPreference = 'Stop'
if (-not $Python) {
    $Python = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (-not (Test-Path -LiteralPath $Python)) { $Python = (Get-Command python.exe -ErrorAction Stop).Source }
}
& $Python -c "import tomllib"
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 or later is needed.' }
$script = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'desk_sync_worker.py')).Path
$pythonw = Join-Path (Split-Path -Parent $Python) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $pythonw)) { throw 'The background Python executable is missing.' }
$directory = Join-Path $env:LOCALAPPDATA 'Level CRE\Daily Desk Sync'
[void][System.IO.Directory]::CreateDirectory($directory)
$installed = Join-Path $directory 'desk_sync_worker.py'
Copy-Item -LiteralPath $script -Destination $installed -Force
if ((Get-FileHash -LiteralPath $installed).Hash -ne (Get-FileHash -LiteralPath $script).Hash) { throw 'Worker copy did not verify.' }
$action = New-ScheduledTaskAction -Execute $pythonw -Argument ('"' + $installed + '"')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(10) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName 'Level CRE Daily Desk Sync' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Select-Object TaskName,State
