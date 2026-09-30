// DUDE Windows system helper: bounded Restart Manager file-lock inspection.
#include "common.hpp"

#include <RestartManager.h>
#include <algorithm>
#include <cwctype>
#include <vector>
#include <map>
#include <cwchar>

#pragma comment(lib, "Rstrtmgr.lib")

namespace sys {
namespace {

struct RmSession {
  DWORD key = 0;
  DWORD error = ERROR_SUCCESS;
  bool active = false;
  RmSession() { WCHAR sessionKey[RM_SESSION_KEY_LEN]{}; error = RmStartSession(&key, 0, sessionKey); active = error == ERROR_SUCCESS; }
  ~RmSession() { if (active) RmEndSession(key); }
};

bool elevated() {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
  TOKEN_ELEVATION info{};
  DWORD size = 0;
  bool result = GetTokenInformation(token, TokenElevation, &info, sizeof(info), &size) && info.TokenIsElevated;
  CloseHandle(token);
  return result;
}

bool getOwnerList(DWORD key, std::vector<RM_PROCESS_INFO>& owners, DWORD& code, DWORD* reboot = nullptr) {
  UINT needed = 0, count = 0;
  DWORD reasons = 0;
  DWORD status = RmGetList(key, &needed, &count, nullptr, &reasons);
  if (reboot) *reboot = reasons;
  if (status == ERROR_SUCCESS) { owners.clear(); return true; }
  if (status != ERROR_MORE_DATA) { code = status; return false; }
  for (int attempt = 0; attempt != 3; ++attempt) {
    std::vector<RM_PROCESS_INFO> rows(needed);
    count = needed;
    status = RmGetList(key, &needed, &count, rows.data(), &reasons);
    if (reboot) *reboot = reasons;
    if (status == ERROR_SUCCESS) { rows.resize(count); owners.swap(rows); return true; }
    if (status != ERROR_MORE_DATA) { code = status; return false; }
  }
  code = ERROR_MORE_DATA;
  return false;
}

bool collectResources(const JsonValue* params, std::vector<std::wstring>& resources, bool& partial, Failure& err) {
  const JsonValue* path = params ? params->find("path") : nullptr;
  if (!path || path->kind != JsonValue::String || path->string.empty()) { err = plainFailure("File lock path is required."); return false; }
  std::wstring target = widen(path->string);
  DWORD attrs = GetFileAttributesW(target.c_str());
  if (attrs == INVALID_FILE_ATTRIBUTES) { err = win32Failure(GetLastError()); return false; }

  const ULONGLONG deadline = GetTickCount64() + 2500;
  if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
    std::vector<std::wstring> pending{target};
    while (!pending.empty()) {
      if (GetTickCount64() >= deadline || resources.size() >= 2048) { partial = true; break; }
      std::wstring dir = std::move(pending.back()); pending.pop_back();
      std::wstring glob = dir;
      if (!glob.empty() && glob.back() != L'\\') glob.push_back(L'\\');
      glob += L"*";
      WIN32_FIND_DATAW item{};
      HANDLE find = FindFirstFileW(glob.c_str(), &item);
      if (find == INVALID_HANDLE_VALUE) { partial = true; continue; }
      do {
        if (wcscmp(item.cFileName, L".") == 0 || wcscmp(item.cFileName, L"..") == 0) continue;
        std::wstring child = dir;
        if (!child.empty() && child.back() != L'\\') child.push_back(L'\\');
        child += item.cFileName;
        if (item.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) pending.push_back(std::move(child));
        else resources.push_back(std::move(child));
        if (resources.size() >= 2048 || GetTickCount64() >= deadline) { partial = true; break; }
      } while (FindNextFileW(find, &item));
      FindClose(find);
      if (partial) break;
    }
    if (resources.empty()) resources.push_back(target);
  } else resources.push_back(target);

