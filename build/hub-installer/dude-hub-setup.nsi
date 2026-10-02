; DUDE Hub standalone installer (Phase 31C, PD-025).
;
; Built by `npm run hub:installer` (scripts/build-hub-installer.mjs) into dist/hub-installer/DUDE-Hub-Setup.exe,
; which the desktop installer embeds and launches only on an explicit interactive choice. It is a separate
; elevated program with its own Apps & Features entry (HKLM ...\Uninstall\DUDEHub): the desktop installer,
; its updater and its uninstaller never stop or remove the Hub, and this uninstaller never touches the desktop.
;
; Command line:
;   DUDE-Hub-Setup.exe [/S] [/LAN] [/UPDATE]
;     /S       silent (no pages, LAN stays off unless /LAN is also given)
;     /LAN     enable LAN mode (Private-profile firewall rule) on a new install
;     /UPDATE  stop -> replace -> start an installed Hub (dude-hub service update); also the behavior when
;              the Hub is already installed
; The Hub's data (%ProgramData%\DUDE\Hub) is never touched by install or update, and kept by the uninstaller
; unless the user ticks "Also delete all Hub data" and confirms twice.
;
; The embedded payload is extracted to $PLUGINSDIR\payload once; `dude-hub service install|update` copies the
; files into the install directory itself, so the payload is embedded a single time.
;
; Defines expected from the build script: STAGE_DIR, OUT_FILE, HUB_VERSION, ICON_FILE (optional).

Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel admin
ManifestDPIAware true

!ifndef STAGE_DIR
  !error "Pass /DSTAGE_DIR=<dist/hub-stage>."
!endif
!ifndef OUT_FILE
  !error "Pass /DOUT_FILE=<DUDE-Hub-Setup.exe>."
!endif
!ifndef HUB_VERSION
  !define HUB_VERSION "0.0.0"
!endif

!define PRODUCT "DUDE Hub"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\DUDEHub"
!define HUB_KEY "Software\DUDE\Hub"
!define PURGE_PHRASE "DELETE HUB DATA"

Name "${PRODUCT}"
OutFile "${OUT_FILE}"
InstallDir "$PROGRAMFILES64\DUDE Hub"
BrandingText "${PRODUCT} ${HUB_VERSION}"
VIProductVersion "${HUB_VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT}"
VIAddVersionKey "LegalCopyright" "Copyright (c) arahman200165"
VIAddVersionKey "FileDescription" "DUDE Hub installer"
VIAddVersionKey "FileVersion" "${HUB_VERSION}"
VIAddVersionKey "ProductVersion" "${HUB_VERSION}"

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!ifdef ICON_FILE
  !define MUI_ICON "${ICON_FILE}"
  !define MUI_UNICON "${ICON_FILE}"
!endif
!define MUI_ABORTWARNING

Var Lan
Var UpdateMode
Var LanCheck
Var DeviceCount
Var DeleteData
Var DeleteDataCheck
Var DataDir
Var JsonValue

; ---------------------------------------------------------------- pages
!define MUI_WELCOMEPAGE_TITLE "Install the DUDE Hub"
!define MUI_WELCOMEPAGE_TEXT "The DUDE Hub runs as a Windows service on this computer so your devices can sync through it. Setup installs it to $PROGRAMFILES64\DUDE Hub and starts it.$\r$\n$\r$\nHub data lives in %ProgramData%\DUDE\Hub and is never deleted by installing or updating."
!insertmacro MUI_PAGE_WELCOME
Page custom LanPageCreate LanPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

UninstPage custom un.DataPageCreate un.DataPageLeave
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"


; ---------------------------------------------------------------- init
Function .onInit
  SetRegView 64
  SetShellVarContext all
  StrCpy $Lan "0"
  StrCpy $UpdateMode "0"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/LAN" $R1
  ${IfNot} ${Errors}
    StrCpy $Lan "1"
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    StrCpy $UpdateMode "1"
  ${EndIf}
  ; An installed Hub is updated in place, never reinstalled.
  ReadRegStr $R2 HKLM "${HUB_KEY}" "InstallDir"
  ${If} $R2 != ""
    StrCpy $UpdateMode "1"
    StrCpy $INSTDIR $R2
  ${EndIf}
FunctionEnd

