// DUDE Windows system helper: process.detail / process.modules / process.handles
// (DUDE_PRD.md §21 Phase 31, Milestone 595).
//
// Read-only. Processes are opened with PROCESS_QUERY_LIMITED_INFORMATION; PROCESS_VM_READ is added
// only for the PEB reads (current directory / environment) and PROCESS_DUP_HANDLE only for the handle
// view (handles are duplicated into this helper solely to ask the kernel for their type and name; the
// target is never written to). Every method first checks the caller's `startKey` against the
// process's real creation time, so a reused PID is never mistaken for the process the UI listed.
#include "common.hpp"

#include <sddl.h>
#include <tlhelp32.h>

#include <cstring>
#include <map>
#include <utility>

namespace sys {

namespace {

typedef LONG(NTAPI* NtQueryInformationProcessFn)(HANDLE, ULONG, PVOID, ULONG, PULONG);
typedef LONG(NTAPI* NtQueryObjectFn)(HANDLE, ULONG, PVOID, ULONG, PULONG);
typedef LONG(NTAPI* NtQuerySystemInformationFn)(ULONG, PVOID, ULONG, PULONG);
typedef ULONG(NTAPI* RtlNtStatusToDosErrorFn)(LONG);

const LONG kStatusInfoLengthMismatch = (LONG)0xC0000004;
const LONG kStatusBufferTooSmall = (LONG)0xC0000023;
const LONG kStatusBufferOverflow = (LONG)0x80000005;

template <typename F>
F ntProc(const char* name) {
  HMODULE m = GetModuleHandleW(L"ntdll.dll");
  return m ? (F)(void*)GetProcAddress(m, name) : nullptr;
}

DWORD ntToWin32(LONG status) {
  static RtlNtStatusToDosErrorFn fn = ntProc<RtlNtStatusToDosErrorFn>("RtlNtStatusToDosError");
  return fn ? fn(status) : ERROR_GEN_FAILURE;
}

bool isBufferShort(LONG s) { return s == kStatusInfoLengthMismatch || s == kStatusBufferTooSmall || s == kStatusBufferOverflow; }

struct UStr {
  USHORT Length;
  USHORT MaximumLength;
  PWSTR Buffer;
};

struct Owned {
  HANDLE h = nullptr;
  Owned() = default;
  ~Owned() { if (h) CloseHandle(h); }
  Owned(const Owned&) = delete;
  Owned& operator=(const Owned&) = delete;
};

// ---- ProcessRef ------------------------------------------------------------------------------

struct ProcessRef {
  DWORD pid = 0;
  unsigned long long startKey = 0;
};

bool parseRef(const JsonValue* params, ProcessRef& ref, Failure& err) {
  const JsonValue* pid = params && params->kind == JsonValue::Object ? params->find("pid") : nullptr;
  const JsonValue* key = params && params->kind == JsonValue::Object ? params->find("startKey") : nullptr;
  if (!pid || pid->kind != JsonValue::Number || pid->number < 0 || pid->number > 4294967295.0 ||
      pid->number != (double)(unsigned long long)pid->number || !key || key->kind != JsonValue::String ||
      key->string.empty() || key->string.size() > 20) {
    err = plainFailure("Invalid process reference.");
    return false;
  }
  unsigned long long value = 0;
  for (char c : key->string) {
    if (c < '0' || c > '9') {
      err = plainFailure("Invalid process reference.");
      return false;
    }
    unsigned long long next = value * 10ULL + (unsigned long long)(c - '0');
    if (value != 0 && next / 10ULL != value) {  // overflow
      err = plainFailure("Invalid process reference.");
      return false;
    }
    value = next;
  }
  ref.pid = (DWORD)pid->number;
  ref.startKey = value;
  return true;
}

Failure processGone() {
  Failure f;
  f.message = "The process has exited or its PID was reused.";
  f.code = ERROR_NOT_FOUND;
  f.hasCode = true;
  return f;
}

// Opens the process with `access` and proves it is the instance the caller listed.
bool openVerified(const ProcessRef& ref, DWORD access, HANDLE& out, Failure& err) {
  HANDLE h = OpenProcess(access, FALSE, ref.pid);
  if (!h) {
    DWORD e = GetLastError();
    err = e == ERROR_INVALID_PARAMETER ? processGone() : win32Failure(e);
    return false;
  }
  FILETIME created, exited, kernel, user;
  if (!GetProcessTimes(h, &created, &exited, &kernel, &user)) {
    DWORD e = GetLastError();
    CloseHandle(h);
    err = win32Failure(e);
    return false;
  }
  ULARGE_INTEGER u;
  u.LowPart = created.dwLowDateTime;
  u.HighPart = created.dwHighDateTime;
  if (u.QuadPart != ref.startKey) {
    CloseHandle(h);
    err = processGone();
    return false;
  }
  out = h;
  return true;
}

bool isElevatedSelf() {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
  TOKEN_ELEVATION e = {};
  DWORD n = 0;
  BOOL ok = GetTokenInformation(token, TokenElevation, &e, sizeof e, &n);
  CloseHandle(token);
  return ok && e.TokenIsElevated;
}

std::string hexAddress(unsigned long long v) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "0x%llx", v);
  return buf;
}

