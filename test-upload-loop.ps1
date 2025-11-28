# Test script: Uploads 5 different CSV files, one per minute
# Usage: .\test-upload-loop.ps1 -Password "your-password" -Url "https://csv-storage-service.onrender.com/upload"

param(
    [Parameter(Mandatory=$true)]
    [string]$Password,
    
    [Parameter(Mandatory=$false)]
    [string]$Url = "https://csv-storage-service.onrender.com/upload"
)

$testFiles = @(
    "test-data\test-1.csv",
    "test-data\test-2.csv",
    "test-data\test-3.csv",
    "test-data\test-4.csv",
    "test-data\test-5.csv"
)

Write-Host "🧪 Starting 5-minute test cycle..." -ForegroundColor Cyan
Write-Host "   Uploading 5 different CSV files, one per minute" -ForegroundColor Gray
Write-Host "   Watch your Notion page to see the changes!" -ForegroundColor Yellow
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $Password"
}

for ($i = 0; $i -lt $testFiles.Count; $i++) {
    $file = $testFiles[$i]
    $testNumber = $i + 1
    
    if (-not (Test-Path $file)) {
        Write-Host "❌ File not found: $file" -ForegroundColor Red
        continue
    }
    
    Write-Host "📤 [Test $testNumber/5] Uploading $file..." -ForegroundColor Cyan
    
    try {
        $response = Invoke-RestMethod -Uri $Url -Method Post -Headers $headers -InFile $file -ContentType "text/csv"
        Write-Host "   ✅ Uploaded successfully!" -ForegroundColor Green
        Write-Host "   ⏰ Waiting 1 minute for sync service to pick it up..." -ForegroundColor Yellow
        
        if ($i -lt $testFiles.Count - 1) {
            # Wait 60 seconds (1 minute) before next upload
            Start-Sleep -Seconds 60
            Write-Host ""
        } else {
            Write-Host "   ✨ Test complete! Check your Notion page for all 5 updates." -ForegroundColor Green
        }
    } catch {
        Write-Host "   ❌ Upload failed:" -ForegroundColor Red
        Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "🎉 All tests completed!" -ForegroundColor Green

