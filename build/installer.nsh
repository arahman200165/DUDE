!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "getProcessInfo.nsh"
!include "UAC.nsh"

; DUDE's checkboxes own both shortcuts. Fail packaging if builder is
; configured to create its own links before customInstall runs.
!ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
  !error "Set nsis.createStartMenuShortcut to false; DUDE manages shortcuts."
!endif
!ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
  !error "Set nsis.createDesktopShortcut to false; DUDE manages shortcuts."
!endif

; The custom process hook below calls electron-builder's normal process check.
Var pid

; NSIS GetFullPathName fails for a destination that does not exist yet. Keep
; its existing-path behavior, then use Win32's lexical normalization for a
; new install directory. SetOutPath creates that directory during install.
!macro DudeGetInstallPath SOURCE TARGET
  ClearErrors
  GetFullPathName ${TARGET} "${SOURCE}"
  ${If} ${Errors}
    Push $0
    Push $1
    Push $2
    StrCpy $0 "${SOURCE}"
    System::Call 'kernel32::GetFullPathNameW(w r0, i ${NSIS_MAX_STRLEN}, w .r1, p 0) i.r2'
    StrCpy ${TARGET} ""
    ${If} $2 > 0
    ${AndIf} $2 < ${NSIS_MAX_STRLEN}
      StrCpy ${TARGET} $1
      ClearErrors
    ${Else}
      SetErrors
    ${EndIf}
    Pop $2
    Pop $1
    Pop $0
  ${EndIf}
!macroend

; Reject empty, relative, and drive/share-root install paths before NSIS can
; install or recursively uninstall files there.
!macro DudePathIsSafe PATH RESULT ALLOW_MISSING
  StrCpy ${RESULT} "0"
  ${If} "${PATH}" != ""
    ${GetRoot} "${PATH}" $R8
    ${If} $R8 != ""
      StrLen $R6 $R8
      StrCpy $R6 "${PATH}" 1 $R6
      ${If} $R6 == "\"
        StrCpy $R7 ""
        !if "${ALLOW_MISSING}" == "1"
          !insertmacro DudeGetInstallPath ${PATH} $R7
        !else
          ClearErrors
          GetFullPathName $R7 "${PATH}"
        !endif
        ${IfNot} ${Errors}
          ${If} $R7 != "$R8\"
            ${GetFileName} "$R7" $R9
            ${If} $R9 == "DUDE"
              StrCpy ${RESULT} "1"
              ; The install directory may not exist yet. Check its ancestors too.
              StrCpy $R5 $R7
              ${Do}
                ${If} ${FileExists} "$R5\.git"
                ${OrIf} ${FileExists} "$R5\package.json"
                  StrCpy ${RESULT} "0"
                  ${Break}
                ${EndIf}
                ${GetParent} "$R5" $R6
                ${If} $R6 == ""
                ${OrIf} $R6 == $R5
                  ${Break}
                ${EndIf}
                StrCpy $R5 $R6
              ${Loop}
            ${EndIf}
          ${EndIf}
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; An older install with a corrupt registry entry must never be passed to
; electron-builder's uninstallOldVersion, which derives a path from that entry.
!macro DudeCheckPreviousInstall ROOT_KEY
  ReadRegStr $R4 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $R3 ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $R3 != ""
  ${OrIf} $R4 != ""
    !insertmacro DudePathIsSafe $R3 $R2 0
    ${If} $R2 == "1"
    ${AndIf} $R4 != ""
      !insertmacro GetInQuotes $R5 "$R4"
      ${If} $R5 != "$R3\${UNINSTALL_FILENAME}"
        StrCpy $R2 "0"
      ${EndIf}
    ${EndIf}
    ${If} $R2 != "1"
      MessageBox MB_OK|MB_ICONSTOP "The previous DUDE installation has an invalid uninstall path. Setup stopped before changing files. Repair the DUDE installation registration before retrying."
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    !insertmacro DudePathIsSafe $INSTDIR $R2 0
  !else
    !insertmacro DudePathIsSafe $INSTDIR $R2 1
  !endif
  ${If} $R2 != "1"
    MessageBox MB_OK|MB_ICONSTOP "DUDE's installation folder must be a dedicated DUDE folder outside the drive root and source checkout. Setup stopped before changing files."
    SetErrorLevel 2
    Quit
  ${EndIf}
  !ifndef BUILD_UNINSTALLER
    !insertmacro DudeCheckPreviousInstall HKEY_CURRENT_USER
    !insertmacro DudeCheckPreviousInstall HKEY_LOCAL_MACHINE
  !endif
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
!macroend