std::string quoted(const std::string& v) {
  std::string out;
  appendJsonString(out, v);
  return out;
}

// ---- process.detail --------------------------------------------------------------------------

struct FieldErrors {
  std::vector<std::pair<std::string, std::string>> items;
  void add(const char* field, DWORD code) { items.emplace_back(field, win32Failure(code).message); }
  void addNt(const char* field, LONG status) { add(field, ntToWin32(status)); }
};

bool queryTokenInfo(HANDLE token, TOKEN_INFORMATION_CLASS cls, std::vector<unsigned char>& buf, DWORD& err) {
  DWORD needed = 0;
  GetTokenInformation(token, cls, nullptr, 0, &needed);
  if (needed == 0) {
    err = GetLastError();
    return false;
  }
  buf.assign(needed, 0);
  if (!GetTokenInformation(token, cls, buf.data(), needed, &needed)) {
    err = GetLastError();
    return false;
  }
  return true;
}

// `got` non-null accepts a partial copy as long as some bytes were read.
bool readMem(HANDLE h, unsigned long long addr, void* dst, size_t n, size_t* got, DWORD& err) {
  SIZE_T read = 0;
  BOOL ok = ReadProcessMemory(h, (LPCVOID)(ULONG_PTR)addr, dst, n, &read);
  if (got) *got = (size_t)read;
  if (!ok && !(got && read > 0)) {
    err = GetLastError();
    return false;
  }
  return true;
}

// Reads a remote UNICODE_STRING (32- or 64-bit layout) at `addr`.
bool readRemoteUString(HANDLE h, bool is32, unsigned long long addr, std::wstring& out, DWORD& err) {
  unsigned long long buffer = 0;
  USHORT length = 0;
  if (is32) {
    unsigned char raw[8];
    if (!readMem(h, addr, raw, sizeof raw, nullptr, err)) return false;
    length = (USHORT)(raw[0] | (raw[1] << 8));
    unsigned int p32;
    std::memcpy(&p32, raw + 4, 4);
    buffer = p32;
  } else {
    unsigned char raw[16];
    if (!readMem(h, addr, raw, sizeof raw, nullptr, err)) return false;
    length = (USHORT)(raw[0] | (raw[1] << 8));
    std::memcpy(&buffer, raw + 8, 8);
  }
  out.clear();
  if (length == 0 || buffer == 0) return true;
  out.resize(length / sizeof(wchar_t));
  return readMem(h, buffer, &out[0], out.size() * sizeof(wchar_t), nullptr, err);
}

void buildEnvironmentJson(std::string& json, const std::wstring& block) {
  json = "{";
  bool first = true;
  size_t pos = 0;
  while (pos < block.size()) {
    size_t end = block.find(L'\0', pos);
    if (end == std::wstring::npos) end = block.size();
    if (end == pos) break;  // empty entry terminates the block
    std::wstring entry = block.substr(pos, end - pos);
    pos = end + 1;
    if (entry[0] == L'=') continue;  // hidden per-drive cwd entries such as "=C:=C:\"
    size_t eq = entry.find(L'=');
    if (eq == std::wstring::npos) continue;
    if (!first) json.push_back(',');
    first = false;
    appendJsonWide(json, entry.data(), eq);
    json.push_back(':');
    appendJsonWide(json, entry.data() + eq + 1, entry.size() - eq - 1);
  }
  json.push_back('}');
}

