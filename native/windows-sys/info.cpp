// DUDE Windows system helper: helper.info (DUDE_PRD.md §21 Phase 31, Milestone 593).
//
// Reports the helper version, pid, whether its token is elevated, and the native machine
// architecture (via IsWow64Process2, so an x86 build on ARM64 still reports the host).
#include "common.hpp"

namespace sys {

static bool isElevated() {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
  TOKEN_ELEVATION elevation = {};
  DWORD size = 0;
  bool elevated = GetTokenInformation(token, TokenElevation, &elevation, sizeof elevation, &size) && elevation.TokenIsElevated != 0;
  CloseHandle(token);
  return elevated;
}

static const char* nativeArch() {
  USHORT processMachine = 0;
  USHORT nativeMachine = 0;
  if (IsWow64Process2(GetCurrentProcess(), &processMachine, &nativeMachine)) {
    if (nativeMachine == IMAGE_FILE_MACHINE_AMD64) return "x64";
    if (nativeMachine == IMAGE_FILE_MACHINE_ARM64) return "arm64";
  }
  return "x86";
}

bool handleHelperInfo(std::string& result, Failure&) {
  result = "{\"version\":\"1\",\"pid\":" + std::to_string(GetCurrentProcessId()) + ",\"elevated\":" +
           (isElevated() ? "true" : "false") + ",\"arch\":\"" + nativeArch() + "\"}";
  return true;
}

}  // namespace sys
