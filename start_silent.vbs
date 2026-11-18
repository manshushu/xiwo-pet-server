Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
ws.CurrentDirectory = currentDir

' Release port 3001 if occupied by a previous process
ws.Run "powershell -NoProfile -WindowStyle Hidden -Command ""Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True

runtimeNode = currentDir & "\runtime\node.exe"
If fso.FileExists(runtimeNode) Then
    nodeCmd = """" & runtimeNode & """"
Else
    nodeCmd = "node"
End If

ws.Run "cmd.exe /c start """" /b " & nodeCmd & " src/server.js", 0, False
WScript.Sleep 1200
ws.Run "http://localhost:3001/student"
ws.Run "http://localhost:3001/teacher"