; BEGIN GENERATED FILE ASSOCIATIONS BITS
!define DUDE_ALL_EXTENSION_MASK 16383
; DUDE_ASSOC_BIT json 1
; DUDE_ASSOC_BIT yaml 2
; DUDE_ASSOC_BIT yml 4
; DUDE_ASSOC_BIT xml 8
; DUDE_ASSOC_BIT csv 16
; DUDE_ASSOC_BIT md 32
; DUDE_ASSOC_BIT txt 64
; DUDE_ASSOC_BIT toml 128
; DUDE_ASSOC_BIT ini 256
; DUDE_ASSOC_BIT sql 512
; DUDE_ASSOC_BIT js 1024
; DUDE_ASSOC_BIT ts 2048
; DUDE_ASSOC_BIT html 4096
; DUDE_ASSOC_BIT css 8192
; END GENERATED FILE ASSOCIATIONS BITS

!ifndef BUILD_UNINSTALLER
Var DudeElevatedContinuation
Var DudeStepTotal
Var DudeCustomize
Var DudePreset
Var DudePreviousPreset
Var DudeLoadedMode
Var DudePresetChanged
Var DudeOptionsValid
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
; BEGIN GENERATED FILE ASSOCIATIONS VARS
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
; END GENERATED FILE ASSOCIATIONS VARS
!endif

!ifndef BUILD_UNINSTALLER
!macro customInit
  StrCpy $DudeElevatedContinuation "0"
  StrCpy $DudePresetChanged "0"
  Call DudeLoadOptions
  ${If} ${UAC_IsInnerInstance}
    StrCpy $DudeElevatedContinuation "1"
    ; Elevation restarts the page flow in a separate process. Restore the
    ; choices made before the prompt instead of loading the admin account's
    ; saved installer settings or showing the welcome page again.
    !insertmacro UAC_AsUser_GetGlobalVar $DudePreset
    !insertmacro UAC_AsUser_GetGlobalVar $DudeCustomize
    !insertmacro UAC_AsUser_GetGlobalVar $DudeStart
    !insertmacro UAC_AsUser_GetGlobalVar $DudeDesktop
    !insertmacro UAC_AsUser_GetGlobalVar $DudeLogin
    !insertmacro UAC_AsUser_GetGlobalVar $DudeUpdates
    !insertmacro UAC_AsUser_GetGlobalVar $DudeExplorer
    !insertmacro UAC_AsUser_GetGlobalVar $DudeFolders
    !insertmacro UAC_AsUser_GetGlobalVar $DudeProtocol
    !insertmacro UAC_AsUser_GetGlobalVar $DudeMask
    StrCpy $DudePreviousPreset $DudePreset
    ; The elevated mode page will select all users even if initMultiUser
    ; initially found only a current-user installation.
    StrCpy $DudeLoadedMode "all"
  ${EndIf}
!macroend