  partial = partial || GetTickCount64() >= deadline;
  return true;
}

std::string ownerRows(const std::vector<RM_PROCESS_INFO>& owners) {
  std::string rows;
  for (const auto& owner : owners) {
    if (!rows.empty()) rows.push_back(',');
    ULONGLONG start = (static_cast<ULONGLONG>(owner.Process.ProcessStartTime.dwHighDateTime) << 32) | owner.Process.ProcessStartTime.dwLowDateTime;
    rows += "{\"pid\":" + std::to_string(owner.Process.dwProcessId) + ",\"startKey\":\"" + std::to_string(start) + "\",\"name\":";
    appendJsonWide(rows, owner.strAppName, wcsnlen(owner.strAppName, CCH_RM_MAX_APP_NAME));
    rows += ",\"service\":";
    appendJsonWide(rows, owner.strServiceShortName, wcsnlen(owner.strServiceShortName, CCH_RM_MAX_SVC_NAME));
    rows += ",\"applicationType\":" + std::to_string((int)owner.ApplicationType) +
            ",\"restartable\":" + (owner.bRestartable ? "true" : "false") +
            ",\"appStatus\":" + std::to_string((unsigned)owner.AppStatus) +
            ",\"sessionId\":" + std::to_string(owner.TSSessionId) + "}";
  }
  return rows;
}

bool lockList(const JsonValue* params, std::string& result, Failure& err) {
  std::vector<std::wstring> resources;
  bool partial = false;
  if (!collectResources(params, resources, partial, err)) return false;
  RmSession session;
  if (!session.active) { err = win32Failure(session.error); return false; }
  std::vector<LPCWSTR> names;
  names.reserve(resources.size());
  for (const auto& resource : resources) names.push_back(resource.c_str());
  DWORD status = RmRegisterResources(session.key, (UINT)names.size(), names.data(), 0, nullptr, 0, nullptr);
  if (status != ERROR_SUCCESS) { err = win32Failure(status); return false; }
  std::vector<RM_PROCESS_INFO> owners;
  DWORD code = 0, reboot = 0;
  if (!getOwnerList(session.key, owners, code, &reboot)) { err = win32Failure(code); return false; }
  result = "{\"owners\":[" + ownerRows(owners) + "],\"rebootReasons\":" + std::to_string(reboot) + ",\"partial\":" + (partial ? "true" : "false") +
           (partial ? ",\"warning\":\"Folder scan reached its 2048 file or 2.5 second budget.\"" : "") + "}";
  return true;
}

// Cancels a blocked RmShutdown/RmRestart after a budget so the helper stays inside the caller's 15 second RPC timeout.
struct RmTask { DWORD session; bool restart; DWORD status; volatile LONG state; }; // state: 0 running, 1 finished, 2 abandoned
DWORD WINAPI rmTaskThread(LPVOID param) {
  RmTask* task = static_cast<RmTask*>(param);
  task->status = task->restart ? RmRestart(task->session, 0, nullptr) : RmShutdown(task->session, 0 /* graceful: never RmForceShutdown */, nullptr);
  if (InterlockedExchange(&task->state, 1) == 2) delete task;
  return 0;
}
// Returns the RM status, or ERROR_SEM_TIMEOUT when the task is still blocked after cancellation; the task is then abandoned
// (its thread frees it) and the caller must not end the session while it runs.
DWORD runRmTask(DWORD session, bool restart, DWORD budgetMs, DWORD graceMs, bool& abandoned) {
  RmTask* task = new RmTask{session, restart, ERROR_GEN_FAILURE, 0};
  HANDLE thread = CreateThread(nullptr, 0, rmTaskThread, task, 0, nullptr);
  if (!thread) { DWORD code = GetLastError(); delete task; return code; }
  DWORD wait = WaitForSingleObject(thread, budgetMs);
  if (wait != WAIT_OBJECT_0) {
    RmCancelCurrentTask(session);
    wait = WaitForSingleObject(thread, graceMs);
  }
  CloseHandle(thread);
  if (wait != WAIT_OBJECT_0 && InterlockedExchange(&task->state, 2) != 1) { abandoned = true; return ERROR_SEM_TIMEOUT; }
  DWORD status = task->status;
  delete task;
  return status;
}

// Graceful release: RmShutdown with flags 0 (apps get WM_QUERYENDSESSION and may decline; nothing is force-closed),
// then optionally RmRestart in the same session. Reports per-app status after each stage.
bool lockRmRelease(const JsonValue* params, std::string& result, Failure& err) {
  const JsonValue* restartValue = params ? params->find("restartAfter") : nullptr;
  bool restartAfter = restartValue && restartValue->kind == JsonValue::Bool && restartValue->boolean;
  std::vector<std::wstring> resources;
  bool partial = false;
  if (!collectResources(params, resources, partial, err)) return false;
  RmSession session;
  if (!session.active) { err = win32Failure(session.error); return false; }
  std::vector<LPCWSTR> names;
  names.reserve(resources.size());
  for (const auto& resource : resources) names.push_back(resource.c_str());
  DWORD status = RmRegisterResources(session.key, (UINT)names.size(), names.data(), 0, nullptr, 0, nullptr);
  if (status != ERROR_SUCCESS) { err = win32Failure(status); return false; }
  std::vector<RM_PROCESS_INFO> before, after;
  DWORD code = 0, reboot = 0, ignored = 0;
  bool abandoned = false;
  if (!getOwnerList(session.key, before, code, &reboot)) { err = win32Failure(code); return false; }
  DWORD shutdownStatus = before.empty() ? ERROR_SUCCESS : runRmTask(session.key, false, 6000, 2000, abandoned);
  DWORD restartStatus = ERROR_SUCCESS;
  bool restartAttempted = false;
  bool listedAfter = !abandoned && getOwnerList(session.key, after, code, &ignored);
  if (restartAfter && shutdownStatus == ERROR_SUCCESS && !before.empty() && !abandoned) {
    restartAttempted = true;
    restartStatus = runRmTask(session.key, true, 3000, 1500, abandoned);
    std::vector<RM_PROCESS_INFO> restarted;
    if (!abandoned && getOwnerList(session.key, restarted, code, &ignored)) { after.swap(restarted); listedAfter = true; }
  }
  if (abandoned) session.active = false; // leak the session rather than block on a task that ignored cancellation
  result = "{\"owners\":[" + ownerRows(before) + "],\"after\":[" + (listedAfter ? ownerRows(after) : std::string()) + "],\"afterKnown\":" + (listedAfter ? "true" : "false") +
           ",\"shutdownStatus\":" + std::to_string(shutdownStatus) + ",\"restartAttempted\":" + (restartAttempted ? "true" : "false") +
           ",\"restartStatus\":" + std::to_string(restartStatus) + ",\"rebootReasons\":" + std::to_string(reboot) +
           ",\"partial\":" + (partial ? "true" : "false") + "}";
  return true;
}
} // namespace

