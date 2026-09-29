// DUDE Windows system helper: reg.setValue / reg.deleteValue / reg.createKey / env.broadcast
// (DUDE_PRD.md §21 Phase 31, Milestone 598).
//
// These MUTATE the registry, so they are reached only from confirmed engine plans (never the renderer's
// read allowlist). Keys are opened with the minimum access each call needs (KEY_SET_VALUE for a value
// write/delete) plus the requested WOW64 view. There is deliberately no recursive key delete here.
// One protected-location check (isProtectedLocation) guards every write path.
#include "common.hpp"

#include <cwctype>

namespace sys {

namespace {

struct KeyRef {
  HKEY hive = nullptr;
  bool isLocalMachine = false;
  std::wstring path;
  REGSAM viewFlag = 0;
};

bool parseKeyRef(const JsonValue* params, KeyRef& out) {
  if (!params || params->kind != JsonValue::Object) return false;
  const JsonValue* hive = params->find("hive");
  const JsonValue* path = params->find("path");
  const JsonValue* view = params->find("view");
  if (!hive || hive->kind != JsonValue::String || !path || path->kind != JsonValue::String ||
      !view || view->kind != JsonValue::String) {
    return false;
  }
  if (hive->string == "HKLM") { out.hive = HKEY_LOCAL_MACHINE; out.isLocalMachine = true; }
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

std::wstring lowered(const std::wstring& value) {
  std::wstring out = value;
  for (auto& c : out) c = (wchar_t)towlower(c);
  return out;
}

bool startsWith(const std::wstring& text, const std::wstring& prefix) {
  return text.size() >= prefix.size() && text.compare(0, prefix.size(), prefix) == 0;
}

// The single protected-location list. `valueName` is null for key-level operations.
//  - HKLM\SAM, HKLM\SECURITY and HKLM\BCD00000000 (and everything below them);
//  - any ...\Services\<svc>[\...] value named ImagePath or ServiceDll.
bool isProtectedLocation(const KeyRef& key, const std::wstring* valueName) {
  std::wstring path = lowered(key.path);
  while (!path.empty() && path.front() == L'\\') path.erase(path.begin());
  while (!path.empty() && path.back() == L'\\') path.pop_back();
  if (key.isLocalMachine) {
    for (const wchar_t* root : {L"sam", L"security", L"bcd00000000"}) {
      std::wstring r = root;
      if (path == r || startsWith(path, r + L"\\")) return true;
    }
  }
  if (valueName) {
    std::wstring name = lowered(*valueName);
    if (name == L"imagepath" || name == L"servicedll") {
      // Find a "services" path segment that is followed by at least one more segment (the service key).
      std::wstring padded = L"\\" + path + L"\\";
      size_t at = padded.find(L"\\services\\");
      if (at != std::wstring::npos) {
        size_t rest = at + 10;  // just past "\services\"
        if (rest < padded.size() - 1) return true;
      }
    }
  }
  return false;
}

bool denied(Failure& err) {
  err = plainFailure("This registry location is protected from edits by DUDE.");
  return false;
}

int hexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

// Encodes `data` for `type` into raw registry bytes. Returns false with a message on bad input.
bool encodeData(const std::string& type, const JsonValue* data, DWORD& regType, std::vector<unsigned char>& bytes, Failure& err) {
  bytes.clear();
  auto bad = [&](const char* message) { err = plainFailure(message); return false; };
  auto appendWide = [&](const std::wstring& w) {
    const unsigned char* p = (const unsigned char*)w.data();
    bytes.insert(bytes.end(), p, p + w.size() * sizeof(wchar_t));
    bytes.insert(bytes.end(), sizeof(wchar_t), 0);
  };
  if (type == "REG_NONE") { regType = REG_NONE; return true; }
  if (!data) return bad("Invalid parameters.");
  if (type == "REG_SZ" || type == "REG_EXPAND_SZ" || type == "REG_LINK") {
    if (data->kind != JsonValue::String) return bad("Invalid parameters.");
    regType = type == "REG_SZ" ? REG_SZ : type == "REG_EXPAND_SZ" ? REG_EXPAND_SZ : REG_LINK;
    appendWide(widen(data->string));
    return true;
  }
  if (type == "REG_MULTI_SZ") {
    if (data->kind != JsonValue::Array) return bad("Invalid parameters.");
    regType = REG_MULTI_SZ;
    for (const auto& item : data->items) {
      if (item.kind != JsonValue::String || item.string.empty()) return bad("Invalid parameters.");
      appendWide(widen(item.string));
    }
    if (data->items.empty()) bytes.insert(bytes.end(), sizeof(wchar_t), 0);
    bytes.insert(bytes.end(), sizeof(wchar_t), 0);  // list terminator
    return true;
  }
  if (type == "REG_DWORD") {
    if (data->kind != JsonValue::Number || data->number < 0 || data->number > 4294967295.0 ||
        data->number != (double)(DWORD)data->number) {
      return bad("Invalid parameters.");
    }
    regType = REG_DWORD;
    DWORD v = (DWORD)data->number;
    bytes.resize(4);
    memcpy(bytes.data(), &v, 4);
    return true;
  }
  if (type == "REG_QWORD") {
    if (data->kind != JsonValue::String || data->string.empty() || data->string.size() > 20) return bad("Invalid parameters.");
    unsigned long long v = 0;
    for (char c : data->string) {
      if (c < '0' || c > '9') return bad("Invalid parameters.");
      unsigned long long d = (unsigned long long)(c - '0');
      if (v > (0xFFFFFFFFFFFFFFFFULL - d) / 10ULL) return bad("Invalid parameters.");
      v = v * 10 + d;
    }
    regType = REG_QWORD;
    bytes.resize(8);
    memcpy(bytes.data(), &v, 8);
    return true;
  }
  if (type == "REG_BINARY") {
    if (data->kind != JsonValue::String || data->string.size() % 2 != 0) return bad("Invalid parameters.");
    regType = REG_BINARY;
    for (size_t i = 0; i < data->string.size(); i += 2) {
      int hi = hexNibble(data->string[i]);
      int lo = hexNibble(data->string[i + 1]);
      if (hi < 0 || lo < 0) return bad("Invalid parameters.");
      bytes.push_back((unsigned char)(hi * 16 + lo));
    }
    return true;
  }
  return bad("Unsupported registry value type.");
}

bool valueNameParam(const JsonValue* params, std::wstring& name) {
  const JsonValue* v = params->find("name");
  if (!v || v->kind != JsonValue::String || v->string.size() > 16383) return false;
  name = widen(v->string);
  return true;
}

bool missingValue(Failure& err) {
  err = plainFailure("The value does not exist.");
  err.code = ERROR_FILE_NOT_FOUND;
  err.hasCode = true;
  return false;
}

}  // namespace

bool handleRegSetValue(const JsonValue* params, std::string& result, Failure& err) {
  KeyRef k;
  std::wstring name;
  if (!parseKeyRef(params, k) || !valueNameParam(params, name)) { err = plainFailure("Invalid parameters."); return false; }
  const JsonValue* type = params->find("type");
  if (!type || type->kind != JsonValue::String) { err = plainFailure("Invalid parameters."); return false; }
  DWORD regType = REG_NONE;
  std::vector<unsigned char> bytes;
  if (!encodeData(type->string, params->find("data"), regType, bytes, err)) return false;
  if (isProtectedLocation(k, &name)) return denied(err);

  HKEY key = nullptr;
  LONG rc = RegCreateKeyExW(k.hive, k.path.c_str(), 0, nullptr, REG_OPTION_NON_VOLATILE, KEY_SET_VALUE | k.viewFlag, nullptr, &key, nullptr);
  if (rc != ERROR_SUCCESS) { err = win32Failure((DWORD)rc); return false; }
  rc = RegSetValueExW(key, name.c_str(), 0, regType, bytes.empty() ? nullptr : bytes.data(), (DWORD)bytes.size());
  RegCloseKey(key);
  if (rc != ERROR_SUCCESS) { err = win32Failure((DWORD)rc); return false; }
  result = "{\"ok\":true}";
  return true;
}

bool handleRegDeleteValue(const JsonValue* params, std::string& result, Failure& err) {
  KeyRef k;
  std::wstring name;
  if (!parseKeyRef(params, k) || !valueNameParam(params, name)) { err = plainFailure("Invalid parameters."); return false; }
  if (isProtectedLocation(k, &name)) return denied(err);

  HKEY key = nullptr;
  LONG rc = RegOpenKeyExW(k.hive, k.path.c_str(), 0, KEY_SET_VALUE | k.viewFlag, &key);
  if (rc == ERROR_FILE_NOT_FOUND || rc == ERROR_PATH_NOT_FOUND) return missingValue(err);
  if (rc != ERROR_SUCCESS) { err = win32Failure((DWORD)rc); return false; }
  rc = RegDeleteValueW(key, name.c_str());
  RegCloseKey(key);
  if (rc == ERROR_FILE_NOT_FOUND) return missingValue(err);
  if (rc != ERROR_SUCCESS) { err = win32Failure((DWORD)rc); return false; }
  result = "{\"ok\":true}";
  return true;
}

bool handleRegCreateKey(const JsonValue* params, std::string& result, Failure& err) {
  KeyRef k;
  if (!parseKeyRef(params, k) || k.path.empty()) { err = plainFailure("Invalid parameters."); return false; }
  if (isProtectedLocation(k, nullptr)) return denied(err);
  HKEY key = nullptr;
  DWORD disposition = 0;
  LONG rc = RegCreateKeyExW(k.hive, k.path.c_str(), 0, nullptr, REG_OPTION_NON_VOLATILE, KEY_READ | k.viewFlag, nullptr, &key, &disposition);
  if (rc != ERROR_SUCCESS) { err = win32Failure((DWORD)rc); return false; }
  RegCloseKey(key);
  result = std::string("{\"created\":") + (disposition == REG_CREATED_NEW_KEY ? "true" : "false") + "}";
  return true;
}

bool handleEnvBroadcast(std::string& result, Failure& err) {
  DWORD_PTR ignored = 0;
  SetLastError(0);
  LRESULT rc = SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, (LPARAM)L"Environment", SMTO_ABORTIFHUNG, 5000, &ignored);
  // Zero means a window timed out or the call failed; the value itself is already written.
  if (rc == 0) {
    DWORD code = GetLastError();
    err = code ? win32Failure(code) : plainFailure("The environment change broadcast timed out.");
    return false;
  }
  result = "{\"ok\":true}";
  return true;
}

}  // namespace sys
