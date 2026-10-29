Set oWS = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get root directory from argument or parent folder
If WScript.Arguments.Count > 0 Then
    strRoot = WScript.Arguments(0)
    If Right(strRoot, 1) = "\" Then strRoot = Left(strRoot, Len(strRoot) - 1)
Else
    strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
    strRoot = fso.GetParentFolderName(strScriptDir)
End If

strDesktop = oWS.SpecialFolders("Desktop")
strShortcut = strDesktop & "\DenemeLab.lnk"
strTarget = strRoot & "\DenemeLab_Baslat.bat"

' Fallback target if DenemeLab_Baslat.bat does not exist
If Not fso.FileExists(strTarget) Then
    strTarget = strRoot & "\DenemeLab Başlat.bat"
End If

Set oLink = oWS.CreateShortcut(strShortcut)
oLink.TargetPath = strTarget
oLink.WorkingDirectory = strRoot
oLink.IconLocation = oWS.ExpandEnvironmentStrings("%SystemRoot%\System32\imageres.dll,189")
oLink.Description = "DenemeLab - Sınav ve Deneme Analizi"
oLink.Save

If fso.FileExists(strShortcut) Then
    WScript.Echo "OK: " & strShortcut
    WScript.Quit 0
Else
    WScript.Echo "FAIL"
    WScript.Quit 1
End If