bool handleLockRmList(const JsonValue* params, std::string& result, Failure& err) { return lockList(params, result, err); }
bool handleLockRmRelease(const JsonValue* params, std::string& result, Failure& err) { return lockRmRelease(params, result, err); }
struct NtHandleEntry { PVOID object; ULONG_PTR pid; ULONG_PTR handle; ULONG access; USHORT trace; USHORT typeIndex; ULONG attributes; ULONG reserved; };
struct NtHandleTable { ULONG_PTR count; ULONG_PTR reserved; NtHandleEntry entries[1]; };
typedef LONG(NTAPI* QuerySystemFn)(ULONG, PVOID, ULONG, PULONG);
typedef LONG(NTAPI* QueryObjectFn)(HANDLE, ULONG, PVOID, ULONG, PULONG);
struct UnicodeString { USHORT length; USHORT maximum; PWSTR buffer; };
struct ObjectJob {
  HANDLE duplicate = nullptr;
  QueryObjectFn query = nullptr;
  volatile LONG state = 0; // 0 running, 1 finished, 2 abandoned
  std::wstring type;
  std::wstring name;
};

bool queryObjectText(QueryObjectFn query, HANDLE object, ULONG kind, std::wstring& value) {
  std::vector<unsigned char> buffer(2048);
  for (int attempt = 0; attempt < 3; ++attempt) {
    ULONG needed = 0;
    LONG status = query(object, kind, buffer.data(), (ULONG)buffer.size(), &needed);
    if ((status == (LONG)0xC0000004 || status == (LONG)0xC0000023 || status == (LONG)0x80000005) && needed > buffer.size() && needed <= (1u << 20)) {
      buffer.resize(needed);
      continue;
    }
    if (status < 0) return false;
    const UnicodeString* text = reinterpret_cast<const UnicodeString*>(buffer.data());
    if (!text->buffer || text->length == 0 || text->length > 65534) return false;
    value.assign(text->buffer, text->length / sizeof(wchar_t));
    return true;
  }
  return false;
}

DWORD WINAPI objectWorker(LPVOID param) {
  ObjectJob* job = static_cast<ObjectJob*>(param);
  queryObjectText(job->query, job->duplicate, 2 /*ObjectTypeInformation*/, job->type);
  if (job->type == L"File") queryObjectText(job->query, job->duplicate, 1 /*ObjectNameInformation*/, job->name);
  if (InterlockedExchange(&job->state, 1) == 2) { CloseHandle(job->duplicate); delete job; }
  return 0;
}

