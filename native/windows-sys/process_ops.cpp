// DUDE Windows system helper: proc.* operation methods (DUDE_PRD.md §21 Phase 31, Milestone 596).
//
// These are the standard Win32 calls a task manager uses. They mutate the system, so the Electron
// engine (electron/sys-ops/process.ts) only reaches them from an applied, token-confirmed plan.
// Every method that targets a process takes { pid, startKey } and first opens it with the least access
// its action needs (plus PROCESS_QUERY_LIMITED_INFORMATION, required to read the creation time) and
// proves the creation time equals `startKey`; otherwise it fails with 1168 (ERROR_NOT_FOUND) so a
// reused PID is never acted on. There is deliberately no recursive terminate here: proc.tree only
// lists descendants and the engine terminates each one through proc.terminate.
#include "common.hpp"

#include <dbghelp.h>

#include <algorithm>
#include <map>

namespace sys {

bool querySystemProcesses(std::vector<unsigned char>& buffer, Failure& err);  // process.cpp
bool handleProcessDetail(const JsonValue* params, std::string& result, Failure& err);  // process_detail.cpp

namespace {

typedef LONG(NTAPI* NtProcessFn)(HANDLE);
typedef ULONG(NTAPI* ToDosFn)(LONG);

// Prefix of SYSTEM_PROCESS_INFORMATION, identical to the layout in process.cpp.
struct SysProc {
  ULONG NextEntryOffset;
  ULONG NumberOfThreads;
  LARGE_INTEGER WorkingSetPrivateSize;
  ULONG HardFaultCount;
  ULONG NumberOfThreadsHighWatermark;
  ULONGLONG CycleTime;
  LARGE_INTEGER CreateTime;
  LARGE_INTEGER UserTime;
  LARGE_INTEGER KernelTime;
  struct {
    USHORT Length;
    USHORT MaximumLength;
    PWSTR Buffer;
  } ImageName;
  LONG BasePriority;
  HANDLE UniqueProcessId;
  HANDLE InheritedFromUniqueProcessId;
};

struct Handle {
  HANDLE h = nullptr;
  Handle() = default;
  ~Handle() {
    if (h && h != INVALID_HANDLE_VALUE) CloseHandle(h);
  }
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
};

struct Ref {
  DWORD pid = 0;
  unsigned long long startKey = 0;
};

Failure gone() {
  Failure f;
  f.message = "The process has exited or its PID was reused.";
  f.code = ERROR_NOT_FOUND;
  f.hasCode = true;
  return f;
}

bool parseRef(const JsonValue* params, Ref& ref, Failure& err) {
  const JsonValue* pid = params && params->kind == JsonValue::Object ? params->find("pid") : nullptr;
  const JsonValue* key = params && params->kind == JsonValue::Object ? params->find("startKey") : nullptr;
  if (!pid || pid->kind != JsonValue::Number || pid->number <= 0 || pid->number > 4294967295.0 ||
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
    if (next / 10ULL != value) {  // overflow
      err = plainFailure("Invalid process reference.");
      return false;
    }
    value = next;
  }
  ref.pid = (DWORD)pid->number;
  ref.startKey = value;
  return true;
}

// Opens with `access` (+ query, to read the creation time) and proves it is the listed instance.
bool openVerified(const Ref& ref, DWORD access, HANDLE& out, Failure& err) {
  HANDLE h = OpenProcess(access | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, ref.pid);
  if (!h) {
    DWORD e = GetLastError();
    err = e == ERROR_INVALID_PARAMETER ? gone() : win32Failure(e);
    if (e == ERROR_ACCESS_DENIED) {
      // Access is also denied for a dead process that someone still holds a handle to; with query-only
      // access we can tell "exited / reused" (1168) from a genuinely protected process (5).
      HANDLE probe = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, ref.pid);
      if (probe) {
        FILETIME c, x, k, u;
        bool same = GetProcessTimes(probe, &c, &x, &k, &u) &&
                    ((((unsigned long long)c.dwHighDateTime << 32) | c.dwLowDateTime) == ref.startKey) &&
                    WaitForSingleObject(probe, 0) != WAIT_OBJECT_0;
        CloseHandle(probe);
        if (!same) err = gone();
      }
    }
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
  // An exited process kept alive by someone's handle keeps its creation time; treat it as gone too.
  if (u.QuadPart != ref.startKey || WaitForSingleObject(h, 0) == WAIT_OBJECT_0) {
    CloseHandle(h);
    err = gone();
    return false;
  }
  out = h;
  return true;
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

bool priorityValue(const std::string& name, DWORD& cls) {
  static const DWORD kAll[] = {IDLE_PRIORITY_CLASS,  BELOW_NORMAL_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS,
                               ABOVE_NORMAL_PRIORITY_CLASS, HIGH_PRIORITY_CLASS,  REALTIME_PRIORITY_CLASS};
  for (DWORD c : kAll) {
    if (name == priorityName(c)) {
      cls = c;
      return true;
    }
  }
  return false;
}

std::string hex(unsigned long long v) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "0x%llx", v);
  return buf;
}

std::string str(const JsonValue* params, const char* key) {
  const JsonValue* v = params && params->kind == JsonValue::Object ? params->find(key) : nullptr;
  return v && v->kind == JsonValue::String ? v->string : std::string();
}

bool isAbsolutePath(const std::wstring& p) {
  if (p.size() >= 3 && iswalpha(p[0]) && p[1] == L':' && (p[2] == L'\\' || p[2] == L'/')) return true;
  return p.size() >= 3 && p[0] == L'\\' && p[1] == L'\\';  // UNC or \\?\ prefix
}

bool ntProcessCall(const char* name, const Ref& ref, DWORD access, Failure& err) {
  Handle proc;
  if (!openVerified(ref, access, proc.h, err)) return false;
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  NtProcessFn fn = ntdll ? (NtProcessFn)(void*)GetProcAddress(ntdll, name) : nullptr;
  if (!fn) {
    err = win32Failure(ERROR_PROC_NOT_FOUND);
    return false;
  }
  LONG status = fn(proc.h);
  if (status < 0) {
    // Map to a Win32 code so access-denied (5) stays recognisable for the engine's hint.
    ToDosFn toDos = (ToDosFn)(void*)GetProcAddress(ntdll, "RtlNtStatusToDosError");
    err = win32Failure(toDos ? toDos(status) : ERROR_GEN_FAILURE);
    return false;
  }
  return true;
}

}  // namespace

