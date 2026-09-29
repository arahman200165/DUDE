// DUDE Windows system helper: reg.enumKey / reg.getValues (DUDE_PRD.md §21 Phase 31, Milestone 593).
//
// Strictly read-only: every key is opened with KEY_READ (or KEY_QUERY_VALUE for child counts) plus
// an optional WOW64 view flag. Nothing here creates, writes or deletes registry data.
#include "common.hpp"

#include <algorithm>
#include <vector>

namespace sys {

namespace {

const unsigned long long kUnixEpochAsFileTime = 116444736000000000ULL;

struct KeyParams {
  HKEY hive = nullptr;
  std::wstring path;
  REGSAM viewFlag = 0;
};

bool parseKeyParams(const JsonValue* params, KeyParams& out) {
  if (!params || params->kind != JsonValue::Object) return false;
  const JsonValue* hive = params->find("hive");
  const JsonValue* path = params->find("path");
  const JsonValue* view = params->find("view");
  if (!hive || hive->kind != JsonValue::String || !path || path->kind != JsonValue::String ||
      !view || view->kind != JsonValue::String) {
    return false;
  }
  if (hive->string == "HKLM") out.hive = HKEY_LOCAL_MACHINE;
  else if (hive->string == "HKCU") out.hive = HKEY_CURRENT_USER;
  else if (hive->string == "HKCR") out.hive = HKEY_CLASSES_ROOT;
  else if (hive->string == "HKU") out.hive = HKEY_USERS;
  else if (hive->string == "HKCC") out.hive = HKEY_CURRENT_CONFIG;
  else return false;
  if (view->string == "64") out.viewFlag = KEY_WOW64_64KEY;
  else if (view->string == "32") out.viewFlag = KEY_WOW64_32KEY;
  else if (view->string == "default") out.viewFlag = 0;
  else return false;
  out.path = widen(path->string);
  if (out.path.size() > 1024) return false;
  return true;
}

long long fileTimeToUnixMs(const FILETIME& ft) {
  ULARGE_INTEGER u;
  u.LowPart = ft.dwLowDateTime;
  u.HighPart = ft.dwHighDateTime;
  if (u.QuadPart < kUnixEpochAsFileTime) return 0;
  return (long long)((u.QuadPart - kUnixEpochAsFileTime) / 10000ULL);
}

struct KeyInfo {
  DWORD subkeyCount = 0;
  DWORD maxSubkeyLen = 0;
  DWORD valueCount = 0;
  DWORD maxValueNameLen = 0;
  DWORD maxValueLen = 0;
  FILETIME lastWrite = {};
};

LONG queryInfo(HKEY key, KeyInfo& info) {
  return RegQueryInfoKeyW(key, nullptr, nullptr, nullptr, &info.subkeyCount, &info.maxSubkeyLen, nullptr,
                          &info.valueCount, &info.maxValueNameLen, &info.maxValueLen, nullptr, &info.lastWrite);
}

std::string hexOf(const unsigned char* data, size_t size) {
  static const char digits[] = "0123456789abcdef";
  std::string out;
  out.reserve(size * 2);
  for (size_t i = 0; i < size; i++) {
    out.push_back(digits[data[i] >> 4]);
    out.push_back(digits[data[i] & 15]);
  }
  return out;
}

const char* typeName(DWORD type) {
  switch (type) {
    case REG_NONE: return "REG_NONE";
    case REG_SZ: return "REG_SZ";
    case REG_EXPAND_SZ: return "REG_EXPAND_SZ";
    case REG_BINARY: return "REG_BINARY";
    case REG_DWORD: return "REG_DWORD";
    case REG_DWORD_BIG_ENDIAN: return "REG_DWORD_BIG_ENDIAN";
    case REG_LINK: return "REG_LINK";
    case REG_MULTI_SZ: return "REG_MULTI_SZ";
    case REG_RESOURCE_LIST: return "REG_RESOURCE_LIST";
    case REG_FULL_RESOURCE_DESCRIPTOR: return "REG_FULL_RESOURCE_DESCRIPTOR";
    case REG_RESOURCE_REQUIREMENTS_LIST: return "REG_RESOURCE_REQUIREMENTS_LIST";
    case REG_QWORD: return "REG_QWORD";
    default: return "REG_UNKNOWN";
  }
}

void appendData(std::string& out, DWORD type, const unsigned char* data, size_t size) {
  switch (type) {
    case REG_SZ:
    case REG_EXPAND_SZ:
    case REG_LINK: {
      size_t chars = size / sizeof(wchar_t);
      const wchar_t* w = (const wchar_t*)data;
      while (chars > 0 && w[chars - 1] == L'\0') chars--;
      appendJsonWide(out, w, chars);
      return;
    }
    case REG_MULTI_SZ: {
      size_t chars = size / sizeof(wchar_t);
      const wchar_t* w = (const wchar_t*)data;
      while (chars > 0 && w[chars - 1] == L'\0') chars--;
      out.push_back('[');
      if (chars > 0) {
        size_t start = 0;
        bool first = true;
        for (size_t i = 0; i <= chars; i++) {
          if (i == chars || w[i] == L'\0') {
            if (!first) out.push_back(',');
            first = false;
            appendJsonWide(out, w + start, i - start);
            start = i + 1;
          }
        }
      }
      out.push_back(']');
      return;
    }
    case REG_DWORD:
      if (size >= 4) {
        DWORD v;
        memcpy(&v, data, 4);
        out += std::to_string(v);
        return;
      }
      break;
    case REG_DWORD_BIG_ENDIAN:
      if (size >= 4) {
        DWORD v = ((DWORD)data[0] << 24) | ((DWORD)data[1] << 16) | ((DWORD)data[2] << 8) | (DWORD)data[3];
        out += std::to_string(v);
        return;
      }
      break;
    case REG_QWORD:
      if (size >= 8) {
        unsigned long long v;
        memcpy(&v, data, 8);
        out += "\"" + std::to_string(v) + "\"";
        return;
      }
      break;
    default: break;
  }
  out += "\"" + hexOf(data, size) + "\"";
}

bool openKey(const KeyParams& p, REGSAM access, HKEY& key, Failure& err) {
  LONG rc = RegOpenKeyExW(p.hive, p.path.c_str(), 0, access | p.viewFlag, &key);
  if (rc != ERROR_SUCCESS) {
    err = win32Failure((DWORD)rc);
    return false;
  }
  return true;
}

struct Subkey {
  std::wstring name;
  long long subkeyCount = -1;
  long long valueCount = -1;
  long long lastWriteMs = 0;
};

}  // namespace

bool handleRegEnumKey(const JsonValue* params, std::string& result, Failure& err) {
  KeyParams p;
  if (!parseKeyParams(params, p)) { err = plainFailure("Invalid parameters."); return false; }
  HKEY key = nullptr;
  if (!openKey(p, KEY_READ, key, err)) return false;

  KeyInfo info;
  LONG rc = queryInfo(key, info);
  if (rc != ERROR_SUCCESS) { RegCloseKey(key); err = win32Failure((DWORD)rc); return false; }

  std::vector<Subkey> subkeys;
  std::vector<wchar_t> nameBuffer(256);
  for (DWORD index = 0;; index++) {
    DWORD length = (DWORD)nameBuffer.size();
    rc = RegEnumKeyExW(key, index, nameBuffer.data(), &length, nullptr, nullptr, nullptr, nullptr);
    if (rc == ERROR_MORE_DATA) {
      nameBuffer.resize(nameBuffer.size() * 2);
      index--;
      continue;
    }
    if (rc == ERROR_NO_MORE_ITEMS) break;
    if (rc != ERROR_SUCCESS) { RegCloseKey(key); err = win32Failure((DWORD)rc); return false; }
    Subkey sub;
    sub.name.assign(nameBuffer.data(), length);
    HKEY child = nullptr;
    std::wstring childPath = p.path.empty() ? sub.name : p.path + L"\\" + sub.name;
    if (RegOpenKeyExW(p.hive, childPath.c_str(), 0, KEY_QUERY_VALUE | p.viewFlag, &child) == ERROR_SUCCESS) {
      KeyInfo childInfo;
      if (queryInfo(child, childInfo) == ERROR_SUCCESS) {
        sub.subkeyCount = childInfo.subkeyCount;
        sub.valueCount = childInfo.valueCount;
        sub.lastWriteMs = fileTimeToUnixMs(childInfo.lastWrite);
      }
      RegCloseKey(child);
    }
    subkeys.push_back(std::move(sub));
  }

  std::sort(subkeys.begin(), subkeys.end(), [](const Subkey& a, const Subkey& b) {
    return CompareStringOrdinal(a.name.c_str(), (int)a.name.size(), b.name.c_str(), (int)b.name.size(), TRUE) == CSTR_LESS_THAN;
  });

  std::string out = "{\"lastWriteMs\":" + std::to_string(fileTimeToUnixMs(info.lastWrite)) + ",\"subkeys\":[";
  for (size_t i = 0; i < subkeys.size(); i++) {
    if (i) out.push_back(',');
    out += "{\"name\":";
    appendJsonString(out, narrow(subkeys[i].name));
    out += ",\"subkeyCount\":" + std::to_string(subkeys[i].subkeyCount) + ",\"valueCount\":" +
           std::to_string(subkeys[i].valueCount) + ",\"lastWriteMs\":" + std::to_string(subkeys[i].lastWriteMs) + "}";
  }
  out += "]}";
  RegCloseKey(key);
  result = std::move(out);
  return true;
}

bool handleRegGetValues(const JsonValue* params, std::string& result, Failure& err) {
  KeyParams p;
  if (!parseKeyParams(params, p)) { err = plainFailure("Invalid parameters."); return false; }
  HKEY key = nullptr;
  if (!openKey(p, KEY_READ, key, err)) return false;

  KeyInfo info;
  LONG rc = queryInfo(key, info);
  if (rc != ERROR_SUCCESS) { RegCloseKey(key); err = win32Failure((DWORD)rc); return false; }

  std::vector<wchar_t> nameBuffer((size_t)info.maxValueNameLen + 2);
  std::vector<unsigned char> dataBuffer((size_t)info.maxValueLen + 16);
  std::string out = "{\"values\":[";
  bool first = true;
  for (DWORD index = 0;; index++) {
    DWORD nameLength = (DWORD)nameBuffer.size();
    DWORD dataLength = (DWORD)dataBuffer.size();
    DWORD type = 0;
    rc = RegEnumValueW(key, index, nameBuffer.data(), &nameLength, nullptr, &type, dataBuffer.data(), &dataLength);
    if (rc == ERROR_MORE_DATA) {
      // Either buffer may be too small and the API does not say which reliably; grow both.
      nameBuffer.resize(nameBuffer.size() * 2);
      dataBuffer.resize(std::max(dataBuffer.size() * 2, (size_t)dataLength + 16));
      index--;
      continue;
    }
    if (rc == ERROR_NO_MORE_ITEMS) break;
    if (rc != ERROR_SUCCESS) { RegCloseKey(key); err = win32Failure((DWORD)rc); return false; }
    if (!first) out.push_back(',');
    first = false;
    out += "{\"name\":";
    appendJsonWide(out, nameBuffer.data(), nameLength);
    out += std::string(",\"type\":\"") + typeName(type) + "\",\"rawType\":" + std::to_string(type) +
           ",\"byteLength\":" + std::to_string(dataLength) + ",\"data\":";
    appendData(out, type, dataBuffer.data(), dataLength);
    out.push_back('}');
  }
  out += "]}";
  RegCloseKey(key);
  result = std::move(out);
  return true;
}

}  // namespace sys
