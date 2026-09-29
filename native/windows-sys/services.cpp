// DUDE Windows system helper: svc.list (Milestone 595), svc.config (read) and svc.control /
// svc.setStartType (Milestone 602, DUDE_PRD.md §21 Phase 31).
//
// svc.list / svc.config are read-only. svc.control and svc.setStartType MUTATE services, so they are reached
// only from confirmed engine plans (never the renderer's read allowlist); each opens the SCM and the service
// with the minimum rights it needs.
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

const char* startTypeName(DWORD start, bool delayed) {
  switch (start) {
    case SERVICE_BOOT_START: return "boot";
    case SERVICE_SYSTEM_START: return "system";
    case SERVICE_AUTO_START: return delayed ? "auto-delayed" : "auto";
    case SERVICE_DEMAND_START: return "manual";
    case SERVICE_DISABLED: return "disabled";
    default: return "manual";
  }
}

bool nameParam(const JsonValue* params, std::wstring& name, Failure& err) {
  const JsonValue* v = params && params->kind == JsonValue::Object ? params->find("name") : nullptr;
  if (!v || v->kind != JsonValue::String || v->string.empty() || v->string.size() > 256) {
    err = plainFailure("A service name is required.");
    return false;
  }
  for (unsigned char c : v->string) {
    if (c < 0x20 || c == 0x7f || c == '/' || c == '\\') {
      err = plainFailure("Invalid service name.");
      return false;
    }
  }
  name = widen(v->string);
  return true;
}

struct ScHandle {
  SC_HANDLE h = nullptr;
  ScHandle() = default;
  ScHandle(const ScHandle&) = delete;
  ScHandle& operator=(const ScHandle&) = delete;
  ~ScHandle() { if (h) CloseServiceHandle(h); }
};

bool openService(ScHandle& scm, ScHandle& svc, const std::wstring& name, DWORD scmAccess, DWORD access, Failure& err) {
  if (svc.h) { CloseServiceHandle(svc.h); svc.h = nullptr; }
  if (scm.h) { CloseServiceHandle(scm.h); scm.h = nullptr; }
  scm.h = OpenSCManagerW(nullptr, nullptr, scmAccess);
  if (!scm.h) { err = win32Failure(GetLastError()); return false; }
  svc.h = OpenServiceW(scm.h, name.c_str(), access);
  if (!svc.h) { err = win32Failure(GetLastError()); return false; }
  return true;
}

bool queryStatus(SC_HANDLE svc, SERVICE_STATUS_PROCESS& status, Failure& err) {
  DWORD needed = 0;
  if (!QueryServiceStatusEx(svc, SC_STATUS_PROCESS_INFO, (LPBYTE)&status, sizeof status, &needed)) {
    err = win32Failure(GetLastError());
    return false;
  }
  return true;
}

QUERY_SERVICE_CONFIGW* queryConfig(SC_HANDLE svc, std::vector<unsigned char>& buffer, Failure& err) {
  DWORD needed = 0;
  QueryServiceConfigW(svc, nullptr, 0, &needed);
  if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || needed == 0) { err = win32Failure(GetLastError()); return nullptr; }
  buffer.assign(needed, 0);
  if (!QueryServiceConfigW(svc, (QUERY_SERVICE_CONFIGW*)buffer.data(), needed, &needed)) { err = win32Failure(GetLastError()); return nullptr; }
  return (QUERY_SERVICE_CONFIGW*)buffer.data();
}

bool isDelayedAuto(SC_HANDLE svc) {
  SERVICE_DELAYED_AUTO_START_INFO info = {};
  DWORD needed = 0;
  if (!QueryServiceConfig2W(svc, SERVICE_CONFIG_DELAYED_AUTO_START_INFO, (LPBYTE)&info, sizeof info, &needed)) return false;
  return info.fDelayedAutostart != FALSE;
}

// Polls until the service reaches `target`. A pending state keeps waiting (up to ~20s); a settled state that is
// not the target, or a timeout, is an error.
bool waitForState(SC_HANDLE svc, DWORD target, const char* label, DWORD& finalState, Failure& err) {
  const ULONGLONG deadline = GetTickCount64() + 20000;
  for (;;) {
    SERVICE_STATUS_PROCESS status = {};
    if (!queryStatus(svc, status, err)) return false;
    finalState = status.dwCurrentState;
    if (finalState == target) return true;
    const bool pending = finalState == SERVICE_START_PENDING || finalState == SERVICE_STOP_PENDING ||
                         finalState == SERVICE_PAUSE_PENDING || finalState == SERVICE_CONTINUE_PENDING;
    if (!pending || GetTickCount64() > deadline) break;
    Sleep(150);
  }
  err = plainFailure((std::string("The service did not reach the ") + label + " state (now " + stateName(finalState) + ").").c_str());
  return false;
}

