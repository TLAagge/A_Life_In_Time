[CmdletBinding()]
param(
	[string]$IncomingRoot = "quarantine/incoming",
	[string]$ArchiveRoot = "quarantine/archive",
	[string]$ImagesRoot = "images",
	[switch]$KeepOriginals
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-MonthLabel {
	param([string]$Month)

	$map = @{
		'01'='January'; '02'='February'; '03'='March'; '04'='April';
		'05'='May'; '06'='June'; '07'='July'; '08'='August';
		'09'='September'; '10'='October'; '11'='November'; '12'='December'
	}

	if ($map.ContainsKey($Month)) {
		return $map[$Month]
	}

	return $Month
}

function Get-ThumbRelativePath {
	param([string]$RelativeImagePath)

	if ($RelativeImagePath -notmatch '^images\/') {
		return $null
	}

	$baseWithoutExt = [System.IO.Path]::ChangeExtension($RelativeImagePath, $null).TrimEnd('.')
	return ($baseWithoutExt -replace '^images\/', 'images/.thumbs/') + '.jpg'
}

function Ensure-Thumbnails {
	param(
		[string]$ProjectRoot,
		[string]$ImagesPath,
		[string]$ThumbsPath,
		$MagickCommand
	)

	if (-not $MagickCommand) {
		Write-Output 'Skipping thumbnail generation (ImageMagick not available).'
		return 0
	}

	$created = 0
	$sourceImages = @(
		Get-ChildItem -Path $ImagesPath -Recurse -File |
			Where-Object {
				$_.Extension -match '^\.(jpg|jpeg|png|webp)$' -and
				$_.FullName -notlike (Join-Path $ThumbsPath '*')
			}
	)

	foreach ($image in $sourceImages) {
		$rel = $image.FullName.Substring($ProjectRoot.Length + 1) -replace '\\', '/'
		$thumbRel = Get-ThumbRelativePath -RelativeImagePath $rel
		if (-not $thumbRel) {
			continue
		}

		$thumbFull = Join-Path $ProjectRoot ($thumbRel -replace '/', '\\')
		$thumbDir = Split-Path -Parent $thumbFull
		New-Item -ItemType Directory -Force -Path $thumbDir | Out-Null

		if (-not (Test-Path $thumbFull)) {
			magick $image.FullName -auto-orient -resize '1400x1400>' -quality 82 $thumbFull
			$created += 1
		}
	}

	return $created
}

function Sync-PhotosJson {
	param(
		[string]$ProjectRoot,
		[string]$ImagesPath,
		[string]$ThumbsPath,
		[string]$JsonPath
	)

	$existing = @{}
	if (Test-Path $JsonPath) {
		$raw = Get-Content $JsonPath -Raw
		if ($raw.Trim()) {
			$obj = $raw | ConvertFrom-Json
			if ($obj.timeline) {
				foreach ($item in $obj.timeline) {
					$existing[$item.path] = $item
				}
			}
		}
	}

	$items = Get-ChildItem -Path $ImagesPath -Recurse -File |
		Where-Object {
			$_.Extension -match '^\.(jpg|jpeg|png|webp)$' -and
			$_.FullName -notlike (Join-Path $ThumbsPath '*')
		} |
		ForEach-Object {
			$rel = $_.FullName.Substring($ProjectRoot.Length + 1) -replace '\\', '/'
			$thumbRel = Get-ThumbRelativePath -RelativeImagePath $rel
			$thumbFull = if ($thumbRel) { Join-Path $ProjectRoot ($thumbRel -replace '/', '\\') } else { '' }
			$prev = $existing[$rel]

			if ($prev -and $prev.description) {
				$desc = [string]$prev.description
			}
			elseif ($rel -match '^images\/(\d{4})\/(\d{2})\/') {
				$year = $Matches[1]
				$month = $Matches[2]
				$desc = "$(Get-MonthLabel -Month $month) $year"
			}
			else {
				$desc = 'Unknown date'
			}

			$show = if ($prev -and $null -ne $prev.showOnIndex) { [bool]$prev.showOnIndex } else { $false }

			[PSCustomObject]@{
				filename    = $_.Name
				path        = $rel
				thumbPath   = if ($thumbRel -and (Test-Path $thumbFull)) { $thumbRel } else { '' }
				description = $desc
				showOnIndex = $show
			}
		} |
		Sort-Object path

	if (($items | Where-Object { $_.showOnIndex }).Count -eq 0 -and $items.Count -gt 0) {
		$items[0].showOnIndex = $true
	}

	[PSCustomObject]@{ timeline = $items } |
		ConvertTo-Json -Depth 6 |
		Set-Content $JsonPath

	return $items.Count
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$incomingPath = Join-Path $projectRoot $IncomingRoot
$archivePath = Join-Path $projectRoot $ArchiveRoot
$imagesPath = Join-Path $projectRoot $ImagesRoot
$thumbsPath = Join-Path $imagesPath '.thumbs'
$jsonPath = Join-Path $projectRoot 'photos.json'

if (-not (Test-Path $incomingPath)) {
	throw "Incoming folder not found: $incomingPath"
}

New-Item -ItemType Directory -Force -Path $archivePath | Out-Null
New-Item -ItemType Directory -Force -Path $imagesPath | Out-Null
New-Item -ItemType Directory -Force -Path $thumbsPath | Out-Null

$magick = Get-Command magick -ErrorAction SilentlyContinue
if (-not $magick) {
	$magickExe = Get-ChildItem 'C:\Program Files\ImageMagick-*\magick.exe' -ErrorAction SilentlyContinue |
		Sort-Object LastWriteTime -Descending |
		Select-Object -First 1

	if ($magickExe) {
		$env:Path += ';' + $magickExe.DirectoryName
		$magick = Get-Command magick -ErrorAction SilentlyContinue
	}
}

$allFiles = @(
	Get-ChildItem -Path $incomingPath -Recurse -File |
		Where-Object { $_.Extension -match '^\.(heic|jpg|jpeg|png|webp)$' }
)

if (-not $allFiles.Count) {
	Write-Output "No supported files found in $incomingPath"
}

$convertedHeic = 0
$copiedWeb = 0
$skipped = 0

foreach ($file in $allFiles) {
	$relative = $file.FullName.Substring($incomingPath.Length).TrimStart('\')
	$parts = ($relative -replace '\\', '/').Split('/')

	if ($parts.Count -lt 3) {
		$skipped += 1
		continue
	}

	$year = $parts[0]
	$month = $parts[1]

	if ($year -notmatch '^\d{4}$' -or $month -notmatch '^\d{2}$') {
		$skipped += 1
		continue
	}

	$destDir = Join-Path (Join-Path $imagesPath $year) $month
	New-Item -ItemType Directory -Force -Path $destDir | Out-Null

	$destPath = ''
	if ($file.Extension -match '^\.(heic|HEIC)$') {
		if (-not $magick) {
			throw 'ImageMagick is required to convert HEIC files. Install with: winget install ImageMagick.ImageMagick'
		}

		$destPath = Join-Path $destDir ($file.BaseName + '.jpg')
		if (-not (Test-Path $destPath)) {
			magick $file.FullName -auto-orient -quality 92 $destPath
		}
		$convertedHeic += 1
	}
	else {
		$destPath = Join-Path $destDir $file.Name
		if (-not (Test-Path $destPath)) {
			Copy-Item -Path $file.FullName -Destination $destPath
		}
		$copiedWeb += 1
	}

	if (-not $KeepOriginals) {
		$archiveDest = Join-Path $archivePath $relative
		$archiveDestDir = Split-Path -Parent $archiveDest
		New-Item -ItemType Directory -Force -Path $archiveDestDir | Out-Null

		if (-not (Test-Path $archiveDest)) {
			Move-Item -Path $file.FullName -Destination $archiveDest
		}
		else {
			Remove-Item -Path $file.FullName -Force
		}
	}
}

$createdThumbs = Ensure-Thumbnails -ProjectRoot $projectRoot -ImagesPath $imagesPath -ThumbsPath $thumbsPath -MagickCommand $magick

$totalWeb = Sync-PhotosJson -ProjectRoot $projectRoot -ImagesPath $imagesPath -ThumbsPath $thumbsPath -JsonPath $jsonPath

Write-Output "Import complete."
Write-Output "Converted HEIC: $convertedHeic"
Write-Output "Copied web-ready files: $copiedWeb"
Write-Output "Created thumbnails: $createdThumbs"
Write-Output "Skipped (wrong folder structure): $skipped"
Write-Output "Total web images indexed: $totalWeb"
Write-Output "Expected incoming structure: quarantine/incoming/YYYY/MM/<files>"
