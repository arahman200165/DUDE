 // DUDE Windows system helper: read the current process API-set namespace (M608).
 // The pe.apisetmap RPC returns the current process API-set namespace.
#include "common.hpp"
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <cwctype>

namespace sys {
namespace {
using NtQueryInformationProcessFn = LONG(NTAPI*)(HANDLE, ULONG, PVOID, ULONG, PULONG);
struct BasicProcessInformation {
  PVOID reserved1;
  PVOID pebBaseAddress;
  PVOID reserved2[2];
  ULONG_PTR processId;
  PVOID reserved3;
};
struct ApiSetNamespaceV6 { DWORD version, size, flags, count, entryOffset, hashOffset, hashFactor; };
struct ApiSetEntryV6 { DWORD flags, nameOffset, nameLength, hashedLength, valueOffset, valueCount; };
struct ApiSetValueV6 { DWORD flags, nameOffset, nameLength, valueOffset, valueLength; };
constexpr DWORD kMaxNamespaceBytes = 16 * 1024 * 1024;
constexpr DWORD kMaxEntries = 8192;
constexpr DWORD kMaxValuesPerEntry = 64;

bool rangeInside(DWORD offset, DWORD length, DWORD size) { return offset <= size && length <= size - offset; }
bool readOwnMemory(const void* address, void* output, SIZE_T size) {
  SIZE_T read = 0;
  return ReadProcessMemory(GetCurrentProcess(), address, output, size, &read) && read == size;
}
bool readNamespacePointer(void** output) {
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (!ntdll) return false;
  auto query = reinterpret_cast<NtQueryInformationProcessFn>(GetProcAddress(ntdll, "NtQueryInformationProcess"));
  if (!query) return false;
  BasicProcessInformation info = {};
  if (query(GetCurrentProcess(), 0, &info, sizeof info, nullptr) < 0 || !info.pebBaseAddress) return false;
#if defined(_WIN64)
  constexpr size_t kApiSetMapOffset = 0x68;
#else
  constexpr size_t kApiSetMapOffset = 0x38;
#endif
  return readOwnMemory(static_cast<const BYTE*>(info.pebBaseAddress) + kApiSetMapOffset, output, sizeof(*output)) && *output;
}
bool readUtf16(const std::vector<BYTE>& bytes, DWORD offset, DWORD length, std::wstring& out) {
  if ((length & 1) || length > 2048 || !rangeInside(offset, length, static_cast<DWORD>(bytes.size()))) return false;
  out.assign(reinterpret_cast<const wchar_t*>(bytes.data() + offset), length / sizeof(wchar_t));
  return true;
}
std::string apiName(const std::wstring& raw) {
  std::wstring lower = raw;
  std::transform(lower.begin(), lower.end(), lower.begin(), towlower);
  if (lower.size() >= 4 && lower.substr(lower.size() - 4) == L".dll") lower.resize(lower.size() - 4);
  return narrow(lower);
}
}  // namespace

bool handlePeApiSetMap(std::string& result, Failure& err) {
  void* map = nullptr;
  if (!readNamespacePointer(&map)) {
    err = plainFailure("Could not read the helper process API-set map.");
    return false;
  }
  ApiSetNamespaceV6 header = {};
  if (!readOwnMemory(map, &header, sizeof header) || header.version != 6 ||
      header.size < sizeof header || header.size > kMaxNamespaceBytes || header.count > kMaxEntries ||
      !rangeInside(header.entryOffset, header.count * static_cast<DWORD>(sizeof(ApiSetEntryV6)), header.size)) {
    err = plainFailure("The helper process API-set namespace is unsupported or malformed.");
    return false;
  }
  std::vector<BYTE> bytes(header.size);
  if (!readOwnMemory(map, bytes.data(), bytes.size())) {
    err = plainFailure("Could not read the helper process API-set namespace.");
    return false;
  }
  result = "{\"version\":6,\"contracts\":{";
  bool firstContract = true;
  for (DWORD i = 0; i < header.count; ++i) {
    ApiSetEntryV6 entry = {};
    const DWORD entryAt = header.entryOffset + i * static_cast<DWORD>(sizeof entry);
    if (!rangeInside(entryAt, sizeof entry, header.size)) continue;
    std::memcpy(&entry, bytes.data() + entryAt, sizeof entry);
    if (!entry.valueCount || entry.valueCount > kMaxValuesPerEntry ||
        !rangeInside(entry.valueOffset, entry.valueCount * static_cast<DWORD>(sizeof(ApiSetValueV6)), header.size)) continue;
    std::wstring contractWide;
    if (!readUtf16(bytes, entry.nameOffset, entry.nameLength, contractWide)) continue;
    const std::string contract = apiName(contractWide);
    if (contract.empty()) continue;
    std::vector<std::string> hosts;
    for (DWORD j = 0; j < entry.valueCount; ++j) {
      ApiSetValueV6 value = {};
      const DWORD valueAt = entry.valueOffset + j * static_cast<DWORD>(sizeof value);
      std::memcpy(&value, bytes.data() + valueAt, sizeof value);
      std::wstring hostWide;
      if (value.valueLength && readUtf16(bytes, value.valueOffset, value.valueLength, hostWide)) {
        std::transform(hostWide.begin(), hostWide.end(), hostWide.begin(), towlower);
        if (hostWide.size() < 4 || hostWide.substr(hostWide.size() - 4) != L".dll") hostWide += L".dll";
        hosts.push_back(narrow(hostWide));
      }
    }
    if (hosts.empty()) continue;
    if (!firstContract) result += ',';
    firstContract = false;
    appendJsonString(result, contract);
    result += ":[";
    for (size_t j = 0; j < hosts.size(); ++j) {
      if (j) result += ',';
      appendJsonString(result, hosts[j]);
    }
    result += ']';
  }
  result += "}}";
  return true;
}
}  // namespace sys