int queryObjectBounded(HANDLE duplicate, QueryObjectFn query, std::wstring& type, std::wstring& name, DWORD timeoutMs) {
  ObjectJob* job = new ObjectJob(); job->duplicate = duplicate; job->query = query;
  HANDLE thread = CreateThread(nullptr, 0, objectWorker, job, 0, nullptr);
  if (!thread) { CloseHandle(duplicate); delete job; return 0; }
  DWORD wait = WaitForSingleObject(thread, timeoutMs);
  if (wait != WAIT_OBJECT_0) {
    CancelSynchronousIo(thread);
    wait = WaitForSingleObject(thread, 30);
  }
  bool finished = wait == WAIT_OBJECT_0;
  if (!finished) finished = InterlockedExchange(&job->state, 2) == 1;
  CloseHandle(thread);
  if (!finished) return -1; // worker owns job and duplicate; caller caps abandoned workers
  type.swap(job->type); name.swap(job->name); CloseHandle(job->duplicate); delete job;
  return 1;
}

std::wstring lowerPath(std::wstring text) {
  std::transform(text.begin(), text.end(), text.begin(), [](wchar_t ch) { return (wchar_t)towlower(ch); });
  std::replace(text.begin(), text.end(), L'/', L'\\');
  return text;
}

// Converts an NT device path (\\Device\\HarddiskVolumeN\\...) back to a drive path for display and matching.
std::wstring dosPath(const std::wstring& ntPath) {
  wchar_t drives[512]{};
  DWORD n = GetLogicalDriveStringsW(511, drives);
  for (DWORD i = 0; i < n && drives[i];) {
    std::wstring root(drives + i);
    i += (DWORD)root.size() + 1;
    wchar_t drive[] = { root[0], L':', 0 };
    wchar_t device[1024]{};
    if (!QueryDosDeviceW(drive, device, 1024)) continue;
    std::wstring prefix(device);
    if (ntPath.size() > prefix.size() && _wcsnicmp(ntPath.c_str(), prefix.c_str(), prefix.size()) == 0 && ntPath[prefix.size()] == L'\\')
      return std::wstring(drive) + ntPath.substr(prefix.size());
  }
  return ntPath;
}

std::wstring nativePath(std::wstring path) {
  if (path.size() >= 3 && path[1] == L':' && (path[2] == L'\\' || path[2] == L'/')) {
    wchar_t drive[] = { path[0], L':', 0 };
    wchar_t device[1024]{};
    DWORD n = QueryDosDeviceW(drive, device, 1024);
    if (n) return std::wstring(device) + path.substr(2);
  }
  return path;
}