bool handleProcTerminate(const JsonValue* params, std::string& result, Failure& err) {
  Ref ref;
  if (!parseRef(params, ref, err)) return false;
  Handle proc;
  if (!openVerified(ref, PROCESS_TERMINATE, proc.h, err)) return false;
  if (!TerminateProcess(proc.h, 1)) {
    err = win32Failure(GetLastError());
    return false;
  }
  result = "{\"ok\":true}";
  return true;
}

bool handleProcSuspend(const JsonValue* params, std::string& result, Failure& err) {
  Ref ref;
  if (!parseRef(params, ref, err)) return false;
  if (!ntProcessCall("NtSuspendProcess", ref, PROCESS_SUSPEND_RESUME, err)) return false;
  result = "{\"ok\":true}";
  return true;
}

bool handleProcResume(const JsonValue* params, std::string& result, Failure& err) {
  Ref ref;
  if (!parseRef(params, ref, err)) return false;
  if (!ntProcessCall("NtResumeProcess", ref, PROCESS_SUSPEND_RESUME, err)) return false;
  result = "{\"ok\":true}";
  return true;
}

bool handleProcSetPriority(const JsonValue* params, std::string& result, Failure& err) {
  Ref ref;
  if (!parseRef(params, ref, err)) return false;
  DWORD wanted = 0;
  if (!priorityValue(str(params, "priorityClass"), wanted)) {
    err = plainFailure("Invalid priority class.");
    return false;
  }
  Handle proc;
  if (!openVerified(ref, PROCESS_SET_INFORMATION, proc.h, err)) return false;
  DWORD before = GetPriorityClass(proc.h);
  const char* previous = before ? priorityName(before) : nullptr;
  if (!previous) {
    err = win32Failure(before ? ERROR_INVALID_DATA : GetLastError());
    return false;
  }
  if (!SetPriorityClass(proc.h, wanted)) {
    err = win32Failure(GetLastError());
    return false;
  }
  result = std::string("{\"ok\":true,\"previous\":\"") + previous + "\"}";
  return true;
}