!macro customWelcomePage
  Page custom DudeWelcomeCreate DudeWelcomeLeave
  ; The built-in install-scope page is the next visible page in Custom mode.
  !ifndef INSTALL_MODE_PER_ALL_USERS
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW DudeModeShow
  !endif
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
Function DudeLoadOptions
  StrCpy $DudePreset "Integrated"
  StrCpy $DudeCustomize "0"
  Call DudeApplyPreset
  ${If} ${Silent}
    StrCpy $DudePreset "Standard"
    Call DudeApplyPreset
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\DUDE\Installer" "Preset"
  ${If} $0 == "Minimal"
  ${OrIf} $0 == "Standard"
  ${OrIf} $0 == "Integrated"
    StrCpy $DudePreset $0
    Call DudeApplyPreset
    StrCpy $DudeOptionsValid "1"
    !insertmacro DudeReadSavedBoolean "Customize" $DudeCustomize
    !insertmacro DudeReadSavedBoolean "StartShortcut" $DudeStart
    !insertmacro DudeReadSavedBoolean "DesktopShortcut" $DudeDesktop
    !insertmacro DudeReadSavedBoolean "LaunchOnLogin" $DudeLogin
    ReadRegStr $DudeUpdates SHELL_CONTEXT "Software\DUDE\Installer" "UpdateMode"
    ${If} $DudeUpdates != "manual"
    ${AndIf} $DudeUpdates != "notify"
    ${AndIf} $DudeUpdates != "auto-download"
      StrCpy $DudeOptionsValid "0"
    ${EndIf}
    !insertmacro DudeReadSavedBoolean "ExplorerAction" $DudeExplorer
    !insertmacro DudeReadSavedBoolean "FolderAction" $DudeFolders
    ; Older installs did not save this field; their fallback was disabled.
    ReadRegStr $0 SHELL_CONTEXT "Software\DUDE\Installer" "ProtocolEnabled"
    ${If} $0 == ""
      StrCpy $DudeProtocol "0"
    ${ElseIf} $0 == "0"
    ${OrIf} $0 == "1"
      StrCpy $DudeProtocol $0
    ${Else}
      StrCpy $DudeOptionsValid "0"
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "Software\DUDE\Installer" "FileMask"
    IntOp $1 $0 + 0
    ${If} $0 == $1
    ${AndIf} $1 >= 0
    ${AndIf} $1 <= ${DUDE_ALL_EXTENSION_MASK}
      StrCpy $DudeMask $1
    ${Else}
      StrCpy $DudeOptionsValid "0"
    ${EndIf}
    ${If} $DudeOptionsValid != "1"
      ; Keep a damaged saved record from silently enabling integrations.
      StrCpy $DudePreset "Minimal"
      StrCpy $DudeCustomize "0"
      Call DudeApplyPreset
    ${EndIf}
  ${EndIf}
  StrCpy $DudePreviousPreset $DudePreset
  StrCpy $DudeLoadedMode $installMode
FunctionEnd

Function DudeSyncOptionsForScope
  ${If} $installMode != $DudeLoadedMode
    StrCpy $R0 $DudePreset
    StrCpy $R1 $DudeCustomize
    Call DudeLoadOptions
    ; The welcome-page Custom choice belongs to the user, not the prior
    ; installation in the newly selected scope.
    StrCpy $DudeCustomize $R1
    ${If} $DudePresetChanged == "1"
      StrCpy $DudePreset $R0
      Call DudeApplyPreset
      StrCpy $DudePreviousPreset $DudePreset
    ${EndIf}
  ${EndIf}
FunctionEnd

; Four visible pages for a preset install, eight when Custom is selected.
; The built-in scope page is skipped in preset mode; elevation also skips the
; welcome and scope pages in the second process without changing their numbers.
Function DudeSetStepHeader
  StrCpy $DudeStepTotal "4"
  ${If} $DudeCustomize == "1"
    StrCpy $DudeStepTotal "8"
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Step $0 of $DudeStepTotal" "$1"
FunctionEnd

Function DudeModeShow
  StrCpy $0 "2"
  StrCpy $1 "Choose who can use DUDE"
  Call DudeSetStepHeader
FunctionEnd

Function DudeInstallShow
  StrCpy $0 "3"
  ${If} $DudeCustomize == "1"
    StrCpy $0 "7"
  ${EndIf}
  StrCpy $1 "Installing DUDE"
  Call DudeSetStepHeader
FunctionEnd

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
  StrCpy $0 "2"
  ${If} $DudeCustomize == "1"
    StrCpy $0 "6"
  ${EndIf}
  StrCpy $1 "Review before installing"
  Call DudeSetStepHeader
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

  ; These built-in pages follow the custom review page in assistedInstaller.nsh.
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW DudeInstallShow
  !define MUI_FINISHPAGE_TITLE "Step $DudeStepTotal of $DudeStepTotal"
