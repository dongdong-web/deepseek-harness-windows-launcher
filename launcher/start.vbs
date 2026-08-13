Option Explicit

Dim fileSystem, shell, launcherRoot, nodeExecutable, launcherScript, command
Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

launcherRoot = fileSystem.GetParentFolderName(fileSystem.GetParentFolderName(WScript.ScriptFullName))
nodeExecutable = launcherRoot & "\runtime\node\node.exe"
launcherScript = launcherRoot & "\launcher\launcher.mjs"
command = Chr(34) & nodeExecutable & Chr(34) & " " & Chr(34) & launcherScript & Chr(34) & " start"

shell.CurrentDirectory = launcherRoot
shell.Run command, 0, False