bool handleProcSetAffinity(const JsonValue* params, std::string& result, Failure& err) {
  Ref ref;
  if (!parseRef(params, ref, err)) return false;
  std::string text = str(params, "affinityMask");
  if (text.size() > 2 && text[0] == '0' && (text[1] == 'x' || text[1] == 'X')) text = text.substr(2);
  if (text.empty() || text.size() > 16) {
    err = plainFailure("Invalid affinity mask.");
    return false;
  }
  unsigned long long mask = 0;
  for (char c : text) {
    int d = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;
    if (d < 0) {
      err = plainFailure("Invalid affinity mask.");
      return false;
    }
    mask = (mask << 4) | (unsigned long long)d;
  }
  Handle proc;
  if (!openVerified(ref, PROCESS_SET_INFORMATION, proc.h, err)) return false;
  DWORD_PTR current = 0, system = 0;
  if (!GetProcessAffinityMask(proc.h, &current, &system)) {
    err = win32Failure(GetLastError());
    return false;
  }
  if (mask == 0 || (mask & ~(unsigned long long)system) != 0) {
    err = plainFailure("Affinity mask includes processors that do not exist.");
    return false;
  }
  if (!SetProcessAffinityMask(proc.h, (DWORD_PTR)mask)) {
    err = win32Failure(GetLastError());
    return false;
  }
  result = "{\"ok\":true,\"previous\":\"" + hex(current) + "\"}";
  return true;
}

// Read-only: descendants of the target, depth-first, excluding the target. A process counts as a child
// only when its parent PID matches AND it was created no earlier than the parent (PID-reuse guard).
bool handleProcTree(const JsonValue* params, std::string& result, Failure& err) {
  Ref ref;
  if (!parseRef(params, ref, err)) return false;
  std::vector<unsigned char> buffer;
  if (!querySystemProcesses(buffer, err)) return false;

  struct Node {
    DWORD pid;
    DWORD parent;
    long long created;
    std::string name;
  };
  std::vector<Node> nodes;
  size_t offset = 0;
  for (;;) {
    if (offset + sizeof(SysProc) > buffer.size()) break;
    const SysProc* p = (const SysProc*)(buffer.data() + offset);
    nodes.push_back({(DWORD)(ULONG_PTR)p->UniqueProcessId, (DWORD)(ULONG_PTR)p->InheritedFromUniqueProcessId,
                     p->CreateTime.QuadPart,
                     p->ImageName.Buffer ? narrow(p->ImageName.Buffer, p->ImageName.Length / sizeof(wchar_t)) : std::string()});
    if (p->NextEntryOffset == 0) break;
    offset += p->NextEntryOffset;
  }
  size_t rootIndex = nodes.size();
  for (size_t i = 0; i < nodes.size(); i++) {
    if (nodes[i].pid == ref.pid && (unsigned long long)nodes[i].created == ref.startKey) {
      rootIndex = i;
      break;
    }
  }
  if (rootIndex == nodes.size()) {
    err = gone();
    return false;
  }

  std::map<size_t, std::vector<size_t>> children;  // node index -> child indexes
  for (size_t i = 0; i < nodes.size(); i++) {
    if (nodes[i].pid == 0) continue;
    for (size_t j = 0; j < nodes.size(); j++) {
      if (i != j && nodes[j].parent == nodes[i].pid && nodes[j].created >= nodes[i].created) children[i].push_back(j);
    }
  }
  std::string out = "{\"descendants\":[";
  bool first = true;
  std::vector<bool> seen(nodes.size(), false);
  std::vector<size_t> stack;
  seen[rootIndex] = true;
  auto pushChildren = [&](size_t idx) {
    const std::vector<size_t>& c = children[idx];
    for (auto it = c.rbegin(); it != c.rend(); ++it) stack.push_back(*it);
  };
  pushChildren(rootIndex);
  while (!stack.empty()) {
    size_t i = stack.back();
    stack.pop_back();
    if (seen[i]) continue;
    seen[i] = true;
    if (!first) out.push_back(',');
    first = false;
    out += "{\"pid\":" + std::to_string(nodes[i].pid) + ",\"startKey\":\"" +
           std::to_string((unsigned long long)nodes[i].created) + "\",\"name\":";
    appendJsonString(out, nodes[i].name);
    out += "}";
    pushChildren(i);
  }
  out += "]}";
  result = std::move(out);
  return true;
}

// Read-only relaunch info: the existing detail reader already returns imagePath, commandLine,
// currentDirectory and environment (each null when unreadable).
bool handleProcStartInfo(const JsonValue* params, std::string& result, Failure& err) {
  return handleProcessDetail(params, result, err);
}

