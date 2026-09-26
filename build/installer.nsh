!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var DudeCustomize
Var DudePreset
Var DudePreviousPreset
Var DudeStart
Var DudeDesktop
Var DudeLogin
Var DudeUpdates
Var DudeExplorer
Var DudeFolders
Var DudeProtocol
Var DudeMask
Var DudeMinimalRadio
Var DudeStandardRadio
Var DudeIntegratedRadio
Var DudeCustomizeCheck
Var DudePathControl
Var DudeStartCheck
Var DudeDesktopCheck
Var DudeLoginCheck
Var DudeAutoRadio
Var DudeNotifyRadio
Var DudeManualRadio
Var DudeExplorerCheck
Var DudeFoldersCheck
Var DudeProtocolCheck
Var DudeExt0
Var DudeExt1
Var DudeExt2
Var DudeExt3
Var DudeExt4
Var DudeExt5
Var DudeExt6
Var DudeExt7
Var DudeExt8
Var DudeExt9
Var DudeExt10
Var DudeExt11
Var DudeExt12
Var DudeExt13
!endif

!ifndef BUILD_UNINSTALLER
!macro customInit
  Call DudeLoadOptions
!macroend

!macro customWelcomePage
  Page custom DudeWelcomeCreate DudeWelcomeLeave
!macroend

!macro customInstallmode
  ${If} $DudeCustomize != "1"
    ${If} $DudePreset == "Integrated"
      StrCpy $isForceMachineInstall "1"
    ${Else}
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom DudePathCreate DudePathLeave
  Page custom DudeOptionsCreate DudeOptionsLeave
  Page custom DudeExplorerCreate DudeExplorerLeave
  Page custom DudeReviewCreate
Function DudeReviewCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 16u "Ready to install DUDE."
  Pop $0
  ${NSD_CreateLabel} 0 20u 100% 13u "Preset: $DudePreset"
  Pop $0
  StrCpy $1 "Current user"
  ${If} $installMode == "all"
    StrCpy $1 "All users"
  ${EndIf}
  ${NSD_CreateLabel} 0 35u 100% 13u "Install for: $1"
  Pop $0
  ${NSD_CreateLabel} 0 50u 100% 13u "Location: $INSTDIR"
  Pop $0
  StrCpy $3 "No"
  StrCpy $4 "No"
  StrCpy $5 "No"
  StrCpy $6 "No"
  StrCpy $7 "No"
  ${If} $DudeStart == "1"
    StrCpy $3 "Yes"
  ${EndIf}
  ${If} $DudeDesktop == "1"
    StrCpy $4 "Yes"
  ${EndIf}
  ${If} $DudeExplorer == "1"
    StrCpy $5 "Yes"
  ${EndIf}
  ${If} $DudeFolders == "1"
    StrCpy $6 "Yes"
  ${EndIf}
  ${If} $DudeProtocol == "1"
    StrCpy $7 "Yes"
  ${EndIf}
  ${NSD_CreateLabel} 0 65u 100% 13u "Start shortcut: $3    Desktop shortcut: $4"
  Pop $0
  ${NSD_CreateLabel} 0 80u 100% 13u "Explorer action: $5    Folder action: $6    Deep links: $7"
  Pop $0
  ${NSD_CreateLabel} 0 95u 100% 13u "Update mode: $DudeUpdates"
  Pop $0
  StrCpy $2 ""
  !insertmacro DudeForEachExtension DudeAppendReview
  ${If} $2 == ""
    StrCpy $2 "None"
  ${EndIf}
  ${NSD_CreateLabel} 0 110u 100% 27u "Registered file types: $2"
  Pop $0
  ${NSD_CreateLabel} 0 142u 100% 25u "Selected file types become candidates in Windows Default Apps. Windows will ask you to confirm each default. You can change app preferences in DUDE guided setup."
  Pop $0
  nsDialogs::Show
FunctionEnd
!macroend

!macro customInstall
  Call DudeInstallOptions
!macroend

!endif

!macro customUnInstall
  Call un.DudeRemoveOptions
!macroend

