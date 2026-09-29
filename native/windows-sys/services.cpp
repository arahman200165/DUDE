// DUDE Windows system helper: svc.list (DUDE_PRD.md §21 Phase 31, Milestone 595).
//
// Read-only: the service control manager is opened with SC_MANAGER_ENUMERATE_SERVICE only.
#include "common.hpp"

namespace sys {

namespace {

const char* stateName(DWORD s) {
  switch (s) {
    case SERVICE_STOPPED: return "stopped";
    case SERVICE_START_PENDING: return "start-pending";
    case SERVICE_STOP_PENDING: return "stop-pending";
    case SERVICE_RUNNING: return "running";
    case SERVICE_CONTINUE_PENDING: return "continue-pending";
    case SERVICE_PAUSE_PENDING: return "pause-pending";
    case SERVICE_PAUSED: return "paused";
    default: return "stopped";
  }
}

const char* typeName(DWORD t) {
  if (t & SERVICE_WIN32_OWN_PROCESS) return "own-process";
  if (t & SERVICE_WIN32_SHARE_PROCESS) return "share-process";
  return "other";
}

}  // namespace

bool handleSvcList(std::string& result, Failure& err) {
  SC_HANDLE scm = OpenSCManagerW(nullptr, nullptr, SC_MANAGER_ENUMERATE_SERVICE);
  if (!scm) {
    err = win32Failure(GetLastError());
    return false;
  }
  std::vector<unsigned char> buffer(64 * 1024);
  DWORD resume = 0;
  std::string out = "{\"services\":[";
  bool first = true;
  for (;;) {
    DWORD needed = 0, count = 0;
    BOOL ok = EnumServicesStatusExW(scm, SC_ENUM_PROCESS_INFO, SERVICE_WIN32, SERVICE_STATE_ALL, buffer.data(), (DWORD)buffer.size(),
                                    &needed, &count, &resume, nullptr);
    DWORD e = ok ? ERROR_SUCCESS : GetLastError();
    if (!ok && e != ERROR_MORE_DATA) {
      CloseServiceHandle(scm);
      err = win32Failure(e);
      return false;
    }
    const ENUM_SERVICE_STATUS_PROCESSW* items = (const ENUM_SERVICE_STATUS_PROCESSW*)buffer.data();
    for (DWORD i = 0; i < count; i++) {
      const ENUM_SERVICE_STATUS_PROCESSW& s = items[i];
      if (!first) out.push_back(',');
      first = false;
      out += "{\"name\":";
      appendJsonWide(out, s.lpServiceName, s.lpServiceName ? wcslen(s.lpServiceName) : 0);
      out += ",\"displayName\":";
      appendJsonWide(out, s.lpDisplayName, s.lpDisplayName ? wcslen(s.lpDisplayName) : 0);
      out += ",\"pid\":" + std::to_string(s.ServiceStatusProcess.dwProcessId);
      out += std::string(",\"state\":\"") + stateName(s.ServiceStatusProcess.dwCurrentState) + "\"";
      out += std::string(",\"type\":\"") + typeName(s.ServiceStatusProcess.dwServiceType) + "\"}";
    }
    if (ok) break;
  }
  CloseServiceHandle(scm);
  out += "]}";
  result = std::move(out);
  return true;
}

}  // namespace sys