bool handleProcCreate(const JsonValue* params, std::string& result, Failure& err) {
  std::wstring image = widen(str(params, "imagePath"));
  if (image.empty() || !isAbsolutePath(image)) {
    err = plainFailure("imagePath must be an absolute path.");
    return false;
  }
  std::wstring commandLine = widen(str(params, "commandLine"));
  if (commandLine.empty()) commandLine = L"\"" + image + L"\"";
  std::wstring cwd = widen(str(params, "currentDirectory"));
  if (!cwd.empty() && (!isAbsolutePath(cwd) || GetFileAttributesW(cwd.c_str()) == INVALID_FILE_ATTRIBUTES)) cwd.clear();

  std::wstring envBlock;
  const JsonValue* env = params ? params->find("environment") : nullptr;
  if (env && env->kind == JsonValue::Object) {
    // Sorted, double-NUL-terminated block (case-insensitive order, as the system builds it).
    std::vector<std::wstring> entries;
    for (const auto& m : env->members) {
      if (m.second.kind != JsonValue::String || m.first.empty()) continue;
      entries.push_back(widen(m.first) + L"=" + widen(m.second.string));
    }
    std::sort(entries.begin(), entries.end(),
              [](const std::wstring& a, const std::wstring& b) { return _wcsicmp(a.c_str(), b.c_str()) < 0; });
    for (const auto& e : entries) {
      envBlock += e;
      envBlock.push_back(L'\0');
    }
    if (envBlock.empty()) envBlock.push_back(L'\0');
    envBlock.push_back(L'\0');
  }

  // Runs as the helper's own token (the current user; elevated only if the helper already is). No
  // handle inheritance, so the helper's RPC pipes never leak into the new process.
  STARTUPINFOW si = {};
  si.cb = sizeof si;
  PROCESS_INFORMATION pi = {};
  std::vector<wchar_t> cmd(commandLine.begin(), commandLine.end());
  cmd.push_back(L'\0');
  BOOL ok = CreateProcessW(image.c_str(), cmd.data(), nullptr, nullptr, FALSE, CREATE_UNICODE_ENVIRONMENT,
                           envBlock.empty() ? nullptr : (LPVOID)envBlock.data(), cwd.empty() ? nullptr : cwd.c_str(), &si, &pi);
  if (!ok) {
    err = win32Failure(GetLastError());
    return false;
  }
  FILETIME created, exited, kernel, user;
  unsigned long long key = 0;
  if (GetProcessTimes(pi.hProcess, &created, &exited, &kernel, &user)) {
    ULARGE_INTEGER u;
    u.LowPart = created.dwLowDateTime;
    u.HighPart = created.dwHighDateTime;
    key = u.QuadPart;
  }
  DWORD pid = pi.dwProcessId;
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  result = "{\"pid\":" + std::to_string(pid) + ",\"startKey\":\"" + std::to_string(key) + "\"}";
  return true;
}

bool handleProcDump(const JsonValue* params, std::string& result, Failure& err) {
  Ref ref;
  if (!parseRef(params, ref, err)) return false;
  std::wstring path = widen(str(params, "outputPath"));
  if (path.empty() || !isAbsolutePath(path)) {
    err = plainFailure("outputPath must be an absolute path.");
    return false;
  }
  size_t slash = path.find_last_of(L"\\/");
  std::wstring parent = slash == std::wstring::npos ? L"" : path.substr(0, slash);
  DWORD attrs = parent.empty() ? INVALID_FILE_ATTRIBUTES : GetFileAttributesW(parent.c_str());
  if (attrs == INVALID_FILE_ATTRIBUTES || !(attrs & FILE_ATTRIBUTE_DIRECTORY)) {
    err = plainFailure("The output folder does not exist.");
    return false;
  }
  const JsonValue* full = params->find("full");
  bool fullMemory = full && full->kind == JsonValue::Bool && full->boolean;

  Handle proc;
  if (!openVerified(ref, PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, proc.h, err)) return false;
  Handle file;
  // CREATE_NEW: never overwrite an existing file.
  file.h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file.h == INVALID_HANDLE_VALUE) {
    err = win32Failure(GetLastError());
    return false;
  }
  MINIDUMP_TYPE type = fullMemory ? (MINIDUMP_TYPE)(MiniDumpWithFullMemory | MiniDumpWithHandleData |
                                                    MiniDumpWithUnloadedModules | MiniDumpWithThreadInfo)
                                  : MiniDumpNormal;
  if (!MiniDumpWriteDump(proc.h, ref.pid, file.h, type, nullptr, nullptr, nullptr)) {
    DWORD e = GetLastError();
    CloseHandle(file.h);
    file.h = nullptr;
    DeleteFileW(path.c_str());
    // MiniDumpWriteDump reports HRESULTs; unwrap the Win32 facility so codes like 5 stay recognisable.
    err = win32Failure((e & 0xFFFF0000) == 0x80070000 ? (e & 0xFFFF) : e);
    return false;
  }
  LARGE_INTEGER size = {};
  GetFileSizeEx(file.h, &size);
  result = "{\"bytes\":" + std::to_string((unsigned long long)size.QuadPart) + "}";
  return true;
}

}  // namespace sys
