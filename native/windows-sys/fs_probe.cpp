// DUDE Windows system helper: fs.probeDirs (DUDE_PRD.md §21 Phase 31, Milestone 599).
//
// Read-only directory probe for the PATH Editor & Conflict Detector: for each directory, does it exist,
// is it a directory, and which files in it carry an executable extension (from PATHEXT). Never recurses
// and never opens file contents.
#include <algorithm>
#include <cwctype>

#include "common.hpp"

namespace sys {
namespace {

constexpr size_t kMaxDirs = 256;
constexpr size_t kMaxExecutables = 2048;

std::wstring lower(const std::wstring& value) {
  std::wstring out = value;
  for (auto& c : out) c = (wchar_t)std::towlower(c);
  return out;
}

// Applies the long-path prefix (UNC paths become the UNC form), normalizing forward slashes first.
std::wstring longPath(std::wstring path) {
  std::replace(path.begin(), path.end(), L'/', L'\\');
  if (path.rfind(L"\\\\?\\", 0) == 0) return path;
  if (path.rfind(L"\\\\", 0) == 0) return L"\\\\?\\UNC\\" + path.substr(2);
  return L"\\\\?\\" + path;
}

}  // namespace

bool handleFsProbeDirs(const JsonValue* params, std::string& result, Failure& err) {
  const JsonValue* dirs = params && params->kind == JsonValue::Object ? params->find("dirs") : nullptr;
  if (!dirs || dirs->kind != JsonValue::Array) { err = plainFailure("Invalid parameters."); return false; }
  std::vector<std::wstring> extensions;
  const JsonValue* exts = params->find("extensions");
  if (exts) {
    if (exts->kind != JsonValue::Array) { err = plainFailure("Invalid parameters."); return false; }
    for (const auto& item : exts->items) {
      if (item.kind != JsonValue::String) { err = plainFailure("Invalid parameters."); return false; }
      extensions.push_back(lower(widen(item.string)));
    }
  }

  result = "{\"dirs\":[";
  size_t count = 0;
  for (const auto& item : dirs->items) {
    if (item.kind != JsonValue::String) { err = plainFailure("Invalid parameters."); return false; }
    if (count >= kMaxDirs) break;
    if (count++ > 0) result.push_back(',');

    std::wstring path = longPath(widen(item.string));
    DWORD attrs = GetFileAttributesW(path.c_str());
    bool exists = attrs != INVALID_FILE_ATTRIBUTES;
    bool isDirectory = exists && (attrs & FILE_ATTRIBUTE_DIRECTORY) != 0;
    std::vector<std::string> names;
    std::string error;

    if (isDirectory && !extensions.empty()) {
      std::wstring pattern = path;
      if (pattern.back() != L'\\') pattern.push_back(L'\\');
      pattern.push_back(L'*');
      WIN32_FIND_DATAW data;
      HANDLE find = FindFirstFileExW(pattern.c_str(), FindExInfoBasic, &data, FindExSearchNameMatch, nullptr, FIND_FIRST_EX_LARGE_FETCH);
      if (find == INVALID_HANDLE_VALUE) {
        error = win32Failure(GetLastError()).message;
      } else {
        do {
          if (data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue;
          std::wstring name = data.cFileName;
          size_t dot = name.rfind(L'.');
          if (dot == std::wstring::npos) continue;
          std::wstring ext = lower(name.substr(dot));
          if (std::find(extensions.begin(), extensions.end(), ext) == extensions.end()) continue;
          if (names.size() >= kMaxExecutables) { error = "Too many entries; truncated."; break; }
          names.push_back(narrow(name));
        } while (FindNextFileW(find, &data));
        FindClose(find);
      }
    }

    result += "{\"dir\":";
    appendJsonString(result, item.string);
    result += std::string(",\"exists\":") + (exists ? "true" : "false");
    result += std::string(",\"isDirectory\":") + (isDirectory ? "true" : "false");
    result += ",\"executables\":[";
    for (size_t i = 0; i < names.size(); i++) {
      if (i) result.push_back(',');
      appendJsonString(result, names[i]);
    }
    result.push_back(']');
    if (!error.empty()) { result += ",\"error\":"; appendJsonString(result, error); }
    result.push_back('}');
  }
  result += "]}";
  return true;
}

}  // namespace sys