const char* priorityName(DWORD cls) {
  switch (cls) {
    case IDLE_PRIORITY_CLASS: return "idle";
    case BELOW_NORMAL_PRIORITY_CLASS: return "below-normal";
    case NORMAL_PRIORITY_CLASS: return "normal";
    case ABOVE_NORMAL_PRIORITY_CLASS: return "above-normal";
    case HIGH_PRIORITY_CLASS: return "high";
    case REALTIME_PRIORITY_CLASS: return "realtime";
    default: return nullptr;
  }
}

const char* integrityName(DWORD rid) {
  if (rid < 0x1000) return "untrusted";
  if (rid < 0x2000) return "low";
  if (rid < 0x2100) return "medium";
  if (rid < 0x3000) return "medium-plus";
  if (rid < 0x4000) return "high";
  if (rid < 0x5000) return "system";
  return "protected";
}

// Current directory + environment via the target's PEB -> RTL_USER_PROCESS_PARAMETERS. A WOW64
// target is read through its 32-bit PEB (ProcessWow64Information) with the 32-bit layouts. Offsets:
//   x64: PEB.ProcessParameters 0x20, CurrentDirectory 0x38, Environment 0x80, EnvironmentSize 0x3F0
//   x86: PEB.ProcessParameters 0x10, CurrentDirectory 0x24, Environment 0x48, EnvironmentSize 0x290
void collectPeb(const ProcessRef& ref, HANDLE limited, NtQueryInformationProcessFn nt, std::string& cwdJson,
                std::string& envJson, FieldErrors& errors) {
  Owned mem;
  Failure openErr;
  if (!openVerified(ref, PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, mem.h, openErr)) {
    errors.items.emplace_back("currentDirectory", openErr.message);
    errors.items.emplace_back("environment", openErr.message);
    return;
  }
  ULONG_PTR peb32 = 0;
  ULONG ret = 0;
  LONG st = nt(limited, 26 /*ProcessWow64Information*/, &peb32, sizeof peb32, &ret);
  bool is32 = st >= 0 && peb32 != 0;
  unsigned long long peb = peb32;
  if (!is32) {
    struct {
      LONG ExitStatus;
      PVOID PebBaseAddress;
      ULONG_PTR AffinityMask;
      LONG BasePriority;
      ULONG_PTR UniqueProcessId;
      ULONG_PTR InheritedFromUniqueProcessId;
    } pbi = {};
    st = nt(limited, 0 /*ProcessBasicInformation*/, &pbi, sizeof pbi, &ret);
    if (st < 0) {
      errors.addNt("currentDirectory", st);
      errors.addNt("environment", st);
      return;
    }
    peb = (unsigned long long)(ULONG_PTR)pbi.PebBaseAddress;
  }
  DWORD err = 0;
  unsigned long long params = 0;
  if (is32) {
    unsigned int p32 = 0;
    if (readMem(mem.h, peb + 0x10, &p32, 4, nullptr, err)) params = p32;
  } else {
    readMem(mem.h, peb + 0x20, &params, 8, nullptr, err);
  }
  if (params == 0) {
    if (err == 0) err = ERROR_INVALID_DATA;
    errors.add("currentDirectory", err);
    errors.add("environment", err);
    return;
  }

  std::wstring cwd;
  if (readRemoteUString(mem.h, is32, params + (is32 ? 0x24 : 0x38), cwd, err)) cwdJson = quoted(narrow(cwd));
  else errors.add("currentDirectory", err);

  unsigned long long envPtr = 0, envSize = 0;
  bool haveEnv = false;
  if (is32) {
    unsigned int p = 0, s = 0;
    if (readMem(mem.h, params + 0x48, &p, 4, nullptr, err) && readMem(mem.h, params + 0x290, &s, 4, nullptr, err)) {
      envPtr = p;
      envSize = s;
      haveEnv = true;
    }
  } else if (readMem(mem.h, params + 0x80, &envPtr, 8, nullptr, err) && readMem(mem.h, params + 0x3F0, &envSize, 8, nullptr, err)) {
    haveEnv = true;
  }
  if (!haveEnv || envPtr == 0) {
    errors.add("environment", err ? err : ERROR_INVALID_DATA);
    return;
  }
  const unsigned long long kEnvCap = 4ULL << 20;
  if (envSize == 0) envSize = 1ULL << 20;
  if (envSize > kEnvCap) envSize = kEnvCap;
  std::wstring block((size_t)(envSize / sizeof(wchar_t)), L'\0');
  size_t got = 0;
  if (!readMem(mem.h, envPtr, &block[0], block.size() * sizeof(wchar_t), &got, err)) {
    errors.add("environment", err);
    return;
  }
  block.resize(got / sizeof(wchar_t));
  buildEnvironmentJson(envJson, block);
}

