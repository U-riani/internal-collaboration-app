$ErrorActionPreference = 'Stop'

$oldRegistry = 'https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public'
$newRegistry = 'https://registry.npmjs.org'

Write-Host 'Setting npm to use the public npm registry...' -ForegroundColor Cyan
npm config set registry "$newRegistry/"

Write-Host 'Updating package-lock.json files...' -ForegroundColor Cyan
Get-ChildItem -Path $PSScriptRoot -Recurse -Filter package-lock.json | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName)
    $updated = $content.Replace($oldRegistry, $newRegistry)
    [System.IO.File]::WriteAllText(
        $_.FullName,
        $updated,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host "Updated: $($_.FullName)"
}

$remaining = Get-ChildItem -Path $PSScriptRoot -Recurse -Filter package-lock.json |
    Select-String -Pattern 'applied-caas-gateway1.internal.api.openai.org'

if ($remaining) {
    throw 'An internal registry URL still exists in a package-lock.json file.'
}

Write-Host 'Registry fix completed.' -ForegroundColor Green
Write-Host 'Then run: npm run install:all' -ForegroundColor Yellow
Write-Host 'Start development: npm run dev' -ForegroundColor Yellow
