param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path $projectRoot 'deliverables\mersal-media-expo.zip' }
$archivePath = [System.IO.Path]::GetFullPath($OutputPath)
if (-not $archivePath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'The archive output must stay inside the project directory.' }
if ([System.IO.Path]::GetExtension($archivePath) -ne '.zip') { throw 'The archive output must end in .zip.' }
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($archivePath)) | Out-Null
$topFiles = @('App.tsx', 'index.ts', 'app.json', 'package.json', 'package-lock.json', 'tsconfig.json', '.gitignore', 'README.md', 'INTEGRATION.md', 'DESIGN_AUDIT.md', 'VALIDATION.md', 'backend/api.ts', 'backend/server.ts', 'backend/README.md', 'backend/store.ts', 'backend/sqlite.ts', 'backend/atlas-server.ts', 'backend/mongo.ts', 'backend/drive.ts', 'backend/mongoModels.ts', 'server.ts', 'vercel.json', '.env.example')
$sourceDirectories = @('src', 'assets', 'scripts', 'tests', 'design-reference')
$fileList = [System.Collections.Generic.List[string]]::new()
foreach ($name in $topFiles) {
  $sourcePath = Join-Path $projectRoot $name
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Required project file missing: $name" }
  $fileList.Add($sourcePath)
}
foreach ($folder in $sourceDirectories) {
  $directoryPath = Join-Path $projectRoot $folder
  foreach ($file in (Get-ChildItem -LiteralPath $directoryPath -File -Recurse)) { $fileList.Add($file.FullName) }
}
$archiveStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite)
$archive = [System.IO.Compression.ZipArchive]::new($archiveStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
try {
  foreach ($sourcePath in $fileList) {
    $entryName = 'mersal-media/' + $sourcePath.Substring($projectRoot.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $sourcePath, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose(); $archiveStream.Dispose() }
Write-Output "Created $archivePath ($($fileList.Count) source/reference files; node_modules, dist, device data, and build caches excluded)."