// ---- handle-name worker (process.handles) -----------------------------------------------------

struct NameJob {
  HANDLE dup = nullptr;
  NtQueryObjectFn query = nullptr;
  volatile LONG state = 0;  // 0 running, 1 finished, 2 abandoned by the caller (thread cleans up)
  bool has = false;
  std::string name;
};

DWORD WINAPI nameThread(LPVOID param) {
  NameJob* job = (NameJob*)param;
  std::vector<unsigned char> buf(2048);
  for (int i = 0; i < 2; i++) {
    ULONG ret = 0;
    LONG st = job->query(job->dup, 1 /*ObjectNameInformation*/, buf.data(), (ULONG)buf.size(), &ret);
    if (isBufferShort(st)) {
      buf.resize(ret > buf.size() ? ret : buf.size() * 2);
      continue;
    }
    if (st >= 0) {
      const UStr* u = (const UStr*)buf.data();
      if (u->Length && u->Buffer) {
        job->name = narrow(u->Buffer, u->Length / sizeof(wchar_t));
        job->has = true;
      }
    }
    break;
  }
  if (InterlockedExchange(&job->state, 1) == 2) {
    CloseHandle(job->dup);
    delete job;
  }
  return 0;
}

// Takes ownership of `dup`. Returns 1 = name found, 0 = none, -1 = timed out (worker abandoned).
int queryHandleName(HANDLE dup, NtQueryObjectFn query, std::string& name) {
  NameJob* job = new NameJob();
  job->dup = dup;
  job->query = query;
  HANDLE thread = CreateThread(nullptr, 0, nameThread, job, 0, nullptr);
  if (!thread) {
    CloseHandle(dup);
    delete job;
    return 0;
  }
  DWORD w = WaitForSingleObject(thread, 250);
  if (w != WAIT_OBJECT_0) {
    CancelSynchronousIo(thread);  // unblocks a synchronous pipe/file name query
    w = WaitForSingleObject(thread, 250);
  }
  bool finished = w == WAIT_OBJECT_0;
  if (!finished) finished = InterlockedExchange(&job->state, 2) == 1;
  CloseHandle(thread);
  if (!finished) return -1;  // worker frees the job and the duplicate when it eventually returns
  int found = job->has ? 1 : 0;
  if (job->has) name = job->name;
  CloseHandle(job->dup);
  delete job;
  return found;
}

struct HandleEntryEx {
  PVOID Object;
  ULONG_PTR UniqueProcessId;
  ULONG_PTR HandleValue;
  ULONG GrantedAccess;
  USHORT CreatorBackTraceIndex;
  USHORT ObjectTypeIndex;
  ULONG HandleAttributes;
  ULONG Reserved;
};

struct HandleInfoEx {
  ULONG_PTR NumberOfHandles;
  ULONG_PTR Reserved;
  HandleEntryEx Handles[1];
};

bool wantsName(const std::string& type) {
  static const char* kNamed[] = {"File", "Key", "Section", "Mutant", "Event", "Semaphore", "Directory", "SymbolicLink",
                                 "ALPC Port", "Timer", "Job", "Desktop", "WindowStation", "IoCompletion", "Session"};
  for (const char* t : kNamed) {
    if (type == t) return true;
  }
  return false;
}

}  // namespace