Function LanPageCreate
  ${If} $UpdateMode == "1"
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Network access" "Choose who can reach the Hub"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 50u "By default the Hub accepts connections only from this computer. LAN mode lets other computers on your private network reach the Hub: Setup opens a Windows Firewall rule for the Private network profile only. The Hub is HTTPS-only, and every device pins the Hub's certificate, so devices connect to your Hub and not an impostor."
  Pop $0
  ${NSD_CreateCheckbox} 0 58u 100% 12u "Allow other computers on my private network (LAN mode)"
  Pop $LanCheck
  ${If} $Lan == "1"
    ${NSD_Check} $LanCheck
  ${EndIf}
  ${NSD_CreateLabel} 0 76u 100% 24u "You can change this later with: dude-hub network lan on|off (from an elevated prompt)."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function LanPageLeave
  ${NSD_GetState} $LanCheck $0
  StrCpy $Lan "0"
  ${If} $0 == ${BST_CHECKED}
    StrCpy $Lan "1"
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------- install
Section "Hub" SecHub
  SetRegView 64
  SetShellVarContext all
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\payload"
  File /r "${STAGE_DIR}\*.*"

  ${If} $UpdateMode == "1"
    DetailPrint "Updating the installed Hub (stop, replace, start)..."
    nsExec::ExecToLog '"$INSTDIR\dude-hub.exe" service update --source "$PLUGINSDIR\payload" --install-dir "$INSTDIR"'
    Pop $0
    ${If} $0 != "0"
      SetErrorLevel 3
      MessageBox MB_OK|MB_ICONSTOP "Updating the Hub failed (exit code $0). The previous version was started again where possible. See the details list." /SD IDOK
      Abort
    ${EndIf}
  ${Else}
    DetailPrint "Installing the Hub service..."
    ${If} $Lan == "1"
      nsExec::ExecToLog '"$PLUGINSDIR\payload\dude-hub.exe" service install --install-dir "$INSTDIR" --lan'
    ${Else}
      nsExec::ExecToLog '"$PLUGINSDIR\payload\dude-hub.exe" service install --install-dir "$INSTDIR"'
    ${EndIf}
    Pop $0
    ${If} $0 != "0"
      SetErrorLevel 3
      MessageBox MB_OK|MB_ICONSTOP "Installing the Hub service failed (exit code $0). See the details list. Nothing was registered with Apps & Features." /SD IDOK
      Abort
    ${EndIf}
  ${EndIf}

  ; Only reached when the CLI succeeded, so Apps & Features never lists a half-installed Hub.
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall DUDE Hub.exe"
  WriteRegStr HKLM "${HUB_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${HUB_KEY}" "Version" "${HUB_VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${HUB_VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "arahman200165"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\dude-hub.exe,0"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall DUDE Hub.exe"'
  WriteRegStr HKLM "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall DUDE Hub.exe" /S'
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

; ---------------------------------------------------------------- uninstall helpers
; Reads "key": value from a pretty-printed JSON file (one property per line) into $JsonValue.
; Stack in: file, key. $JsonValue is "" when absent.
Function un.ReadJsonValue
  Exch $R1 ; key
  Exch
  Exch $R0 ; file
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  StrCpy $JsonValue ""
  StrLen $R5 '"$R1":'
  FileOpen $R2 "$R0" r
  ${If} $R2 != ""
    ${Do}
      ClearErrors
      FileRead $R2 $R3
      ${If} ${Errors}
        ${Break}
      ${EndIf}
      ; trim leading spaces
      ${Do}
        StrCpy $R4 $R3 1
        ${If} $R4 != " "
          ${Break}
        ${EndIf}
        StrCpy $R3 $R3 "" 1
      ${Loop}
      StrCpy $R4 $R3 $R5
      ${If} $R4 == '"$R1":'
        StrCpy $R3 $R3 "" $R5
        ; trim leading spaces, then trailing CR/LF/comma/space
        ${Do}
          StrCpy $R4 $R3 1
          ${If} $R4 != " "
            ${Break}
          ${EndIf}
          StrCpy $R3 $R3 "" 1
        ${Loop}
        ${Do}
          StrCpy $R4 $R3 1 -1
          ${If} $R4 == "$\r"
          ${OrIf} $R4 == "$\n"
          ${OrIf} $R4 == ","
          ${OrIf} $R4 == " "
            StrCpy $R3 $R3 -1
          ${Else}
            ${Break}
          ${EndIf}
        ${Loop}
        StrCpy $R4 $R3 1
        ${If} $R4 == '"'
          StrCpy $R3 $R3 "" 1
          StrCpy $R3 $R3 -1
        ${EndIf}
        StrCpy $JsonValue $R3
        ${Break}
      ${EndIf}
    ${Loop}
    FileClose $R2
  ${EndIf}
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R0
  Pop $R1
FunctionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext all
  StrCpy $DeleteData "0"
  StrCpy $DeviceCount ""
  StrCpy $DataDir "$APPDATA\DUDE\Hub"
  InitPluginsDir
  ; Best effort: the registered-device count comes from the running Hub's admin status. A Hub that is
  ; stopped or unreachable leaves the count unknown; uninstalling still works.
  ${If} ${FileExists} "$INSTDIR\dude-hub.exe"
    nsExec::ExecToStack 'cmd.exe /c ""$INSTDIR\dude-hub.exe" service status --install-dir "$INSTDIR" >"$PLUGINSDIR\hub-status.json" 2>nul"'
    Pop $0
    Pop $1
    ${If} $0 == "0"
      Push "$PLUGINSDIR\hub-status.json"
      Push "deviceCount"
      Call un.ReadJsonValue
      StrCpy $DeviceCount $JsonValue
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.DataPageCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Uninstall the DUDE Hub" "Your Hub data is kept unless you choose otherwise"
  nsDialogs::Create 1018
  Pop $0
  ${If} $DeviceCount != ""
    ${If} $DeviceCount == "1"
      StrCpy $1 "1 device is registered with this Hub; it will lose its connection until you reinstall or move the Hub."
    ${Else}
      StrCpy $1 "$DeviceCount devices are registered with this Hub; they will lose their connection until you reinstall or move the Hub."
    ${EndIf}
  ${Else}
    StrCpy $1 "The Hub is not running, so the number of registered devices is unknown. Registered devices will lose their connection until you reinstall or move the Hub."
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 30u "$1"
  Pop $0
  ${NSD_CreateLabel} 0 36u 100% 30u "Hub data (devices, accounts, certificates, database) stays at $DataDir so a later install can pick it up."
  Pop $0
  ${NSD_CreateCheckbox} 0 74u 100% 24u "Also delete all Hub data (cannot be undone)"
  Pop $DeleteDataCheck
  nsDialogs::Show
FunctionEnd

Function un.DataPageLeave
  StrCpy $DeleteData "0"
  ${NSD_GetState} $DeleteDataCheck $0
  ${If} $0 == ${BST_CHECKED}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "This permanently deletes everything in $DataDir: registered devices, accounts, the Hub database and its certificates. Backups are kept. It cannot be undone, and devices must be paired again with a new Hub.$\r$\n$\r$\nDelete all Hub data?" IDYES confirmed
    Abort
    confirmed:
    StrCpy $DeleteData "1"
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------- uninstall
Section "Uninstall"
  SetRegView 64
  SetShellVarContext all

  ${If} $DeleteData == "1"
    ; Purge refuses a live Hub, so stop the service first, then run both phases of the Destructive-Action Contract.
    DetailPrint "Stopping the Hub service..."
    nsExec::ExecToLog '"$INSTDIR\dude-hub.exe" service stop --install-dir "$INSTDIR"'
    Pop $0
    DetailPrint "Previewing the purge..."
    nsExec::ExecToStack 'cmd.exe /c ""$INSTDIR\dude-hub.exe" purge --data-dir "$DataDir" >"$PLUGINSDIR\hub-purge.json" 2>nul"'
    Pop $0
    Pop $1
    StrCpy $2 ""
    ${If} $0 == "0"
      Push "$PLUGINSDIR\hub-purge.json"
      Push "confirmToken"
      Call un.ReadJsonValue
      StrCpy $2 $JsonValue
    ${EndIf}
    ${If} $2 == ""
      SetErrorLevel 4
      DetailPrint "The purge preview failed; Hub data was NOT deleted."
      MessageBox MB_OK|MB_ICONEXCLAMATION "Hub data could not be prepared for deletion and was kept at $DataDir. The Hub will still be uninstalled." /SD IDOK
    ${Else}
      DetailPrint "Deleting Hub data..."
      nsExec::ExecToLog '"$INSTDIR\dude-hub.exe" purge --data-dir "$DataDir" --confirm "$2" --type "${PURGE_PHRASE}"'
      Pop $0
      ${If} $0 != "0"
        SetErrorLevel 4
        MessageBox MB_OK|MB_ICONEXCLAMATION "Deleting Hub data did not complete (exit code $0). Check $DataDir. The Hub will still be uninstalled." /SD IDOK
      ${EndIf}
    ${EndIf}
  ${EndIf}

  DetailPrint "Removing the Hub service..."
  nsExec::ExecToLog '"$INSTDIR\dude-hub.exe" service uninstall --install-dir "$INSTDIR"'
  Pop $0
  ${If} $0 != "0"
    SetErrorLevel 3
    MessageBox MB_OK|MB_ICONSTOP "Removing the Hub service failed (exit code $0). The Hub was left installed; fix the problem shown in the details list and run this uninstaller again." /SD IDOK
    Abort
  ${EndIf}

  ; The CLI removes its own binaries; clear anything it left (the running executable cannot delete itself).
  Delete "$INSTDIR\dude-hub.exe"
  Delete "$INSTDIR\DudeHub.exe"
  Delete "$INSTDIR\DudeHub.xml"
  Delete "$INSTDIR\DudeHub.wrapper.log"
  RMDir /r "$INSTDIR\service"
  Delete "$INSTDIR\Uninstall DUDE Hub.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  DeleteRegKey HKLM "${HUB_KEY}"
  DeleteRegKey /ifempty HKLM "Software\DUDE"

  ${If} $DeleteData != "1"
    MessageBox MB_OK|MB_ICONINFORMATION "The DUDE Hub was uninstalled. Your Hub data was kept at:$\r$\n$DataDir$\r$\n$\r$\nDelete that folder with 'dude-hub purge', or reinstall the Hub to use it again." /SD IDOK
  ${EndIf}
SectionEnd