!ifndef BUILD_UNINSTALLER
Function DudeApplyPreset
  StrCpy $DudeStart "1"
  StrCpy $DudeDesktop "0"
  StrCpy $DudeLogin "0"
  StrCpy $DudeUpdates "manual"
  StrCpy $DudeExplorer "0"
  StrCpy $DudeFolders "0"
  StrCpy $DudeProtocol "0"
  StrCpy $DudeMask 0
  ${If} $DudePreset == "Standard"
    StrCpy $DudeDesktop "1"
    StrCpy $DudeExplorer "1"
    StrCpy $DudeFolders "1"
    StrCpy $DudeProtocol "1"
    StrCpy $DudeUpdates "notify"
  ${ElseIf} $DudePreset == "Integrated"
    StrCpy $DudeDesktop "1"
    StrCpy $DudeLogin "1"
    StrCpy $DudeExplorer "1"
    StrCpy $DudeFolders "1"
    StrCpy $DudeProtocol "1"
    StrCpy $DudeMask 16383
    StrCpy $DudeUpdates "auto-download"
  ${EndIf}
FunctionEnd

Function DudeLoadOptions
  StrCpy $DudePreset "Integrated"
  StrCpy $DudeCustomize "0"
  Call DudeApplyPreset
  ${If} ${Silent}
    StrCpy $DudePreset "Standard"
    Call DudeApplyPreset
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\DUDE\Installer" "Preset"
  ${If} $0 != ""
    StrCpy $DudePreset $0
    ReadRegStr $DudeCustomize SHELL_CONTEXT "Software\DUDE\Installer" "Customize"
    ReadRegStr $DudeStart SHELL_CONTEXT "Software\DUDE\Installer" "StartShortcut"
    ReadRegStr $DudeDesktop SHELL_CONTEXT "Software\DUDE\Installer" "DesktopShortcut"
    ReadRegStr $DudeLogin SHELL_CONTEXT "Software\DUDE\Installer" "LaunchOnLogin"
    ReadRegStr $DudeUpdates SHELL_CONTEXT "Software\DUDE\Installer" "UpdateMode"
    ReadRegStr $DudeExplorer SHELL_CONTEXT "Software\DUDE\Installer" "ExplorerAction"
    ReadRegStr $DudeFolders SHELL_CONTEXT "Software\DUDE\Installer" "FolderAction"
    ReadRegStr $DudeProtocol SHELL_CONTEXT "Software\DUDE\Installer" "ProtocolEnabled"
    ${If} $DudeProtocol == ""
      StrCpy $DudeProtocol "0"
    ${EndIf}
    ReadRegStr $DudeMask SHELL_CONTEXT "Software\DUDE\Installer" "FileMask"
  ${EndIf}
  StrCpy $DudePreviousPreset $DudePreset
FunctionEnd

Function DudeWelcomeCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 28u "Welcome to DUDE. Choose a starting setup; Custom lets you review every installation choice."
  Pop $0
  ${NSD_CreateRadioButton} 0 34u 100% 13u "Minimal — current user, Start shortcut, manual updates"
  Pop $DudeMinimalRadio
  ${NSD_CreateRadioButton} 0 51u 100% 13u "Standard — shortcuts, Explorer action, update notices"
  Pop $DudeStandardRadio
  ${NSD_CreateRadioButton} 0 68u 100% 13u "Fully Integrated — all users, Explorer, file types, login launch"
  Pop $DudeIntegratedRadio
  ${If} $DudePreset == "Minimal"
    ${NSD_Check} $DudeMinimalRadio
  ${ElseIf} $DudePreset == "Standard"
    ${NSD_Check} $DudeStandardRadio
  ${Else}
    ${NSD_Check} $DudeIntegratedRadio
  ${EndIf}
  ${NSD_CreateCheckbox} 0 94u 100% 13u "Custom: edit location, shortcuts, updates and file types"
  Pop $DudeCustomizeCheck
  ${If} $DudeCustomize == "1"
    ${NSD_Check} $DudeCustomizeCheck
  ${EndIf}
  ${NSD_CreateLabel} 0 118u 100% 25u "Fully Integrated may request administrator permission. Windows will ask you to confirm any default file apps."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function DudeWelcomeLeave
  ${NSD_GetState} $DudeMinimalRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DudePreset "Minimal"
  ${Else}
    ${NSD_GetState} $DudeStandardRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $DudePreset "Standard"
    ${Else}
      StrCpy $DudePreset "Integrated"
    ${EndIf}
  ${EndIf}
  ${NSD_GetState} $DudeCustomizeCheck $0
  StrCpy $DudeCustomize "0"
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DudeCustomize "1"
  ${EndIf}
  ${If} $DudePreset != $DudePreviousPreset
    Call DudeApplyPreset
  ${EndIf}
