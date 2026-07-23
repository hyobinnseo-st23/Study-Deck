# quizzes/ 폴더의 .json 파일들을 스캔해 quizzes/manifest.json 을 자동으로 다시 만듭니다.
# 사용법: 이 파일이 있는 폴더에서 PowerShell로  ./update-manifest.ps1  실행
# (실행이 막히면 한 번만:  powershell -ExecutionPolicy Bypass -File .\update-manifest.ps1 )

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$quizDir = Join-Path $root "quizzes"

if (-not (Test-Path $quizDir)) { Write-Error "quizzes 폴더를 찾을 수 없습니다: $quizDir"; exit 1 }

# manifest.json 을 제외한 .json 파일 목록 (파일명 기준 자연 정렬: day2 < day10)
$files = Get-ChildItem -Path $quizDir -Filter *.json |
  Where-Object { $_.Name -ne "manifest.json" } |
  Sort-Object { [regex]::Replace($_.Name, '\d+', { $args[0].Value.PadLeft(10, '0') }) } |
  Select-Object -ExpandProperty Name

# 각 파일이 올바른 JSON 인지 확인 (문제 있으면 목록에서 제외하고 경고)
$valid = @()
foreach ($f in $files) {
  try {
    $null = Get-Content (Join-Path $quizDir $f) -Raw -Encoding UTF8 | ConvertFrom-Json
    $valid += $f
  } catch {
    Write-Warning "JSON 형식 오류로 제외됨: $f"
  }
}

$manifest = [ordered]@{
  _comment = "이 파일은 update-manifest.ps1 (또는 GitHub Actions)가 quizzes/ 폴더를 스캔해 자동 생성합니다. 직접 수정하지 말고 스크립트를 다시 실행하세요."
  quizzes  = @($valid)
}

$json = $manifest | ConvertTo-Json -Depth 5
# BOM 없는 UTF-8 로 저장 (브라우저 JSON.parse 호환)
$out = Join-Path $quizDir "manifest.json"
[System.IO.File]::WriteAllText($out, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Host "manifest.json 갱신 완료 ($($valid.Count)개 파일):" -ForegroundColor Green
$valid | ForEach-Object { Write-Host "  - $_" }
