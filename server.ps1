$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Listening on http://localhost:$port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        $request = $context.Request
        
        $localPath = $request.Url.LocalPath.TrimStart('/')
        if ($localPath -eq "") { $localPath = "index.html" }
        $localFilePath = Join-Path (Get-Location).Path $localPath

        if (Test-Path $localFilePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($localFilePath)
            $response.ContentLength64 = $content.Length
            if ($localFilePath.EndsWith(".html")) { $response.ContentType = "text/html" }
            elseif ($localFilePath.EndsWith(".jsx")) { $response.ContentType = "text/babel" }
            elseif ($localFilePath.EndsWith(".js")) { $response.ContentType = "application/javascript" }
            elseif ($localFilePath.EndsWith(".css")) { $response.ContentType = "text/css" }
            
            $response.OutputStream.Write($content, 0, $content.Length)
            Write-Host "200 OK: $localPath"
        } else {
            $response.StatusCode = 404
            Write-Host "404 Not Found: $localPath"
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