FunctionEnd

Function DudePathCreate
  ${If} $DudeCustomize != "1"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 28u "Choose where DUDE is installed. This applies only to the desktop app; your personal data stays in your Windows profile."
  Pop $0
  ${NSD_CreateDirRequest} 0 37u 78% 13u "$INSTDIR"
  Pop $DudePathControl
  ${NSD_CreateBrowseButton} 80% 37u 20% 13u "Browse…"
  Pop $0
  ${NSD_OnClick} $0 DudeBrowseDirectory
  nsDialogs::Show
FunctionEnd

Function DudeBrowseDirectory
  nsDialogs::SelectFolderDialog "Choose DUDE installation folder" "$INSTDIR"
  Pop $0
  ${If} $0 != "error"
    ${NSD_SetText} $DudePathControl $0
  ${EndIf}
FunctionEnd

Function DudePathLeave
  ${If} $DudeCustomize == "1"
    ${NSD_GetText} $DudePathControl $0
    ${If} $0 == ""
      MessageBox MB_ICONEXCLAMATION "Choose an installation folder."
      Abort
    ${EndIf}
    GetFullPathName $INSTDIR $0
  ${EndIf}
FunctionEnd

Function DudeOptionsCreate
  ${If} $DudeCustomize != "1"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 15u "Shortcuts and startup"
  Pop $0
  ${NSD_CreateCheckbox} 0 19u 100% 12u "Start menu shortcut"
  Pop $DudeStartCheck
  ${NSD_CreateCheckbox} 0 34u 100% 12u "Desktop shortcut"
  Pop $DudeDesktopCheck
  ${NSD_CreateCheckbox} 0 49u 100% 12u "Launch DUDE when I sign in"
  Pop $DudeLoginCheck
  ${If} $DudeStart == "1"
    ${NSD_Check} $DudeStartCheck
  ${EndIf}
  ${If} $DudeDesktop == "1"
    ${NSD_Check} $DudeDesktopCheck
  ${EndIf}
  ${If} $DudeLogin == "1"
    ${NSD_Check} $DudeLoginCheck
  ${EndIf}
  ${NSD_CreateLabel} 0 72u 100% 15u "Update behavior (installation always needs your approval)"
  Pop $0
  ${NSD_CreateRadioButton} 0 89u 100% 12u "Check and download automatically"
  Pop $DudeAutoRadio
  ${NSD_CreateRadioButton} 0 104u 100% 12u "Check and notify before download"
  Pop $DudeNotifyRadio
  ${NSD_CreateRadioButton} 0 119u 100% 12u "Manual checks only"
  Pop $DudeManualRadio
  ${If} $DudeUpdates == "manual"
    ${NSD_Check} $DudeManualRadio
  ${ElseIf} $DudeUpdates == "notify"
    ${NSD_Check} $DudeNotifyRadio
  ${Else}
    ${NSD_Check} $DudeAutoRadio
  ${EndIf}
  nsDialogs::Show
FunctionEnd

!macro DudeReadCheck HANDLE TARGET
  ${NSD_GetState} ${HANDLE} $0
  StrCpy ${TARGET} "0"
  ${If} $0 == ${BST_CHECKED}
    StrCpy ${TARGET} "1"
  ${EndIf}
!macroend

Function DudeOptionsLeave
  ${If} $DudeCustomize == "1"
    !insertmacro DudeReadCheck $DudeStartCheck $DudeStart
    !insertmacro DudeReadCheck $DudeDesktopCheck $DudeDesktop
    !insertmacro DudeReadCheck $DudeLoginCheck $DudeLogin
    ${NSD_GetState} $DudeManualRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $DudeUpdates "manual"
    ${Else}
      ${NSD_GetState} $DudeNotifyRadio $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $DudeUpdates "notify"
      ${Else}
        StrCpy $DudeUpdates "auto-download"
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd

