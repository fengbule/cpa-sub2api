$port = 4173
$url = "http://127.0.0.1:$port"

Write-Host "Starting local WebUI at $url" -ForegroundColor Green
Start-Process $url
$env:PORT = "$port"
node .\serve.mjs