bool handleScan(const JsonValue* params, std::string& result, Failure& err) {
  if (!elevated()) { err = plainFailure("Handle scan requires an elevated helper."); return false; }
  const JsonValue* value = params ? params->find("path") : nullptr;
  if (!value || value->kind != JsonValue::String || value->string.empty()) { err = plainFailure("File lock path is required."); return false; }
  std::wstring target = lowerPath(nativePath(widen(value->string)));
  DWORD attrs = GetFileAttributesW(widen(value->string).c_str());
  if (attrs == INVALID_FILE_ATTRIBUTES) { err = win32Failure(GetLastError()); return false; }
  bool folder = (attrs & FILE_ATTRIBUTE_DIRECTORY) != 0;
  if (folder && !target.empty() && target.back() != L'\\') target.push_back(L'\\');
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  QuerySystemFn querySystem = ntdll ? (QuerySystemFn)(void*)GetProcAddress(ntdll, "NtQuerySystemInformation") : nullptr;
  QueryObjectFn queryObject = ntdll ? (QueryObjectFn)(void*)GetProcAddress(ntdll, "NtQueryObject") : nullptr;
  if (!querySystem || !queryObject) { err = win32Failure(ERROR_PROC_NOT_FOUND); return false; }
  const ULONGLONG deadline = GetTickCount64() + 3000;
  std::vector<unsigned char> snapshot(8u << 20);
  ULONG needed = 0;
  LONG status = 0;
  for (int i = 0; i < 5; ++i) {
    status = querySystem(64 /*SystemExtendedHandleInformation*/, snapshot.data(), (ULONG)snapshot.size(), &needed);
    if (status != (LONG)0xC0000004) break;
    if (needed > (64u << 20)) { status = (LONG)0xC0000004; break; }
    snapshot.resize(std::max<size_t>(snapshot.size() * 2, needed));
  }
  if (status < 0) { err = win32Failure(status == (LONG)0xC0000004 ? ERROR_MORE_DATA : ERROR_GEN_FAILURE); return false; }
  const NtHandleTable* table = reinterpret_cast<const NtHandleTable*>(snapshot.data());
  size_t count = std::min<size_t>((size_t)table->count, (snapshot.size() - offsetof(NtHandleTable, entries)) / sizeof(NtHandleEntry));
  const size_t handleCap = 20000;
  const size_t processCap = 512;
  const size_t workerCap = 8;
  size_t examined = 0, workers = 0, abandoned = 0;
  bool partial = false;
  struct TargetProcess { HANDLE handle; std::string startKey; std::string name; };
  std::map<DWORD, TargetProcess> processHandles;
  std::string rows;
  for (size_t i = 0; i < count; ++i) {
    if (GetTickCount64() >= deadline || examined >= handleCap || workers >= processCap) { partial = true; break; }
    const NtHandleEntry& entry = table->entries[i];
    if (entry.pid == 0 || entry.pid == GetCurrentProcessId()) continue;
    auto found = processHandles.find((DWORD)entry.pid);
    if (found == processHandles.end()) {
      HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_DUP_HANDLE, FALSE, (DWORD)entry.pid);
      if (!process) continue;
      FILETIME created{}, exited{}, kernel{}, user{};
      if (!GetProcessTimes(process, &created, &exited, &kernel, &user)) { CloseHandle(process); continue; }
      ULONGLONG start = (static_cast<ULONGLONG>(created.dwHighDateTime) << 32) | created.dwLowDateTime;
      wchar_t image[32768]{}; DWORD imageLength = 32768;
      std::string processName = "Unknown process";
      if (QueryFullProcessImageNameW(process, 0, image, &imageLength) && imageLength) {
        std::wstring full(image, imageLength); size_t slash = full.find_last_of(L"\\\\/");
        processName = narrow(slash == std::wstring::npos ? full : full.substr(slash + 1));
      }
      found = processHandles.emplace((DWORD)entry.pid, TargetProcess{process, std::to_string(start), processName}).first;
      ++workers;
    }
    ++examined;
    HANDLE duplicate = nullptr;
    if (!DuplicateHandle(found->second.handle, (HANDLE)(ULONG_PTR)entry.handle, GetCurrentProcess(), &duplicate, 0, FALSE, DUPLICATE_SAME_ACCESS)) continue;
    std::wstring type, name;
    int queried = queryObjectBounded(duplicate, queryObject, type, name, 120);
    if (queried < 0) { if (++abandoned >= workerCap) { partial = true; break; } continue; }
    if (queried == 0 || type != L"File" || name.empty()) continue;
    std::wstring candidate = lowerPath(name);
    bool match = folder ? candidate.compare(0, target.size(), target) == 0 : candidate == target;
    if (!match) continue;
    if (!rows.empty()) rows.push_back(',');
    rows += "{\"pid\":" + std::to_string((DWORD)entry.pid) + ",\"startKey\":\"" + found->second.startKey + "\",\"name\":";
    appendJsonString(rows, found->second.name);
    char handleText[32];
    snprintf(handleText, sizeof(handleText), "0x%llX", (unsigned long long)entry.handle);
    rows += std::string(",\"handle\":\"") + handleText + "\"";
    rows += ",\"path\":";
    std::wstring display = dosPath(name);
    appendJsonWide(rows, display.data(), display.size());
    rows += "}";
  }
  if (examined >= handleCap || workers >= processCap || GetTickCount64() >= deadline) partial = true;
  for (auto& item : processHandles) CloseHandle(item.second.handle);
  result = "{\"owners\":[" + rows + "],\"partial\":" + (partial ? "true" : "false") +
    (partial ? ",\"warning\":\"Elevated handle scan reached its 20000 handle, 512 process or 3 second budget; results are partial.\"" : "") + "}";
  return true;
}
bool handleLockHandleScan(const JsonValue* params, std::string& result, Failure& err) {
  if (!elevated()) { err = plainFailure("Handle scan requires an elevated helper."); return false; }
  return handleScan(params, result, err);
}

} // namespace sys