!macro DudeExtensionCheckbox HANDLE LABEL Y X BIT
  ${NSD_CreateCheckbox} ${X} ${Y} 48% 12u "${LABEL}"
  Pop ${HANDLE}
  IntOp $0 $DudeMask & ${BIT}
  ${If} $0 != 0
    ${NSD_Check} ${HANDLE}
  ${EndIf}
!macroend

!macro DudeSaveExtension HANDLE BIT
  ${NSD_GetState} ${HANDLE} $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $DudeMask $DudeMask | ${BIT}
  ${EndIf}
!macroend

Function DudeExplorerCreate
  ${If} $DudeCustomize != "1"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 0 100% 12u "Add Open with DUDE for supported files"
  Pop $DudeExplorerCheck
  ${NSD_CreateCheckbox} 0 15u 100% 12u "Add Open with DUDE for folders (opens Directory Diff)"
  Pop $DudeFoldersCheck
  ${If} $DudeExplorer == "1"
    ${NSD_Check} $DudeExplorerCheck
  ${EndIf}
  ${If} $DudeFolders == "1"
    ${NSD_Check} $DudeFoldersCheck
  ${EndIf}
  ${NSD_CreateCheckbox} 0 30u 100% 12u "Register dude:// links to open DUDE"
  Pop $DudeProtocolCheck
  ${If} $DudeProtocol == "1"
    ${NSD_Check} $DudeProtocolCheck
  ${EndIf}
  ${NSD_CreateLabel} 0 45u 100% 13u "Register these file types as Default Apps candidates:"
  Pop $0
  !insertmacro DudeExtensionCheckbox $DudeExt0 ".json" 61u 0 1
  !insertmacro DudeExtensionCheckbox $DudeExt1 ".yaml" 61u 52% 2
  !insertmacro DudeExtensionCheckbox $DudeExt2 ".yml" 74u 0 4
  !insertmacro DudeExtensionCheckbox $DudeExt3 ".xml" 74u 52% 8
  !insertmacro DudeExtensionCheckbox $DudeExt4 ".csv" 87u 0 16
  !insertmacro DudeExtensionCheckbox $DudeExt5 ".md" 87u 52% 32
  !insertmacro DudeExtensionCheckbox $DudeExt6 ".txt" 100u 0 64
  !insertmacro DudeExtensionCheckbox $DudeExt7 ".toml" 100u 52% 128
  !insertmacro DudeExtensionCheckbox $DudeExt8 ".ini" 113u 0 256
  !insertmacro DudeExtensionCheckbox $DudeExt9 ".sql" 113u 52% 512
  !insertmacro DudeExtensionCheckbox $DudeExt10 ".js" 126u 0 1024
  !insertmacro DudeExtensionCheckbox $DudeExt11 ".ts" 126u 52% 2048
  !insertmacro DudeExtensionCheckbox $DudeExt12 ".html" 139u 0 4096
  !insertmacro DudeExtensionCheckbox $DudeExt13 ".css" 139u 52% 8192
  nsDialogs::Show
FunctionEnd

Function DudeExplorerLeave
  ${If} $DudeCustomize == "1"
    !insertmacro DudeReadCheck $DudeExplorerCheck $DudeExplorer
    !insertmacro DudeReadCheck $DudeFoldersCheck $DudeFolders
    !insertmacro DudeReadCheck $DudeProtocolCheck $DudeProtocol
    StrCpy $DudeMask 0
    !insertmacro DudeSaveExtension $DudeExt0 1
    !insertmacro DudeSaveExtension $DudeExt1 2
    !insertmacro DudeSaveExtension $DudeExt2 4
    !insertmacro DudeSaveExtension $DudeExt3 8
    !insertmacro DudeSaveExtension $DudeExt4 16
    !insertmacro DudeSaveExtension $DudeExt5 32
    !insertmacro DudeSaveExtension $DudeExt6 64
    !insertmacro DudeSaveExtension $DudeExt7 128
    !insertmacro DudeSaveExtension $DudeExt8 256
    !insertmacro DudeSaveExtension $DudeExt9 512
    !insertmacro DudeSaveExtension $DudeExt10 1024
    !insertmacro DudeSaveExtension $DudeExt11 2048
    !insertmacro DudeSaveExtension $DudeExt12 4096
    !insertmacro DudeSaveExtension $DudeExt13 8192
  ${EndIf}