!macroend

!macro customInstall
  Call DudeInstallOptions
!macroend

!endif

!macro customUnInstall
  Call un.DudeRemoveOptions
  ${If} $DudeDeleteData == "1"
    ; Execute in the unelevated parent when UAC used another admin account.
    ${If} ${UAC_IsInnerInstance}
      !insertmacro UAC_AsUser_Call Function un.DudeDeleteUserData 0
    ${Else}
      Call un.DudeDeleteUserData
    ${EndIf}
  ${EndIf}
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
    StrCpy $DudeMask ${DUDE_ALL_EXTENSION_MASK}
    StrCpy $DudeUpdates "auto-download"
  ${EndIf}
FunctionEnd

!macro DudeReadSavedBoolean NAME TARGET
  ReadRegStr $0 SHELL_CONTEXT "Software\DUDE\Installer" "${NAME}"
  ${If} $0 == "0"
  ${OrIf} $0 == "1"
    StrCpy ${TARGET} $0
  ${Else}
    StrCpy $DudeOptionsValid "0"
  ${EndIf}
!macroend

Function DudeWelcomeCreate
  ${If} ${Silent}
  ${OrIf} $DudeElevatedContinuation == "1"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  StrCpy $0 "1"
  StrCpy $1 "Choose a starting setup"
  Call DudeSetStepHeader
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
  ${NSD_OnClick} $DudeCustomizeCheck DudeWelcomeCustomizeChanged
  ${NSD_CreateLabel} 0 118u 100% 25u "Fully Integrated may request administrator permission. Windows will ask you to confirm any default file apps."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function DudeWelcomeCustomizeChanged
  Pop $0
  ${NSD_GetState} $DudeCustomizeCheck $0
  StrCpy $DudeCustomize "0"
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DudeCustomize "1"
  ${EndIf}
  StrCpy $0 "1"
  StrCpy $1 "Choose a starting setup"
  Call DudeSetStepHeader
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
    StrCpy $DudePresetChanged "1"
  ${EndIf}
  StrCpy $DudePreviousPreset $DudePreset
FunctionEnd

Function DudePathCreate
  Call DudeSyncOptionsForScope
  ${If} $DudeCustomize != "1"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  StrCpy $0 "3"
  StrCpy $1 "Choose installation folder"
  Call DudeSetStepHeader
  ${NSD_CreateLabel} 0 0 100% 28u "Choose where DUDE is installed. Setup creates the DUDE folder if needed; personal data stays in your Windows profile."
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
    !insertmacro DudeGetInstallPath $0 $INSTDIR
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Choose a valid installation folder."
      Abort
    ${EndIf}
    ${GetFileName} "$INSTDIR" $R9
    ${If} $R9 != "DUDE"
      StrCpy $INSTDIR "$INSTDIR\DUDE"
    ${EndIf}
    !insertmacro DudePathIsSafe $INSTDIR $R2 1
    ${If} $R2 != "1"
      MessageBox MB_OK|MB_ICONEXCLAMATION "Choose a dedicated DUDE folder outside the drive root and source checkout."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function DudeOptionsCreate
  ${If} $DudeCustomize != "1"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  StrCpy $0 "4"
  StrCpy $1 "Choose shortcuts and updates"
  Call DudeSetStepHeader
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
  StrCpy $0 "5"
  StrCpy $1 "Choose Windows integrations"
  Call DudeSetStepHeader
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
  ; BEGIN GENERATED FILE ASSOCIATIONS CHECKBOXES
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
; END GENERATED FILE ASSOCIATIONS CHECKBOXES
  nsDialogs::Show
FunctionEnd

Function DudeExplorerLeave
  ${If} $DudeCustomize == "1"
    !insertmacro DudeReadCheck $DudeExplorerCheck $DudeExplorer
    !insertmacro DudeReadCheck $DudeFoldersCheck $DudeFolders
    !insertmacro DudeReadCheck $DudeProtocolCheck $DudeProtocol
    StrCpy $DudeMask 0
    ; BEGIN GENERATED FILE ASSOCIATIONS SAVE
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
; END GENERATED FILE ASSOCIATIONS SAVE
  ${EndIf}