bool doStop(SC_HANDLE svc, Failure& err) {
  SERVICE_STATUS st = {};
  if (!ControlService(svc, SERVICE_CONTROL_STOP, &st)) { err = win32Failure(GetLastError()); return false; }
  return true;
}

}  // namespace

bool handleSvcConfig(const JsonValue* params, std::string& result, Failure& err) {
  std::wstring name;
  if (!nameParam(params, name, err)) return false;
  ScHandle scm, svc;
  bool canEnumDependents = true;
  if (!openService(scm, svc, name, GENERIC_READ, SERVICE_QUERY_CONFIG | SERVICE_QUERY_STATUS | SERVICE_ENUMERATE_DEPENDENTS, err)) {
    // Some protected services (e.g. RpcSs) deny the dependents right to non-admins; retry without it.
    if (err.code != ERROR_ACCESS_DENIED) return false;
    canEnumDependents = false;
    if (!openService(scm, svc, name, GENERIC_READ, SERVICE_QUERY_CONFIG | SERVICE_QUERY_STATUS, err)) return false;
  }
  SERVICE_STATUS_PROCESS status = {};
  if (!queryStatus(svc.h, status, err)) return false;
  std::vector<unsigned char> buffer;
  QUERY_SERVICE_CONFIGW* cfg = queryConfig(svc.h, buffer, err);
  if (!cfg) return false;

  std::string description;
  {
    DWORD needed = 0;
    QueryServiceConfig2W(svc.h, SERVICE_CONFIG_DESCRIPTION, nullptr, 0, &needed);
    if (GetLastError() == ERROR_INSUFFICIENT_BUFFER && needed > 0) {
      std::vector<unsigned char> d(needed, 0);
      if (QueryServiceConfig2W(svc.h, SERVICE_CONFIG_DESCRIPTION, d.data(), needed, &needed)) {
        const SERVICE_DESCRIPTIONW* desc = (const SERVICE_DESCRIPTIONW*)d.data();
        if (desc->lpDescription) description = narrow(desc->lpDescription, wcslen(desc->lpDescription));
      }
    }
  }

  const bool delayed = cfg->dwStartType == SERVICE_AUTO_START && isDelayedAuto(svc.h);
  const bool isDriver = (cfg->dwServiceType & (SERVICE_KERNEL_DRIVER | SERVICE_FILE_SYSTEM_DRIVER)) != 0;
  auto wide = [](const wchar_t* v) { return v ? narrow(v, wcslen(v)) : std::string(); };

  std::string out = "{\"config\":{\"name\":";
  appendJsonString(out, narrow(name));
  out += ",\"displayName\":";
  appendJsonString(out, wide(cfg->lpDisplayName));
  out += ",\"description\":";
  appendJsonString(out, description);
  out += std::string(",\"state\":\"") + stateName(status.dwCurrentState) + "\"";
  out += std::string(",\"type\":\"") + typeName(cfg->dwServiceType) + "\"";
  out += std::string(",\"startType\":\"") + startTypeName(cfg->dwStartType, delayed) + "\"";
  out += ",\"pid\":" + std::to_string(status.dwProcessId);
  out += ",\"binaryPath\":";
  appendJsonString(out, wide(cfg->lpBinaryPathName));
  out += ",\"account\":";
  appendJsonString(out, wide(cfg->lpServiceStartName));
  out += std::string(",\"canPauseContinue\":") + ((status.dwControlsAccepted & SERVICE_ACCEPT_PAUSE_CONTINUE) ? "true" : "false");
  out += std::string(",\"isDriver\":") + (isDriver ? "true" : "false");

  out += ",\"dependencies\":[";
  bool first = true;
  if (cfg->lpDependencies) {
    for (const wchar_t* p = cfg->lpDependencies; *p; p += wcslen(p) + 1) {
      if (!first) out.push_back(',');
      first = false;
      appendJsonWide(out, p, wcslen(p));
    }
  }
  out += "],\"dependents\":[";

  first = true;
  {
    DWORD needed = 0, count = 0;
    std::vector<unsigned char> dep(4096);
    BOOL ok = canEnumDependents && EnumDependentServicesW(svc.h, SERVICE_STATE_ALL, (LPENUM_SERVICE_STATUSW)dep.data(), (DWORD)dep.size(), &needed, &count);
    if (canEnumDependents && !ok && GetLastError() == ERROR_MORE_DATA) {
      dep.assign(needed, 0);
      ok = EnumDependentServicesW(svc.h, SERVICE_STATE_ALL, (LPENUM_SERVICE_STATUSW)dep.data(), (DWORD)dep.size(), &needed, &count);
    }
    if (ok) {
      const ENUM_SERVICE_STATUSW* items = (const ENUM_SERVICE_STATUSW*)dep.data();
      for (DWORD i = 0; i < count; i++) {
        if (!first) out.push_back(',');
        first = false;
        appendJsonWide(out, items[i].lpServiceName, wcslen(items[i].lpServiceName));
      }
    }
  }
  out += "]}}";
  result = std::move(out);
  return true;
}