FunctionEnd



!endif

!macro DudeAppendReview EXT BIT
  IntOp $3 $DudeMask & ${BIT}
  ${If} $3 != 0
    StrCpy $2 "$2 .${EXT}"
  ${EndIf}
!macroend

!macro DudeRegisterExtension EXT BIT
  IntOp $0 $DudeMask & ${BIT}
  ${If} $0 != 0
    Push "${EXT}"
    Call DudeRegisterCandidate
  ${EndIf}
  ${If} $DudeExplorer == "1"
    Push "${EXT}"
    Call DudeRegisterContext
  ${EndIf}
!macroend

!macro DudeRemoveExtension EXT
  Push "${EXT}"
  Call DudeRemoveRegistration
!macroend

!macro DudeRemoveExtensionUn EXT
  Push "${EXT}"
  Call un.DudeRemoveRegistration
!macroend

!macro DudeForEachExtension ACTION
  !insertmacro ${ACTION} "json" 1
  !insertmacro ${ACTION} "yaml" 2
  !insertmacro ${ACTION} "yml" 4
  !insertmacro ${ACTION} "xml" 8
  !insertmacro ${ACTION} "csv" 16
  !insertmacro ${ACTION} "md" 32
  !insertmacro ${ACTION} "txt" 64
  !insertmacro ${ACTION} "toml" 128
  !insertmacro ${ACTION} "ini" 256
  !insertmacro ${ACTION} "sql" 512
  !insertmacro ${ACTION} "js" 1024
  !insertmacro ${ACTION} "ts" 2048
  !insertmacro ${ACTION} "html" 4096
  !insertmacro ${ACTION} "css" 8192
!macroend

!macro DudeRemoveProtocol
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\dude\shell\open\command" ""
  ${If} $0 == "$\"$INSTDIR\DUDE.exe$\" $\"%1$\""
    DeleteRegKey SHELL_CONTEXT "Software\Classes\dude"
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
!macro DudeRegisterProtocol
  WriteRegStr SHELL_CONTEXT "Software\Classes\dude" "" "URL:DUDE Protocol"
  WriteRegStr SHELL_CONTEXT "Software\Classes\dude" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\dude\DefaultIcon" "" "$INSTDIR\DUDE.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\dude\shell\open\command" "" "$\"$INSTDIR\DUDE.exe$\" $\"%1$\""
!macroend

Function DudeRegisterCandidate
  Pop $1
  WriteRegStr SHELL_CONTEXT "Software\Classes\DUDE.$1" "" "DUDE $1 file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\DUDE.$1\DefaultIcon" "" "$INSTDIR\DUDE.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\DUDE.$1\shell\open\command" "" "$\"$INSTDIR\DUDE.exe$\" --open-with-dude $\"%1$\""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.$1\OpenWithProgids" "DUDE.$1"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Capabilities\FileAssociations" ".$1" "DUDE.$1"
FunctionEnd

Function DudeRegisterContext
  Pop $1
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.$1\shell\OpenWithDUDE" "" "Open with DUDE"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.$1\shell\OpenWithDUDE\command" "" "$\"$INSTDIR\DUDE.exe$\" --open-with-dude $\"%1$\""
FunctionEnd

Function DudeRemoveRegistration
  Pop $1
  DeleteRegKey SHELL_CONTEXT "Software\Classes\DUDE.$1"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.$1\OpenWithProgids" "DUDE.$1"
  DeleteRegValue SHELL_CONTEXT "Software\DUDE\Capabilities\FileAssociations" ".$1"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.$1\shell\OpenWithDUDE"
FunctionEnd

Function DudeRemoveAllRegistrations
  !insertmacro DudeRemoveExtension json
  !insertmacro DudeRemoveExtension yaml
  !insertmacro DudeRemoveExtension yml
  !insertmacro DudeRemoveExtension xml
  !insertmacro DudeRemoveExtension csv
  !insertmacro DudeRemoveExtension md
  !insertmacro DudeRemoveExtension txt
  !insertmacro DudeRemoveExtension toml
  !insertmacro DudeRemoveExtension ini
  !insertmacro DudeRemoveExtension sql
  !insertmacro DudeRemoveExtension js
  !insertmacro DudeRemoveExtension ts
  !insertmacro DudeRemoveExtension html
  !insertmacro DudeRemoveExtension css
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\shell\OpenWithDUDE"
FunctionEnd

