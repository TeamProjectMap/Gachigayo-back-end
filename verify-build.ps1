$ErrorActionPreference = 'Stop'
$priorJavaHome = $env:JAVA_HOME
$priorJavaOptions = $env:JAVA_TOOL_OPTIONS
try {
    $jdkPath = 'C:\Users\data8320-23\.jdks\ms-17.0.20.1'
    if (-not (Test-Path -LiteralPath "$jdkPath\bin\java.exe")) {
        throw 'JDK 17 path must be updated in verify-build.ps1.'
    }
    $env:JAVA_HOME = $jdkPath
    $env:JAVA_TOOL_OPTIONS = "$priorJavaOptions -Djdk.net.unixdomain.tmpdir=C:\Temp".Trim()
    Push-Location $PSScriptRoot
    try {
        & .\gradlew.bat build --no-daemon --console=plain
        $buildExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
} finally {
    $env:JAVA_HOME = $priorJavaHome
    $env:JAVA_TOOL_OPTIONS = $priorJavaOptions
}
exit $buildExitCode