bool handleSvcControl(const JsonValue* params, std::string& result, Failure& err) {
  std::wstring name;
  if (!nameParam(params, name, err)) return false;
  const JsonValue* a = params->find("action");
  if (!a || a->kind != JsonValue::String) { err = plainFailure("A service action is required."); return false; }
  const std::string& action = a->string;
  DWORD access = SERVICE_QUERY_STATUS;
  if (action == "start") access |= SERVICE_START;
  else if (action == "stop") access |= SERVICE_STOP;
  else if (action == "restart") access |= SERVICE_START | SERVICE_STOP;
  else if (action == "pause" || action == "continue") access |= SERVICE_PAUSE_CONTINUE;
  else { err = plainFailure("Unknown service action."); return false; }

  ScHandle scm, svc;
  if (!openService(scm, svc, name, SC_MANAGER_CONNECT, access, err)) return false;
  DWORD finalState = SERVICE_STOPPED;
  if (action == "start") {
    if (!StartServiceW(svc.h, 0, nullptr)) { err = win32Failure(GetLastError()); return false; }
    if (!waitForState(svc.h, SERVICE_RUNNING, "running", finalState, err)) return false;
  } else if (action == "stop") {
    if (!doStop(svc.h, err)) return false;
    if (!waitForState(svc.h, SERVICE_STOPPED, "stopped", finalState, err)) return false;
  } else if (action == "restart") {
    if (!doStop(svc.h, err) && err.code != ERROR_SERVICE_NOT_ACTIVE) return false;
    if (!waitForState(svc.h, SERVICE_STOPPED, "stopped", finalState, err)) return false;
    if (!StartServiceW(svc.h, 0, nullptr)) { err = win32Failure(GetLastError()); return false; }
    if (!waitForState(svc.h, SERVICE_RUNNING, "running", finalState, err)) return false;
  } else {
    SERVICE_STATUS st = {};
    const bool pause = action == "pause";
    if (!ControlService(svc.h, pause ? SERVICE_CONTROL_PAUSE : SERVICE_CONTROL_CONTINUE, &st)) { err = win32Failure(GetLastError()); return false; }
    if (!waitForState(svc.h, pause ? SERVICE_PAUSED : SERVICE_RUNNING, pause ? "paused" : "running", finalState, err)) return false;
  }
  result = std::string("{\"state\":\"") + stateName(finalState) + "\"}";
  return true;
}

bool handleSvcSetStartType(const JsonValue* params, std::string& result, Failure& err) {
  std::wstring name;
  if (!nameParam(params, name, err)) return false;
  const JsonValue* t = params->find("startType");
  if (!t || t->kind != JsonValue::String) { err = plainFailure("A start type is required."); return false; }
  DWORD target;
  bool delayed = false;
  if (t->string == "auto") target = SERVICE_AUTO_START;
  else if (t->string == "auto-delayed") { target = SERVICE_AUTO_START; delayed = true; }
  else if (t->string == "manual") target = SERVICE_DEMAND_START;
  else if (t->string == "disabled") target = SERVICE_DISABLED;
  else { err = plainFailure("Unsupported start type (boot and system are not allowed)."); return false; }

  ScHandle scm, svc;
  if (!openService(scm, svc, name, SC_MANAGER_CONNECT, SERVICE_CHANGE_CONFIG | SERVICE_QUERY_CONFIG, err)) return false;
  std::vector<unsigned char> buffer;
  QUERY_SERVICE_CONFIGW* cfg = queryConfig(svc.h, buffer, err);
  if (!cfg) return false;
  if (cfg->dwStartType == SERVICE_BOOT_START || cfg->dwStartType == SERVICE_SYSTEM_START) {
    err = plainFailure("Boot and system start services (drivers) cannot be changed.");
    return false;
  }
  const bool wasDelayed = cfg->dwStartType == SERVICE_AUTO_START && isDelayedAuto(svc.h);
  const char* previous = startTypeName(cfg->dwStartType, wasDelayed);

  if (!delayed && wasDelayed) {
    SERVICE_DELAYED_AUTO_START_INFO info = {FALSE};
    ChangeServiceConfig2W(svc.h, SERVICE_CONFIG_DELAYED_AUTO_START_INFO, &info);
  }
  if (!ChangeServiceConfigW(svc.h, SERVICE_NO_CHANGE, target, SERVICE_NO_CHANGE, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr)) {
    err = win32Failure(GetLastError());
    return false;
  }
  if (delayed) {
    SERVICE_DELAYED_AUTO_START_INFO info = {TRUE};
    if (!ChangeServiceConfig2W(svc.h, SERVICE_CONFIG_DELAYED_AUTO_START_INFO, &info)) { err = win32Failure(GetLastError()); return false; }
  }
  result = std::string("{\"previous\":\"") + previous + "\"}";
  return true;
}

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
