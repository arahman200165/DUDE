// DUDE Windows system helper: shared utilities (DUDE_PRD.md §21 Phase 31, Milestone 593).
//
// UTF-8 <-> UTF-16 conversion, a tiny JSON writer (string-append based, like fs-attrs.cpp) and the
// error type every RPC handler reports through. Read-only helper: nothing here mutates the system.
#pragma once
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

#include "json_read.hpp"

namespace sys {

struct Failure {
  std::string message;
  DWORD code = 0;
  bool hasCode = false;
};

inline std::wstring widen(const std::string& value) {
  if (value.empty()) return std::wstring();
  int size = MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0);
  std::wstring out(size, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), &out[0], size);
  return out;
}

inline std::string narrow(const wchar_t* value, size_t length) {
  if (length == 0) return std::string();
  int size = WideCharToMultiByte(CP_UTF8, 0, value, (int)length, nullptr, 0, nullptr, nullptr);
  std::string out(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value, (int)length, &out[0], size, nullptr, nullptr);
  return out;
}

inline std::string narrow(const std::wstring& value) { return narrow(value.data(), value.size()); }

inline void appendJsonString(std::string& out, const std::string& value) {
  out.push_back('"');
  for (unsigned char c : value) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof buf, "\\u%04x", c); out += buf; }
        else out.push_back((char)c);
    }
  }
  out.push_back('"');
}

inline void appendJsonWide(std::string& out, const wchar_t* value, size_t length) {
  appendJsonString(out, narrow(value, length));
}

// Formats a Win32 error via FormatMessageW (system table, no inserts), trimmed.
inline Failure win32Failure(DWORD code) {
  Failure f;
  f.code = code;
  f.hasCode = true;
  wchar_t* buffer = nullptr;
  DWORD n = FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                           nullptr, code, 0, (LPWSTR)&buffer, 0, nullptr);
  if (n && buffer) {
    while (n > 0 && (buffer[n - 1] == L'\r' || buffer[n - 1] == L'\n' || buffer[n - 1] == L' ')) n--;
    f.message = narrow(buffer, n);
    LocalFree(buffer);
  }
  if (f.message.empty()) f.message = "Windows error " + std::to_string(code) + ".";
  return f;
}

inline Failure plainFailure(const char* message) {
  Failure f;
  f.message = message;
  return f;
}

// Handlers: fill `result` with a JSON value on success; return false with `err` set on failure.
bool handleHelperInfo(std::string& result, Failure& err);
bool handleProcessList(std::string& result, Failure& err);
bool handleProcessThreads(const JsonValue* params, std::string& result, Failure& err);
bool handleProcessDetail(const JsonValue* params, std::string& result, Failure& err);
bool handleProcessModules(const JsonValue* params, std::string& result, Failure& err);
bool handleProcessHandles(const JsonValue* params, std::string& result, Failure& err);
bool handleFileVersion(const JsonValue* params, std::string& result, Failure& err);
bool handleFileSignature(const JsonValue* params, std::string& result, Failure& err);
bool handleSvcList(std::string& result, Failure& err);
bool handleSvcConfig(const JsonValue* params, std::string& result, Failure& err);
bool handleEvtChannels(std::string& result, Failure& err);
bool handleEvtQuery(const JsonValue* params, std::string& result, Failure& err);
bool handleEvtQueryFile(const JsonValue* params, std::string& result, Failure& err);
bool handleNetTcp(std::string& result, Failure& err);
bool handleNetUdp(std::string& result, Failure& err);
bool handleRegEnumKey(const JsonValue* params, std::string& result, Failure& err);
bool handleRegGetValues(const JsonValue* params, std::string& result, Failure& err);
bool handleRegSearch(const JsonValue* params, std::string& result, Failure& err);
bool handleRegExport(const JsonValue* params, std::string& result, Failure& err);
bool handleFsProbeDirs(const JsonValue* params, std::string& result, Failure& err);
// SID and account inspection (Milestone 609), read-only.
bool handleSidDecode(const JsonValue* params, std::string& result, Failure& err);
bool handleSidWellKnown(std::string& result, Failure& err);
bool handleSidLookup(const JsonValue* params, std::string& result, Failure& err);
bool handleAccountToken(std::string& result, Failure& err);
bool handleAccountLocalAccounts(std::string& result, Failure& err);
bool handleAccountLocalGroups(std::string& result, Failure& err);
bool handleAccountProfiles(std::string& result, Failure& err);
// ACL inspection (Milestone 610), read-only.
bool handleAclGet(const JsonValue* params, std::string& result, Failure& err);
// Mutating ACL operation (acl.cpp), reached only from confirmed engine plans: writes the DACL only.
bool handleAclSet(const JsonValue* params, std::string& result, Failure& err);
// Current helper process API-set namespace for API-MS/EXT-MS contract resolution.
bool handlePeApiSetMap(std::string& result, Failure& err);
// Mutating process operations (process_ops.cpp), reached only from confirmed engine plans.
bool handleProcTerminate(const JsonValue* params, std::string& result, Failure& err);
bool handleProcTree(const JsonValue* params, std::string& result, Failure& err);
bool handleProcSuspend(const JsonValue* params, std::string& result, Failure& err);
bool handleProcResume(const JsonValue* params, std::string& result, Failure& err);
bool handleProcSetPriority(const JsonValue* params, std::string& result, Failure& err);
bool handleProcSetAffinity(const JsonValue* params, std::string& result, Failure& err);
bool handleProcStartInfo(const JsonValue* params, std::string& result, Failure& err);
bool handleProcCreate(const JsonValue* params, std::string& result, Failure& err);
bool handleProcDump(const JsonValue* params, std::string& result, Failure& err);
// Mutating registry / environment operations (registry_ops.cpp), reached only from confirmed engine plans.
bool handleRegSetValue(const JsonValue* params, std::string& result, Failure& err);
bool handleRegDeleteValue(const JsonValue* params, std::string& result, Failure& err);
bool handleRegCreateKey(const JsonValue* params, std::string& result, Failure& err);
bool handleRegDeleteKeyIfEmpty(const JsonValue* params, std::string& result, Failure& err);
bool handleEnvBroadcast(std::string& result, Failure& err);
// Mutating service operations (services.cpp), reached only from confirmed engine plans.
bool handleSvcControl(const JsonValue* params, std::string& result, Failure& err);
bool handleSvcSetStartType(const JsonValue* params, std::string& result, Failure& err);

}  // namespace sys