Function DudeInstallOptions
  Delete "$SMPROGRAMS\DUDE.lnk"
  Delete "$DESKTOP\DUDE.lnk"
  ${If} $DudeStart == "1"
    CreateShortCut "$SMPROGRAMS\DUDE.lnk" "$INSTDIR\DUDE.exe"
  ${EndIf}
  ${If} $DudeDesktop == "1"
    CreateShortCut "$DESKTOP\DUDE.lnk" "$INSTDIR\DUDE.exe"
  ${EndIf}
  Call DudeRemoveAllRegistrations
  !insertmacro DudeRemoveProtocol
  ${If} $DudeProtocol == "1"
    !insertmacro DudeRegisterProtocol
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Capabilities" "ApplicationName" "DUDE"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Capabilities" "ApplicationDescription" "Developer Utility Dashboard Engine"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "DUDE" "Software\DUDE\Capabilities"
  !insertmacro DudeForEachExtension DudeRegisterExtension
  ${If} $DudeFolders == "1"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\OpenWithDUDE" "" "Open with DUDE"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\OpenWithDUDE\command" "" "$\"$INSTDIR\DUDE.exe$\" --open-with-dude $\"%1$\""
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "Preset" "$DudePreset"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "Customize" "$DudeCustomize"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "StartShortcut" "$DudeStart"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "DesktopShortcut" "$DudeDesktop"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "LaunchOnLogin" "$DudeLogin"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "UpdateMode" "$DudeUpdates"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "ExplorerAction" "$DudeExplorer"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "FolderAction" "$DudeFolders"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "ProtocolEnabled" "$DudeProtocol"
  WriteRegStr SHELL_CONTEXT "Software\DUDE\Installer" "FileMask" "$DudeMask"
  WriteINIStr "$INSTDIR\setup-options.ini" "setup" "launchOnLogin" "$DudeLogin"
  WriteINIStr "$INSTDIR\setup-options.ini" "setup" "updateMode" "$DudeUpdates"
  ${IfNot} ${Silent}
    System::Call 'kernel32::GetTickCount() i .r0'
    WriteINIStr "$INSTDIR\setup-request.ini" "setup" "request" "$0"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
FunctionEnd

!endif

!ifdef BUILD_UNINSTALLER
Function un.DudeRemoveRegistration
  Pop $1
  DeleteRegKey SHELL_CONTEXT "Software\Classes\DUDE.$1"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.$1\OpenWithProgids" "DUDE.$1"
  DeleteRegValue SHELL_CONTEXT "Software\DUDE\Capabilities\FileAssociations" ".$1"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.$1\shell\OpenWithDUDE"
FunctionEnd

Function un.DudeRemoveOptions
  Delete "$SMPROGRAMS\DUDE.lnk"
  Delete "$DESKTOP\DUDE.lnk"
  !insertmacro DudeRemoveExtensionUn json
  !insertmacro DudeRemoveExtensionUn yaml
  !insertmacro DudeRemoveExtensionUn yml
  !insertmacro DudeRemoveExtensionUn xml
  !insertmacro DudeRemoveExtensionUn csv
  !insertmacro DudeRemoveExtensionUn md
  !insertmacro DudeRemoveExtensionUn txt
  !insertmacro DudeRemoveExtensionUn ini
  !insertmacro DudeRemoveExtensionUn toml
  !insertmacro DudeRemoveExtensionUn sql
  !insertmacro DudeRemoveExtensionUn js
  !insertmacro DudeRemoveExtensionUn ts
  !insertmacro DudeRemoveExtensionUn html
  !insertmacro DudeRemoveExtensionUn css
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\shell\OpenWithDUDE"
  !insertmacro DudeRemoveProtocol
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "DUDE"
  DeleteRegKey SHELL_CONTEXT "Software\DUDE"
FunctionEnd
!endif
