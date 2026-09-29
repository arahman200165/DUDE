// DUDE Windows system helper: process.list (DUDE_PRD.md §21 Phase 31, Milestone 593).
//
// One NtQuerySystemInformation(SystemProcessInformation) snapshot. The struct below is the
// well-known full x64/x86 layout up to PrivatePageCount (winternl.h only documents a subset);
// natural alignment produces the correct offsets on both. Read-only: no process handles are opened.
#include "common.hpp"

#include <vector>

namespace sys {

namespace {

struct UnicodeString {
  USHORT Length;
  USHORT MaximumLength;
  PWSTR Buffer;
};

struct SystemProcessInfo {
  ULONG NextEntryOffset;
  ULONG NumberOfThreads;
  LARGE_INTEGER WorkingSetPrivateSize;
  ULONG HardFaultCount;
  ULONG NumberOfThreadsHighWatermark;
  ULONGLONG CycleTime;
  LARGE_INTEGER CreateTime;
  LARGE_INTEGER UserTime;
  LARGE_INTEGER KernelTime;
  UnicodeString ImageName;
  LONG BasePriority;
  HANDLE UniqueProcessId;
  HANDLE InheritedFromUniqueProcessId;
  ULONG HandleCount;
  ULONG SessionId;
  ULONG_PTR UniqueProcessKey;
  SIZE_T PeakVirtualSize;
  SIZE_T VirtualSize;
  ULONG PageFaultCount;
  SIZE_T PeakWorkingSetSize;
  SIZE_T WorkingSetSize;
  SIZE_T QuotaPeakPagedPoolUsage;
  SIZE_T QuotaPagedPoolUsage;
  SIZE_T QuotaPeakNonPagedPoolUsage;
  SIZE_T QuotaNonPagedPoolUsage;
  SIZE_T PagefileUsage;
  SIZE_T PeakPagefileUsage;
  SIZE_T PrivatePageCount;
};

typedef LONG(NTAPI* NtQuerySystemInformationFn)(ULONG, PVOID, ULONG, PULONG);

const ULONG kSystemProcessInformation = 5;
const LONG kStatusInfoLengthMismatch = (LONG)0xC0000004;
const unsigned long long kUnixEpochAsFileTime = 116444736000000000ULL;

unsigned long long unixNowMs() {
  FILETIME ft;
  GetSystemTimeAsFileTime(&ft);
  ULARGE_INTEGER u;
  u.LowPart = ft.dwLowDateTime;
  u.HighPart = ft.dwHighDateTime;
  return (u.QuadPart - kUnixEpochAsFileTime) / 10000ULL;
}

void appendNum(std::string& out, unsigned long long v) { out += std::to_string(v); }

}  // namespace

bool querySystemProcesses(std::vector<unsigned char>& buffer, Failure& err) {
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  NtQuerySystemInformationFn query =
      ntdll ? (NtQuerySystemInformationFn)(void*)GetProcAddress(ntdll, "NtQuerySystemInformation") : nullptr;
  if (!query) {
    err = win32Failure(ERROR_PROC_NOT_FOUND);
    return false;
  }

  buffer.assign(1 << 20, 0);
  LONG status = 0;
  for (int attempt = 0; attempt < 16; attempt++) {
    ULONG needed = 0;
    status = query(kSystemProcessInformation, buffer.data(), (ULONG)buffer.size(), &needed);
    if (status != kStatusInfoLengthMismatch) break;
    size_t next = (size_t)needed + (256u << 10);
    buffer.resize(next > buffer.size() ? next : buffer.size() * 2);
  }
  if (status < 0) {
    Failure f;
    f.message = "Could not read the process list (NTSTATUS 0x" + [&] { char b[16]; std::snprintf(b, sizeof b, "%08lX", (unsigned long)status); return std::string(b); }() + ").";
    err = f;
    return false;
  }
  return true;
}

bool handleProcessList(std::string& result, Failure& err) {
  std::vector<unsigned char> buffer;
  if (!querySystemProcesses(buffer, err)) return false;

  std::string out;
  out.reserve(256 * 1024);
  out += "{\"sampledAtMs\":";
  appendNum(out, unixNowMs());
  out += ",\"logicalProcessors\":";
  appendNum(out, GetActiveProcessorCount(ALL_PROCESSOR_GROUPS));
  out += ",\"processes\":[";

  bool first = true;
  size_t offset = 0;
  for (;;) {
    if (offset + sizeof(SystemProcessInfo) > buffer.size()) break;
    const SystemProcessInfo* p = (const SystemProcessInfo*)(buffer.data() + offset);
    unsigned long long pid = (unsigned long long)(ULONG_PTR)p->UniqueProcessId;
    if (!first) out.push_back(',');
    first = false;
    out += "{\"pid\":";
    appendNum(out, pid);
    out += ",\"parentPid\":";
    appendNum(out, (unsigned long long)(ULONG_PTR)p->InheritedFromUniqueProcessId);
    out += ",\"name\":";
    if (pid == 0 && p->ImageName.Length == 0) appendJsonString(out, "System Idle Process");
    else appendJsonWide(out, p->ImageName.Buffer, p->ImageName.Length / sizeof(wchar_t));
    out += ",\"sessionId\":";
    appendNum(out, p->SessionId);
    out += ",\"threadCount\":";
    appendNum(out, p->NumberOfThreads);
    out += ",\"handleCount\":";
    appendNum(out, p->HandleCount);
    unsigned long long created = (unsigned long long)p->CreateTime.QuadPart;
    out += ",\"createTimeMs\":";
    appendNum(out, created >= kUnixEpochAsFileTime ? (created - kUnixEpochAsFileTime) / 10000ULL : 0ULL);
    out += ",\"startKey\":\"";
    appendNum(out, created);
    out += "\",\"kernelTime100ns\":";
    appendNum(out, (unsigned long long)p->KernelTime.QuadPart);
    out += ",\"userTime100ns\":";
    appendNum(out, (unsigned long long)p->UserTime.QuadPart);
    out += ",\"workingSetBytes\":";
    appendNum(out, p->WorkingSetSize);
    out += ",\"privateBytes\":";
    appendNum(out, p->PrivatePageCount);
    out += ",\"basePriority\":" + std::to_string(p->BasePriority) + "}";
    if (p->NextEntryOffset == 0) break;
    offset += p->NextEntryOffset;
  }
  out += "]}";
  result = std::move(out);
  return true;
}

namespace {

const char* threadStateName(ULONG s) {
  static const char* names[] = {"Initialized", "Ready", "Running", "Standby", "Terminated", "Waiting", "Transition",
                                "DeferredReady", "GateWaitObsolete", "WaitingForProcessInSwap"};
  return s < sizeof(names) / sizeof(names[0]) ? names[s] : "Unknown";
}

const char* waitReasonName(ULONG r) {
  static const char* names[] = {"Executive", "FreePage", "PageIn", "PoolAllocation", "DelayExecution", "Suspended", "UserRequest",
                                "WrExecutive", "WrFreePage", "WrPageIn", "WrPoolAllocation", "WrDelayExecution", "WrSuspended",
                                "WrUserRequest", "WrEventPair", "WrQueue", "WrLpcReceive", "WrLpcReply", "WrVirtualMemory",
                                "WrPageOut", "WrRendezvous", "WrKeyedEvent", "WrTerminated", "WrProcessInSwap", "WrCpuRateControl",
                                "WrCalloutStack", "WrKernel", "WrResource", "WrPushLock", "WrMutex", "WrQuantumEnd", "WrDispatchInt",
                                "WrPreempted", "WrYieldExecution", "WrFastMutex", "WrGuardedMutex", "WrRundown", "WrAlertByThreadId",
                                "WrDeferredPreempt"};
  return r < sizeof(names) / sizeof(names[0]) ? names[r] : "Unknown";
}

// SYSTEM_THREAD_INFORMATION (80 bytes on x64): the array that follows each SYSTEM_PROCESS_INFORMATION.
struct SystemThreadInfo {
  LARGE_INTEGER KernelTime;
  LARGE_INTEGER UserTime;
  LARGE_INTEGER CreateTime;
  ULONG WaitTime;
  PVOID StartAddress;
  HANDLE ClientIdProcess;
  HANDLE ClientIdThread;
  LONG Priority;
  LONG BasePriority;
  ULONG ContextSwitches;
  ULONG ThreadState;
  ULONG WaitReason;
};

// The documented struct above ends at PrivatePageCount; the real one adds six 8-byte I/O counters
// before the thread array begins (total 256 bytes on x64/arm64).
const size_t kProcessInfoTail = 6 * sizeof(LARGE_INTEGER);

}  // namespace

bool handleProcessThreads(const JsonValue* params, std::string& result, Failure& err) {
  const JsonValue* pidValue = params && params->kind == JsonValue::Object ? params->find("pid") : nullptr;
  if (!pidValue || pidValue->kind != JsonValue::Number || pidValue->number < 0 || pidValue->number > 4294967295.0) {
    err = plainFailure("Invalid process id.");
    return false;
  }
  unsigned long long wanted = (unsigned long long)pidValue->number;

  std::vector<unsigned char> buffer;
  if (!querySystemProcesses(buffer, err)) return false;

  size_t offset = 0;
  for (;;) {
    if (offset + sizeof(SystemProcessInfo) > buffer.size()) break;
    const SystemProcessInfo* p = (const SystemProcessInfo*)(buffer.data() + offset);
    if ((unsigned long long)(ULONG_PTR)p->UniqueProcessId == wanted) {
      size_t first = offset + sizeof(SystemProcessInfo) + kProcessInfoTail;
      size_t count = p->NumberOfThreads;
      if (first + count * sizeof(SystemThreadInfo) > buffer.size()) count = first > buffer.size() ? 0 : (buffer.size() - first) / sizeof(SystemThreadInfo);
      std::string out = "{\"threads\":[";
      for (size_t i = 0; i < count; i++) {
        const SystemThreadInfo* t = (const SystemThreadInfo*)(buffer.data() + first + i * sizeof(SystemThreadInfo));
        if (i) out.push_back(',');
        char addr[32];
        std::snprintf(addr, sizeof addr, "0x%llx", (unsigned long long)(ULONG_PTR)t->StartAddress);
        unsigned long long created = (unsigned long long)t->CreateTime.QuadPart;
        out += "{\"tid\":" + std::to_string((unsigned long long)(ULONG_PTR)t->ClientIdThread);
        out += std::string(",\"startAddress\":\"") + addr + "\"";
        out += ",\"priority\":" + std::to_string(t->Priority);
        out += ",\"basePriority\":" + std::to_string(t->BasePriority);
        out += std::string(",\"state\":\"") + threadStateName(t->ThreadState) + "\"";
        out += std::string(",\"waitReason\":\"") + (t->ThreadState == 5 ? waitReasonName(t->WaitReason) : "") + "\"";
        out += ",\"kernelTime100ns\":" + std::to_string((unsigned long long)t->KernelTime.QuadPart);
        out += ",\"userTime100ns\":" + std::to_string((unsigned long long)t->UserTime.QuadPart);
        out += ",\"createTimeMs\":" + std::to_string(created >= kUnixEpochAsFileTime ? (created - kUnixEpochAsFileTime) / 10000ULL : 0ULL);
        out += "}";
      }
      out += "]}";
      result = std::move(out);
      return true;
    }
    if (p->NextEntryOffset == 0) break;
    offset += p->NextEntryOffset;
  }
  Failure f;
  f.message = "The process has exited or its PID was reused.";
  f.code = ERROR_NOT_FOUND;
  f.hasCode = true;
  err = f;
  return false;
}

}  // namespace sys
