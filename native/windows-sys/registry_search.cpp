// DUDE Windows system helper: reg.search / reg.export (DUDE_PRD.md §21 Phase 31, Milestone 601).
//
// Strictly read-only: every key is opened with KEY_READ (plus an optional WOW64 view flag). Both walks
// are iterative (an explicit stack of key paths), never recursive, so deep trees cannot overflow the stack.
// reg.search is bounded by a match limit and a time budget; reg.export is bounded by an output size cap.
#include "common.hpp"

#include <algorithm>
#include <regex>
#include <vector>

namespace sys {

namespace {

struct KeyParams {
  HKEY hive = nullptr;
  const char* hiveShort = "";
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
  if (hive->string == "HKLM") { out.hive = HKEY_LOCAL_MACHINE; out.hiveShort = "HKLM"; }
  else if (hive->string == "HKCU") { out.hive = HKEY_CURRENT_USER; out.hiveShort = "HKCU"; }
  else if (hive->string == "HKCR") { out.hive = HKEY_CLASSES_ROOT; out.hiveShort = "HKCR"; }
  else if (hive->string == "HKU") { out.hive = HKEY_USERS; out.hiveShort = "HKU"; }
  else if (hive->string == "HKCC") { out.hive = HKEY_CURRENT_CONFIG; out.hiveShort = "HKCC"; }
  else return false;
  if (view->string == "64") out.viewFlag = KEY_WOW64_64KEY;
  else if (view->string == "32") out.viewFlag = KEY_WOW64_32KEY;
  else if (view->string == "default") out.viewFlag = 0;
  else return false;
  out.path = widen(path->string);
  if (out.path.size() > 1024) return false;
  return true;
}

const wchar_t* hiveFullName(HKEY hive) {
  if (hive == HKEY_LOCAL_MACHINE) return L"HKEY_LOCAL_MACHINE";
  if (hive == HKEY_CURRENT_USER) return L"HKEY_CURRENT_USER";
  if (hive == HKEY_CLASSES_ROOT) return L"HKEY_CLASSES_ROOT";
  if (hive == HKEY_USERS) return L"HKEY_USERS";
  return L"HKEY_CURRENT_CONFIG";
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

struct RawValue {
  std::wstring name;
  DWORD type = 0;
  std::vector<unsigned char> data;
};

// Reads every value of an open key. Returns a Win32 error code (ERROR_SUCCESS on success).
LONG readAllValues(HKEY key, std::vector<RawValue>& out) {
  DWORD maxNameLen = 0, maxValueLen = 0;
  LONG rc = RegQueryInfoKeyW(key, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, &maxNameLen, &maxValueLen, nullptr, nullptr);
  if (rc != ERROR_SUCCESS) return rc;
  std::vector<wchar_t> nameBuffer((size_t)maxNameLen + 2);
  std::vector<unsigned char> dataBuffer((size_t)maxValueLen + 16);
  for (DWORD index = 0;; index++) {
    DWORD nameLength = (DWORD)nameBuffer.size();
    DWORD dataLength = (DWORD)dataBuffer.size();
    DWORD type = 0;
    rc = RegEnumValueW(key, index, nameBuffer.data(), &nameLength, nullptr, &type, dataBuffer.data(), &dataLength);
    if (rc == ERROR_MORE_DATA) {
      nameBuffer.resize(nameBuffer.size() * 2);
      dataBuffer.resize(std::max(dataBuffer.size() * 2, (size_t)dataLength + 16));
      index--;
      continue;
    }
    if (rc == ERROR_NO_MORE_ITEMS) return ERROR_SUCCESS;
    if (rc != ERROR_SUCCESS) return rc;
    RawValue v;
    v.name.assign(nameBuffer.data(), nameLength);
    v.type = type;
    v.data.assign(dataBuffer.begin(), dataBuffer.begin() + dataLength);
    out.push_back(std::move(v));
  }
}

// Child key names of an open key, sorted (case-insensitive ordinal). An enumeration error ends the list early.
void readSubkeyNames(HKEY key, std::vector<std::wstring>& out) {
  std::vector<wchar_t> nameBuffer(256);
  for (DWORD index = 0;; index++) {
    DWORD length = (DWORD)nameBuffer.size();
    LONG rc = RegEnumKeyExW(key, index, nameBuffer.data(), &length, nullptr, nullptr, nullptr, nullptr);
    if (rc == ERROR_MORE_DATA) { nameBuffer.resize(nameBuffer.size() * 2); index--; continue; }
    if (rc != ERROR_SUCCESS) break;
    out.emplace_back(nameBuffer.data(), length);
  }
  std::sort(out.begin(), out.end(), [](const std::wstring& a, const std::wstring& b) {
    return CompareStringOrdinal(a.c_str(), (int)a.size(), b.c_str(), (int)b.size(), TRUE) == CSTR_LESS_THAN;
  });
}

std::wstring joinPath(const std::wstring& base, const std::wstring& child) {
  return base.empty() ? child : base + L"\\" + child;
}

std::wstring hexText(const unsigned char* data, size_t size) {
  static const wchar_t digits[] = L"0123456789abcdef";
  std::wstring out;
  out.reserve(size * 2);
  for (size_t i = 0; i < size; i++) {
    out.push_back(digits[data[i] >> 4]);
    out.push_back(digits[data[i] & 15]);
  }
  return out;
}

// Decoded string form of a value, used for data matching and previews (binary shows as hex).
std::wstring dataAsText(const RawValue& v) {
  const size_t size = v.data.size();
  switch (v.type) {
    case REG_SZ:
    case REG_EXPAND_SZ:
    case REG_LINK:
    case REG_MULTI_SZ: {
      size_t chars = size / sizeof(wchar_t);
      const wchar_t* w = (const wchar_t*)v.data.data();
      while (chars > 0 && w[chars - 1] == L'\0') chars--;
      std::wstring out(w, chars);
      if (v.type == REG_MULTI_SZ) for (auto& c : out) if (c == L'\0') c = L'\n';
      return out;
    }
    case REG_DWORD:
      if (size >= 4) { DWORD d; memcpy(&d, v.data.data(), 4); return std::to_wstring(d); }
      break;
    case REG_DWORD_BIG_ENDIAN:
      if (size >= 4) {
        DWORD d = ((DWORD)v.data[0] << 24) | ((DWORD)v.data[1] << 16) | ((DWORD)v.data[2] << 8) | (DWORD)v.data[3];
        return std::to_wstring(d);
      }
      break;
    case REG_QWORD:
      if (size >= 8) { unsigned long long q; memcpy(&q, v.data.data(), 8); return std::to_wstring(q); }
      break;
    default: break;
  }
  return hexText(v.data.data(), size);
}

std::wstring lowerCopy(const std::wstring& text) {
  std::wstring out = text;
  if (!out.empty()) CharLowerBuffW(&out[0], (DWORD)out.size());
  return out;
}

struct Matcher {
  bool useRegex = false;
  bool caseSensitive = false;
  std::wstring needle;
  std::wregex pattern;

  bool test(const std::wstring& haystack) const {
    if (useRegex) {
      try { return std::regex_search(haystack, pattern); } catch (...) { return false; }
    }
    if (caseSensitive) return haystack.find(needle) != std::wstring::npos;
    return lowerCopy(haystack).find(needle) != std::wstring::npos;
  }
};

bool boolParam(const JsonValue* params, const char* name, bool fallback) {
  const JsonValue* v = params->find(name);
  return (v && v->kind == JsonValue::Bool) ? v->boolean : fallback;
}

double numberParam(const JsonValue* params, const char* name, double fallback) {
  const JsonValue* v = params->find(name);
  return (v && v->kind == JsonValue::Number && v->number > 0) ? v->number : fallback;
}

std::string previewOf(const std::wstring& text) {
  std::wstring clipped = text.size() > 200 ? text.substr(0, 200) : text;
  for (auto& c : clipped) if (c == L'\r' || c == L'\n' || c == L'\t') c = L' ';
  return narrow(clipped);
}

}  // namespace

bool handleRegSearch(const JsonValue* params, std::string& result, Failure& err) {
  KeyParams p;
  if (!parseKeyParams(params, p)) { err = plainFailure("Invalid parameters."); return false; }
  const JsonValue* queryValue = params->find("query");
  if (!queryValue || queryValue->kind != JsonValue::String || queryValue->string.empty() || queryValue->string.size() > 1024) {
    err = plainFailure("Invalid parameters.");
    return false;
  }
  const bool matchKeys = boolParam(params, "matchKeys", true);
  const bool matchNames = boolParam(params, "matchValueNames", true);
  const bool matchData = boolParam(params, "matchValueData", true);
  const size_t limit = (size_t)std::min(numberParam(params, "limit", 1000), 5000.0);
  const ULONGLONG budgetMs = (ULONGLONG)std::min(numberParam(params, "timeBudgetMs", 5000), 10000.0);

  Matcher matcher;
  matcher.useRegex = boolParam(params, "regex", false);
  matcher.caseSensitive = boolParam(params, "caseSensitive", false);
  const std::wstring query = widen(queryValue->string);
  if (matcher.useRegex) {
    try {
      auto flags = std::regex_constants::ECMAScript;
      if (!matcher.caseSensitive) flags |= std::regex_constants::icase;
      matcher.pattern = std::wregex(query, flags);
    } catch (...) {
      err = plainFailure("Invalid search pattern.");
      return false;
    }
  } else {
    matcher.needle = matcher.caseSensitive ? query : lowerCopy(query);
  }

  {
    HKEY probe = nullptr;
    LONG rc = RegOpenKeyExW(p.hive, p.path.c_str(), 0, KEY_READ | p.viewFlag, &probe);
    if (rc != ERROR_SUCCESS) { err = win32Failure((DWORD)rc); return false; }
    RegCloseKey(probe);
  }

  const ULONGLONG started = GetTickCount64();
  bool truncated = false;
  size_t keysScanned = 0;
  size_t matchCount = 0;
  std::string matchesJson;

  auto addMatch = [&](const std::wstring& keyPath, const char* matchIn, const RawValue* value) {
    if (matchCount) matchesJson.push_back(',');
    matchCount++;
    matchesJson += "{\"keyPath\":";
    appendJsonString(matchesJson, std::string(p.hiveShort) + (keyPath.empty() ? "" : "\\" + narrow(keyPath)));
    matchesJson += std::string(",\"matchIn\":\"") + matchIn + "\"";
    if (value) {
      matchesJson += ",\"valueName\":";
      appendJsonString(matchesJson, narrow(value->name));
      matchesJson += std::string(",\"valueType\":\"") + typeName(value->type) + "\",\"preview\":";
      appendJsonString(matchesJson, previewOf(dataAsText(*value)));
    }
    matchesJson.push_back('}');
  };

  std::vector<std::wstring> stack;
  stack.push_back(p.path);
  bool isRoot = true;
  while (!stack.empty()) {
    if (matchCount >= limit || GetTickCount64() - started > budgetMs) { truncated = true; break; }
    std::wstring current = std::move(stack.back());
    stack.pop_back();

    if (!isRoot && matchKeys) {
      size_t slash = current.find_last_of(L'\\');
      std::wstring leaf = slash == std::wstring::npos ? current : current.substr(slash + 1);
      if (matcher.test(leaf)) addMatch(current, "key", nullptr);
    }
    isRoot = false;

    HKEY key = nullptr;
    if (RegOpenKeyExW(p.hive, current.c_str(), 0, KEY_READ | p.viewFlag, &key) != ERROR_SUCCESS) continue;  // denied: skip
    keysScanned++;

    if (matchNames || matchData) {
      std::vector<RawValue> values;
      if (readAllValues(key, values) == ERROR_SUCCESS) {
        for (const auto& v : values) {
          if (matchCount >= limit) { truncated = true; break; }
          if (matchNames && matcher.test(v.name)) { addMatch(current, "value-name", &v); continue; }
          if (matchData && !v.data.empty()) {
            std::wstring text = dataAsText(v);
            if (text.size() > 65536) text.resize(65536);
            if (matcher.test(text)) addMatch(current, "value-data", &v);
          }
        }
      }
    }

    std::vector<std::wstring> children;
    readSubkeyNames(key, children);
    RegCloseKey(key);
    for (auto it = children.rbegin(); it != children.rend(); ++it) stack.push_back(joinPath(current, *it));
  }
  if (!stack.empty()) truncated = true;

  result = "{\"matches\":[" + matchesJson + "],\"truncated\":" + (truncated ? "true" : "false") +
           ",\"keysScanned\":" + std::to_string(keysScanned) + "}";
  return true;
}

namespace {

const size_t kMaxExportChars = 16u * 1024u * 1024u;  // ~32 MB of UTF-16, before UTF-8 conversion

void appendRegString(std::wstring& out, const std::wstring& text) {
  out.push_back(L'"');
  for (wchar_t c : text) {
    if (c == L'\\' || c == L'"') out.push_back(L'\\');
    out.push_back(c);
  }
  out.push_back(L'"');
}

// regedit style: comma-separated lowercase byte pairs, wrapped with a trailing backslash near column 80.
void appendHexList(std::wstring& out, const std::vector<unsigned char>& bytes, size_t startColumn) {
  static const wchar_t digits[] = L"0123456789abcdef";
  size_t column = startColumn;
  for (size_t i = 0; i < bytes.size(); i++) {
    out.push_back(digits[bytes[i] >> 4]);
    out.push_back(digits[bytes[i] & 15]);
    column += 2;
    if (i + 1 < bytes.size()) {
      out.push_back(L',');
      column++;
      if (column > 77) {
        out += L"\\\r\n  ";
        column = 2;
      }
    }
  }
}

bool plainQuotedString(const std::vector<unsigned char>& bytes) {
  if (bytes.size() < sizeof(wchar_t) || bytes.size() % sizeof(wchar_t) != 0) return false;
  const wchar_t* w = (const wchar_t*)bytes.data();
  size_t chars = bytes.size() / sizeof(wchar_t);
  if (w[chars - 1] != L'\0') return false;
  for (size_t i = 0; i + 1 < chars; i++) if (w[i] < 0x20) return false;
  return true;
}

void appendValueLine(std::wstring& out, const RawValue& v) {
  std::wstring prefix;
  if (v.name.empty()) prefix = L"@=";
  else { appendRegString(prefix, v.name); prefix += L"="; }
  out += prefix;
  if (v.type == REG_SZ && plainQuotedString(v.data)) {
    const wchar_t* w = (const wchar_t*)v.data.data();
    appendRegString(out, std::wstring(w, v.data.size() / sizeof(wchar_t) - 1));
  } else if (v.type == REG_DWORD && v.data.size() == 4) {
    DWORD d;
    memcpy(&d, v.data.data(), 4);
    wchar_t buffer[24];
    swprintf(buffer, 24, L"dword:%08x", d);
    out += buffer;
  } else {
    std::wstring tag;
    if (v.type == REG_BINARY) {
      tag = L"hex:";
    } else {
      wchar_t buffer[24];
      swprintf(buffer, 24, L"hex(%x):", v.type);
      tag = buffer;
    }
    out += tag;
    appendHexList(out, v.data, prefix.size() + tag.size());
  }
  out += L"\r\n";
}

}  // namespace

bool handleRegExport(const JsonValue* params, std::string& result, Failure& err) {
  KeyParams p;
  if (!parseKeyParams(params, p)) { err = plainFailure("Invalid parameters."); return false; }
  const bool recursive = boolParam(params, "recursive", true);

  std::wstring text = L"Windows Registry Editor Version 5.00\r\n\r\n";
  const std::wstring hiveName = hiveFullName(p.hive);
  size_t keysExported = 0;
  bool capped = false;
  std::vector<std::wstring> stack;
  stack.push_back(p.path);
  bool isRoot = true;
  while (!stack.empty()) {
    if (text.size() > kMaxExportChars) { capped = true; break; }
    std::wstring current = std::move(stack.back());
    stack.pop_back();
    HKEY key = nullptr;
    LONG rc = RegOpenKeyExW(p.hive, current.c_str(), 0, KEY_READ | p.viewFlag, &key);
    if (rc != ERROR_SUCCESS) {
      if (isRoot) { err = win32Failure((DWORD)rc); return false; }
      continue;  // denied subkey: skip
    }
    isRoot = false;
    text += L"[" + hiveName + (current.empty() ? L"" : L"\\" + current) + L"]\r\n";
    std::vector<RawValue> values;
    if (readAllValues(key, values) == ERROR_SUCCESS) {
      for (const auto& v : values) appendValueLine(text, v);
    }
    text += L"\r\n";
    keysExported++;
    if (recursive) {
      std::vector<std::wstring> children;
      readSubkeyNames(key, children);
      for (auto it = children.rbegin(); it != children.rend(); ++it) stack.push_back(joinPath(current, *it));
    }
    RegCloseKey(key);
  }
  if (capped) text += L";DUDE: export truncated at the size limit.\r\n";
  result = "{\"text\":";
  appendJsonString(result, narrow(text));
  result += ",\"keysExported\":" + std::to_string(keysExported) + "}";
  return true;
}

}  // namespace sys