bool handleProcessDetail(const JsonValue* params, std::string& result, Failure& err) {
  ProcessRef ref;
  if (!parseRef(params, ref, err)) return false;
  Owned proc;
  if (!openVerified(ref, PROCESS_QUERY_LIMITED_INFORMATION, proc.h, err)) return false;
  NtQueryInformationProcessFn nt = ntProc<NtQueryInformationProcessFn>("NtQueryInformationProcess");
  if (!nt) {
    err = win32Failure(ERROR_PROC_NOT_FOUND);
    return false;
  }

  FieldErrors errors;
  std::string imagePath = "null", commandLine = "null", cwd = "null", env = "null", user = "null", integrity = "null";
  std::string elevated = "null", wow64 = "null", priority = "null", affinity = "null", sysAffinity = "null";

  {
    std::vector<wchar_t> buf(32768);
    DWORD n = (DWORD)buf.size();
    if (QueryFullProcessImageNameW(proc.h, 0, buf.data(), &n)) imagePath = quoted(narrow(buf.data(), n));
    else errors.add("imagePath", GetLastError());
  }

  {
    std::vector<unsigned char> buf(4096);
    bool done = false;
    for (int i = 0; i < 4 && !done; i++) {
      ULONG ret = 0;
      LONG st = nt(proc.h, 60 /*ProcessCommandLineInformation*/, buf.data(), (ULONG)buf.size(), &ret);
      if (isBufferShort(st)) {
        buf.resize(ret > buf.size() ? ret : buf.size() * 2);
        continue;
      }
      done = true;
      if (st < 0) {
        errors.addNt("commandLine", st);
      } else {
        const UStr* u = (const UStr*)buf.data();
        commandLine = quoted(u->Buffer ? narrow(u->Buffer, u->Length / sizeof(wchar_t)) : std::string());
      }
    }
    if (!done) errors.add("commandLine", ERROR_INSUFFICIENT_BUFFER);
  }

  collectPeb(ref, proc.h, nt, cwd, env, errors);

  {
    Owned token;
    if (!OpenProcessToken(proc.h, TOKEN_QUERY, &token.h)) {
      DWORD e = GetLastError();
      errors.add("user", e);
      errors.add("integrityLevel", e);
      errors.add("elevated", e);
    } else {
      std::vector<unsigned char> buf;
      DWORD e = 0;
      if (queryTokenInfo(token.h, TokenUser, buf, e)) {
        PSID sid = ((TOKEN_USER*)buf.data())->User.Sid;
        LPWSTR sidText = nullptr;
        std::string sidJson = "\"\"";
        if (ConvertSidToStringSidW(sid, &sidText)) {
          sidJson = quoted(narrow(sidText, wcslen(sidText)));
          LocalFree(sidText);
        }
        wchar_t name[256], domain[256];
        DWORD nl = 256, dl = 256;
        SID_NAME_USE use;
        std::string nameJson = "\"\"", domainJson = "\"\"";
        if (LookupAccountSidW(nullptr, sid, name, &nl, domain, &dl, &use)) {
          nameJson = quoted(narrow(name, nl));
          domainJson = quoted(narrow(domain, dl));
        }
        user = "{\"name\":" + nameJson + ",\"domain\":" + domainJson + ",\"sid\":" + sidJson + "}";
      } else {
        errors.add("user", e);
      }
      if (queryTokenInfo(token.h, TokenIntegrityLevel, buf, e)) {
        PSID label = ((TOKEN_MANDATORY_LABEL*)buf.data())->Label.Sid;
        UCHAR count = *GetSidSubAuthorityCount(label);
        if (count > 0) integrity = quoted(integrityName(*GetSidSubAuthority(label, (DWORD)count - 1)));
        else errors.add("integrityLevel", ERROR_INVALID_SID);
      } else {
        errors.add("integrityLevel", e);
      }
      TOKEN_ELEVATION te = {};
      DWORD n = 0;
      if (GetTokenInformation(token.h, TokenElevation, &te, sizeof te, &n)) elevated = te.TokenIsElevated ? "true" : "false";
      else errors.add("elevated", GetLastError());
    }
  }

  {
    BOOL w = FALSE;
    if (IsWow64Process(proc.h, &w)) wow64 = w ? "true" : "false";
    else errors.add("wow64", GetLastError());
  }

  {
    DWORD cls = GetPriorityClass(proc.h);
    const char* name = cls ? priorityName(cls) : nullptr;
    if (name) priority = quoted(name);
    else errors.add("priorityClass", cls ? ERROR_INVALID_DATA : GetLastError());
  }

  {
    DWORD_PTR pm = 0, sm = 0;
    if (GetProcessAffinityMask(proc.h, &pm, &sm)) {
      affinity = quoted(hexAddress(pm));
      sysAffinity = quoted(hexAddress(sm));
    } else {
      DWORD e = GetLastError();
      errors.add("affinityMask", e);
      errors.add("systemAffinityMask", e);
    }
  }

  std::string out = "{\"pid\":" + std::to_string(ref.pid) + ",\"startKey\":\"" + std::to_string(ref.startKey) + "\"";
  out += ",\"imagePath\":" + imagePath + ",\"commandLine\":" + commandLine + ",\"currentDirectory\":" + cwd;
  out += ",\"environment\":" + env + ",\"user\":" + user + ",\"integrityLevel\":" + integrity + ",\"elevated\":" + elevated;
  out += ",\"wow64\":" + wow64 + ",\"priorityClass\":" + priority + ",\"affinityMask\":" + affinity;
  out += ",\"systemAffinityMask\":" + sysAffinity + ",\"errors\":{";
  for (size_t i = 0; i < errors.items.size(); i++) {
    if (i) out.push_back(',');
    appendJsonString(out, errors.items[i].first);
    out.push_back(':');
    appendJsonString(out, errors.items[i].second);
  }
  out += "}}";
  result = std::move(out);
  return true;
}