FunctionEnd



!endif

!macro DudeWriteAssociationJson EXT BIT
  IntOp $0 $DudeMask & ${BIT}
  ${If} $0 != 0
    ${If} $2 == "1"
      FileWrite $9 ","
    ${EndIf}
    FileWrite $9 "$\".${EXT}$\""
    StrCpy $2 "1"
  ${EndIf}
!macroend

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

!macro DudeRemoveExtension EXT BIT
  Push "${EXT}"
  Call DudeRemoveRegistration
!macroend

!macro DudeRemoveExtensionUn EXT BIT
  Push "${EXT}"
  Call un.DudeRemoveRegistration
!macroend

!macro DudeForEachExtension ACTION
  ; BEGIN GENERATED FILE ASSOCIATIONS ACTIVE
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
; END GENERATED FILE ASSOCIATIONS ACTIVE
!macroend

!macro DudeForEachKnownExtension ACTION
  ; BEGIN GENERATED FILE ASSOCIATIONS KNOWN
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
; END GENERATED FILE ASSOCIATIONS KNOWN
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
  !insertmacro DudeForEachKnownExtension DudeRemoveExtension
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
  FileOpen $9 "$INSTDIR\file-associations.json" w
  FileWrite $9 "{$\"schemaVersion$\":1,$\"candidateExtensions$\":["
  StrCpy $2 "0"
  !insertmacro DudeForEachExtension DudeWriteAssociationJson
  FileWrite $9 "]}"
  FileClose $9
  ${IfNot} ${Silent}
    System::Call 'kernel32::GetTickCount() i .r0'
    WriteINIStr "$INSTDIR\setup-request.ini" "setup" "request" "$0"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
FunctionEnd

!endif

!ifdef BUILD_UNINSTALLER
Var DudeDeleteData
Var DudeDeleteDataCheck

!macro customUnWelcomePage
  Page custom DudeUnWelcomeCreate DudeUnWelcomeLeave
!macroend

Function DudeUnWelcomeCreate
  StrCpy $DudeDeleteData "0"
  ${If} ${Silent}
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 40u "This will remove DUDE from your computer. Your saved settings, hotkeys, secure credentials, and cache are normally left behind, so a future install picks up where you left off."
  Pop $0
  ${NSD_CreateCheckbox} 0 52u 100% 32u "Also permanently delete my DUDE settings and data (preferences, hotkeys, saved credentials, cache). This cannot be undone."
  Pop $DudeDeleteDataCheck
  nsDialogs::Show
FunctionEnd

Function DudeUnWelcomeLeave
  ${NSD_GetState} $DudeDeleteDataCheck $0
  StrCpy $DudeDeleteData "0"
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DudeDeleteData "1"
  ${EndIf}
FunctionEnd

Function un.DudeRemoveRegistration
  Pop $1
  DeleteRegKey SHELL_CONTEXT "Software\Classes\DUDE.$1"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.$1\OpenWithProgids" "DUDE.$1"
  DeleteRegValue SHELL_CONTEXT "Software\DUDE\Capabilities\FileAssociations" ".$1"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.$1\shell\OpenWithDUDE"
FunctionEnd

Function un.DudeRemoveOptions
  Delete "$INSTDIR\file-associations.json"
  !insertmacro DudeForEachKnownExtension DudeRemoveExtensionUn
  Delete "$SMPROGRAMS\DUDE.lnk"
  Delete "$DESKTOP\DUDE.lnk"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\shell\OpenWithDUDE"
  !insertmacro DudeRemoveProtocol
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "DUDE"
  DeleteRegKey SHELL_CONTEXT "Software\DUDE"
FunctionEnd

Function un.DudeDeleteUserData
  ; Resolve the profile at runtime, in the user's own process.
  ReadEnvStr $0 "APPDATA"
  ${If} $0 != ""
    RMDir /r "$0\DUDE"
  ${EndIf}
FunctionEnd
!endif
