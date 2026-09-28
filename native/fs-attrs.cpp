// DUDE filesystem attribute helper (DUDE_PRD.md §21 Phase 29, Milestone 523).
//
// Node's fs API does not expose Windows file attributes, so the fs utility process starts this
// long-lived helper only when a walk asks to skip hidden/system entries. Protocol: one UTF-8
// directory path per stdin line; one JSON line per request on stdout:
//   {"entries":[["name",attributes],...]}   or   {"error":<GetLastError code>}
// Read-only: it enumerates with FindFirstFileExW and never opens file contents.
#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <cstdio>
#include <iostream>
#include <string>

static std::wstring widen(const std::string& value) {
  if (value.empty()) return std::wstring();
  int size = MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0);
  std::wstring out(size, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), &out[0], size);
  return out;
}

static std::string narrow(const wchar_t* value) {
  int size = WideCharToMultiByte(CP_UTF8, 0, value, -1, nullptr, 0, nullptr, nullptr);
  if (size <= 1) return std::string();
  std::string out(size - 1, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value, -1, &out[0], size, nullptr, nullptr);
  return out;
}

static void appendJsonString(std::string& out, const std::string& value) {
  out.push_back('"');
  for (unsigned char c : value) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof buf, "\\u%04x", c); out += buf; }
        else out.push_back((char)c);
    }
  }
  out.push_back('"');
}

int main() {
  std::ios::sync_with_stdio(false);
  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    std::wstring pattern = L"\\\\?\\" + widen(line);
    if (!pattern.empty() && pattern.back() != L'\\') pattern.push_back(L'\\');
    pattern.push_back(L'*');
    WIN32_FIND_DATAW data;
    HANDLE find = FindFirstFileExW(pattern.c_str(), FindExInfoBasic, &data, FindExSearchNameMatch, nullptr, FIND_FIRST_EX_LARGE_FETCH);
    if (find == INVALID_HANDLE_VALUE) {
      std::cout << "{\"error\":" << GetLastError() << "}\n" << std::flush;
      continue;
    }
    std::string out = "{\"entries\":[";
    bool first = true;
    do {
      if (wcscmp(data.cFileName, L".") == 0 || wcscmp(data.cFileName, L"..") == 0) continue;
      if (!first) out.push_back(',');
      first = false;
      out.push_back('[');
      appendJsonString(out, narrow(data.cFileName));
      out += "," + std::to_string(data.dwFileAttributes) + "]";
    } while (FindNextFileW(find, &data));
    FindClose(find);
    out += "]}\n";
    std::cout << out << std::flush;
  }
  return 0;
}