// Uses a Toolhelp32 module snapshot rather than EnumProcessModulesEx: one call lists both the 64-bit
// and (for WOW64 targets) 32-bit modules from a 64-bit helper, and yields name, path, base and size
// without a per-module GetModuleFileNameEx round trip.
bool handleProcessModules(const JsonValue* params, std::string& result, Failure& err) {
  ProcessRef ref;
  if (!parseRef(params, ref, err)) return false;
  Owned proc;
  if (!openVerified(ref, PROCESS_QUERY_LIMITED_INFORMATION, proc.h, err)) return false;

  HANDLE snap = INVALID_HANDLE_VALUE;
  for (int attempt = 0; attempt < 10; attempt++) {
    snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, ref.pid);
    if (snap != INVALID_HANDLE_VALUE || GetLastError() != ERROR_BAD_LENGTH) break;  // target was still loading modules
  }
  if (snap == INVALID_HANDLE_VALUE) {
    err = win32Failure(GetLastError());
    return false;
  }
  Owned snapshot;
  snapshot.h = snap;

  std::string out = "{\"modules\":[";
  MODULEENTRY32W entry = {};
  entry.dwSize = sizeof entry;
  bool first = true;
  BOOL more = Module32FirstW(snap, &entry);
  if (!more && GetLastError() != ERROR_NO_MORE_FILES) {
    err = win32Failure(GetLastError());
    return false;
  }
  while (more) {
    if (!first) out.push_back(',');
    first = false;
    out += "{\"name\":";
    appendJsonWide(out, entry.szModule, wcslen(entry.szModule));
    out += ",\"path\":";
    appendJsonWide(out, entry.szExePath, wcslen(entry.szExePath));
    out += ",\"baseAddress\":\"" + hexAddress((unsigned long long)(ULONG_PTR)entry.modBaseAddr) + "\"";
    out += ",\"size\":" + std::to_string(entry.modBaseSize) + "}";
    more = Module32NextW(snap, &entry);
  }
  out += "]}";
  result = std::move(out);
  return true;
}

