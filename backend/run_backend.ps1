Get-Content .env | ForEach-Object {
    if ($_ -match '^(.*?)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}
[Environment]::SetEnvironmentVariable("SERVER_PORT", "8081")
.\mvnw.cmd spring-boot:run