bool handleProcessHandles(const JsonValue* params, std::string& result, Failure& err) {
  ProcessRef ref;
  if (!parseRef(params, ref, err)) return false;
  Owned proc;
  if (!openVerified(ref, PROCESS_QUERY_LIMITED_INFORMATION, proc.h, err)) return false;

  NtQuerySystemInformationFn sysQuery = ntProc<NtQuerySystemInformationFn>("NtQuerySystemInformation");
  NtQueryObjectFn objQuery = ntProc<NtQueryObjectFn>("NtQueryObject");
  if (!sysQuery || !objQuery) {
    err = win32Failure(ERROR_PROC_NOT_FOUND);
    return false;
  }
  const bool elevated = isElevatedSelf();
  const ULONGLONG deadline = GetTickCount64() + 3000;
  const char* adminNote = "Run DUDE as Administrator to see all handles.";

  // The only extra right requested: duplicating handles *into this helper* to ask for type and name.
  Owned dupSource;
  Failure dupErr;
  if (!openVerified(ref, PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_DUP_HANDLE, dupSource.h, dupErr)) {
    if (dupErr.hasCode && dupErr.code == ERROR_NOT_FOUND) {
      err = dupErr;
      return false;
    }
    result = std::string("{\"handles\":[],\"truncated\":false,\"note\":") +
             quoted(elevated ? "Windows denied access to this process's handles." : adminNote) + "}";
    return true;
  }

  std::vector<unsigned char> buffer(4u << 20);
  LONG status = 0;
  for (int attempt = 0; attempt < 8; attempt++) {
    ULONG needed = 0;
    status = sysQuery(64 /*SystemExtendedHandleInformation*/, buffer.data(), (ULONG)buffer.size(), &needed);
    if (status != kStatusInfoLengthMismatch) break;
    buffer.resize(buffer.size() * 2);
  }
  if (status < 0) {
    err = win32Failure(ntToWin32(status));
    return false;
  }

  const HandleInfoEx* info = (const HandleInfoEx*)buffer.data();
  size_t total = (size_t)info->NumberOfHandles;
  size_t capacity = (buffer.size() - offsetof(HandleInfoEx, Handles)) / sizeof(HandleEntryEx);
  if (total > capacity) total = capacity;

  std::map<USHORT, std::string> typeCache;
  std::string out = "{\"handles\":[";
  bool first = true, truncated = false, denied = false;
  int abandoned = 0;
  for (size_t i = 0; i < total; i++) {
    const HandleEntryEx& e = info->Handles[i];
    if ((unsigned long long)e.UniqueProcessId != ref.pid) continue;
    if (GetTickCount64() > deadline) {
      truncated = true;
      break;
    }
    std::string type;
    auto cached = typeCache.find(e.ObjectTypeIndex);
    if (cached != typeCache.end()) type = cached->second;
    HANDLE dup = nullptr;
    if (!DuplicateHandle(dupSource.h, (HANDLE)(ULONG_PTR)e.HandleValue, GetCurrentProcess(), &dup, 0, FALSE, DUPLICATE_SAME_ACCESS)) {
      if (GetLastError() == ERROR_ACCESS_DENIED) denied = true;
      dup = nullptr;
    }
    if (dup && type.empty()) {
      std::vector<unsigned char> tbuf(1024);
      ULONG ret = 0;
      LONG st = objQuery(dup, 2 /*ObjectTypeInformation*/, tbuf.data(), (ULONG)tbuf.size(), &ret);
      if (isBufferShort(st) && ret > tbuf.size()) {
        tbuf.resize(ret);
        st = objQuery(dup, 2, tbuf.data(), (ULONG)tbuf.size(), &ret);
      }
      if (st >= 0) {
        const UStr* u = (const UStr*)tbuf.data();
        if (u->Length && u->Buffer) {
          type = narrow(u->Buffer, u->Length / sizeof(wchar_t));
          typeCache[e.ObjectTypeIndex] = type;
        }
      }
    }
    std::string name;
    int found = 0;
    if (dup && wantsName(type) && abandoned < 8) {
      found = queryHandleName(dup, objQuery, name);  // consumes dup
      if (found < 0) abandoned++;
    } else if (dup) {
      CloseHandle(dup);
    }
    if (!first) out.push_back(',');
    first = false;
    out += "{\"handle\":\"" + hexAddress((unsigned long long)e.HandleValue) + "\",\"type\":";
    appendJsonString(out, type.empty() ? std::string("Unknown") : type);
    out += ",\"name\":";
    if (found > 0) appendJsonString(out, name);
    else out += "null";
    out += "}";
  }
  out += std::string("],\"truncated\":") + (truncated ? "true" : "false");
  std::string note;
  if (denied && !elevated) note = adminNote;
  else if (denied) note = "Windows denied access to some of this process's handles.";
  if (!note.empty()) out += ",\"note\":" + quoted(note);
  out += "}";
  result = std::move(out);
  return true;
}

}  // namespace sys
