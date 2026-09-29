// DUDE Windows system helper: file.version / file.signature (DUDE_PRD.md §21 Phase 31, Milestone 595).
//
// Read-only. file.version maps the file as data (GetFileVersionInfo) and never executes it.
// file.signature verifies Authenticode with WinVerifyTrust: no UI, no revocation network fetches
// (WTD_REVOKE_NONE + cache-only URL retrieval); files without an embedded signature are then
// matched against the system security catalogs.
#include "common.hpp"

#include <wincrypt.h>
#include <wintrust.h>
#include <softpub.h>
#include <mscat.h>

#include <cstring>

namespace sys {

namespace {

// { "path": "<absolute Windows path>" } and nothing else.
bool parsePath(const JsonValue* params, std::wstring& path, Failure& err) {
  const JsonValue* value = params && params->kind == JsonValue::Object && params->members.size() == 1 ? params->find("path") : nullptr;
  if (!value || value->kind != JsonValue::String) {
    err = plainFailure("Invalid file path.");
    return false;
  }
  std::wstring p = widen(value->string);
  bool ok = !p.empty() && p.size() <= 32767;
  for (wchar_t c : p) {
    if (c < 0x20) ok = false;
  }
  bool drive = p.size() >= 3 && ((p[0] >= L'A' && p[0] <= L'Z') || (p[0] >= L'a' && p[0] <= L'z')) && p[1] == L':' &&
               (p[2] == L'\\' || p[2] == L'/');
  bool unc = p.size() >= 3 && p[0] == L'\\' && p[1] == L'\\' && p[2] != L'\\';
  if (!ok || !(drive || unc)) {
    err = plainFailure("Invalid file path.");
    return false;
  }
  path = p;
  return true;
}

std::string quoted(const std::string& v) {
  std::string out;
  appendJsonString(out, v);
  return out;
}

std::string versionText(DWORD ms, DWORD ls) {
  return std::to_string(HIWORD(ms)) + "." + std::to_string(LOWORD(ms)) + "." + std::to_string(HIWORD(ls)) + "." + std::to_string(LOWORD(ls));
}

bool signerName(HANDLE stateData, std::string& out) {
  CRYPT_PROVIDER_DATA* data = WTHelperProvDataFromStateData(stateData);
  if (!data) return false;
  CRYPT_PROVIDER_SGNR* signer = WTHelperGetProvSignerFromChain(data, 0, FALSE, 0);
  if (!signer) return false;
  CRYPT_PROVIDER_CERT* cert = WTHelperGetProvCertFromChain(signer, 0);
  if (!cert || !cert->pCert) return false;
  wchar_t name[512];
  DWORD n = CertGetNameStringW(cert->pCert, CERT_NAME_SIMPLE_DISPLAY_TYPE, 0, nullptr, name, 512);
  if (n <= 1) return false;
  out = narrow(name, n - 1);
  return true;
}

std::string hexOf(const unsigned char* bytes, DWORD n) {
  static const char* digits = "0123456789ABCDEF";
  std::string out;
  for (DWORD i = 0; i < n; i++) {
    out.push_back(digits[bytes[i] >> 4]);
    out.push_back(digits[bytes[i] & 15]);
  }
  return out;
}

std::string hresultText(LONG code) {
  Failure f = win32Failure((DWORD)code);
  if (f.message.rfind("Windows error ", 0) == 0) {
    char buf[64];
    std::snprintf(buf, sizeof buf, "Signature verification failed (0x%08lX).", (unsigned long)code);
    return buf;
  }
  return f.message;
}

// Runs WinVerifyTrust and always closes the provider state. Returns the WinVerifyTrust result.
LONG verify(WINTRUST_DATA& data, std::string* signer) {
  GUID action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
  data.dwStateAction = WTD_STATEACTION_VERIFY;
  LONG r = WinVerifyTrust((HWND)INVALID_HANDLE_VALUE, &action, &data);
  DWORD lastError = GetLastError();
  if (signer && data.hWVTStateData) {
    std::string name;
    if (signerName(data.hWVTStateData, name)) *signer = name;
  }
  data.dwStateAction = WTD_STATEACTION_CLOSE;
  WinVerifyTrust((HWND)INVALID_HANDLE_VALUE, &action, &data);
  SetLastError(lastError);
  return r;
}

void initData(WINTRUST_DATA& data) {
  std::memset(&data, 0, sizeof data);
  data.cbStruct = sizeof data;
  data.dwUIChoice = WTD_UI_NONE;
  data.fdwRevocationChecks = WTD_REVOKE_NONE;
  data.dwProvFlags = WTD_CACHE_ONLY_URL_RETRIEVAL;
}

std::string signatureJson(const char* status, const std::string& signer, const std::string& message) {
  std::string out = std::string("{\"status\":\"") + status + "\"";
  if (!signer.empty()) out += ",\"signer\":" + quoted(signer);
  if (!message.empty()) out += ",\"message\":" + quoted(message);
  return out + "}";
}

// Returns true (with signer) when a system catalog vouches for the file.
bool verifyViaCatalog(const std::wstring& path, std::string& signer) {
  HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
                            OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) return false;
  bool verified = false;
  const wchar_t* algorithms[] = {L"SHA256", nullptr};  // nullptr = the default (SHA-1) catalog hash
  for (const wchar_t* alg : algorithms) {
    HCATADMIN admin = nullptr;
    if (!CryptCATAdminAcquireContext2(&admin, nullptr, alg, nullptr, 0)) continue;
    DWORD hashSize = 0;
    CryptCATAdminCalcHashFromFileHandle2(admin, file, &hashSize, nullptr, 0);
    if (hashSize > 0 && hashSize <= 128) {
      unsigned char hash[128];
      if (CryptCATAdminCalcHashFromFileHandle2(admin, file, &hashSize, hash, 0)) {
        std::wstring tag = widen(hexOf(hash, hashSize));
        HCATINFO catalog = CryptCATAdminEnumCatalogFromHash(admin, hash, hashSize, 0, nullptr);
        while (catalog) {
          CATALOG_INFO info = {};
          info.cbStruct = sizeof info;
          if (CryptCATCatalogInfoFromContext(catalog, &info, 0)) {
            WINTRUST_CATALOG_INFO ci;
            std::memset(&ci, 0, sizeof ci);
            ci.cbStruct = sizeof ci;
            ci.pcwszCatalogFilePath = info.wszCatalogFile;
            ci.pcwszMemberTag = tag.c_str();
            ci.pcwszMemberFilePath = path.c_str();
            ci.hMemberFile = file;
            ci.pbCalculatedFileHash = hash;
            ci.cbCalculatedFileHash = hashSize;
            ci.hCatAdmin = admin;
            WINTRUST_DATA data;
            initData(data);
            data.dwUnionChoice = WTD_CHOICE_CATALOG;
            data.pCatalog = &ci;
            if (verify(data, &signer) == 0) verified = true;
          }
          if (verified) {
            CryptCATAdminReleaseCatalogContext(admin, catalog, 0);
            break;
          }
          // Passing the previous context makes the next enumeration release it.
          catalog = CryptCATAdminEnumCatalogFromHash(admin, hash, hashSize, 0, &catalog);
        }
      }
    }
    CryptCATAdminReleaseContext(admin, 0);
    if (verified) break;
  }
  CloseHandle(file);
  return verified;
}

}  // namespace

bool handleFileVersion(const JsonValue* params, std::string& result, Failure& err) {
  std::wstring path;
  if (!parsePath(params, path, err)) return false;

  DWORD ignored = 0;
  DWORD size = GetFileVersionInfoSizeW(path.c_str(), &ignored);
  if (size == 0) {
    DWORD e = GetLastError();
    // No version resource (or not a PE image at all) is an ordinary answer, not a failure.
    if (e == ERROR_SUCCESS || e == ERROR_RESOURCE_DATA_NOT_FOUND || e == ERROR_RESOURCE_TYPE_NOT_FOUND ||
        e == ERROR_RESOURCE_NAME_NOT_FOUND || e == ERROR_RESOURCE_LANG_NOT_FOUND || e == ERROR_BAD_EXE_FORMAT ||
        e == ERROR_INVALID_EXE_SIGNATURE || e == ERROR_EXE_MARKED_INVALID || e == ERROR_FILE_CORRUPT) {
      result = "{\"fixed\":null,\"strings\":{}}";
      return true;
    }
    err = win32Failure(e);
    return false;
  }
  std::vector<unsigned char> block(size);
  if (!GetFileVersionInfoW(path.c_str(), 0, size, block.data())) {
    err = win32Failure(GetLastError());
    return false;
  }

  std::string fixed = "null";
  VS_FIXEDFILEINFO* ffi = nullptr;
  UINT len = 0;
  if (VerQueryValueW(block.data(), L"\\", (LPVOID*)&ffi, &len) && ffi && len >= sizeof(VS_FIXEDFILEINFO) && ffi->dwSignature == 0xFEEF04BD) {
    fixed = "{\"fileVersion\":" + quoted(versionText(ffi->dwFileVersionMS, ffi->dwFileVersionLS)) +
            ",\"productVersion\":" + quoted(versionText(ffi->dwProductVersionMS, ffi->dwProductVersionLS)) + "}";
  }

  // First translation, then common fallbacks (US English Unicode / Windows-1252, neutral Unicode).
  std::vector<std::wstring> languages;
  struct Translation {
    WORD language;
    WORD codePage;
  };
  Translation* translations = nullptr;
  len = 0;
  if (VerQueryValueW(block.data(), L"\\VarFileInfo\\Translation", (LPVOID*)&translations, &len) && translations && len >= sizeof(Translation)) {
    wchar_t code[16];
    swprintf(code, 16, L"%04x%04x", translations[0].language, translations[0].codePage);
    languages.push_back(code);
  }
  languages.push_back(L"040904b0");
  languages.push_back(L"040904e4");
  languages.push_back(L"000004b0");

  static const wchar_t* keys[] = {L"CompanyName", L"FileDescription", L"FileVersion", L"ProductName",
                                  L"ProductVersion", L"OriginalFilename", L"InternalName", L"LegalCopyright"};
  std::string strings = "{";
  bool first = true;
  for (const wchar_t* key : keys) {
    for (const std::wstring& lang : languages) {
      std::wstring query = L"\\StringFileInfo\\" + lang + L"\\" + key;
      wchar_t* text = nullptr;
      UINT n = 0;
      if (VerQueryValueW(block.data(), query.c_str(), (LPVOID*)&text, &n) && text && n > 0) {
        size_t chars = wcsnlen(text, n);
        if (!first) strings.push_back(',');
        first = false;
        appendJsonString(strings, narrow(key, wcslen(key)));
        strings.push_back(':');
        appendJsonWide(strings, text, chars);
        break;
      }
    }
  }
  strings.push_back('}');
  result = "{\"fixed\":" + fixed + ",\"strings\":" + strings + "}";
  return true;
}

bool handleFileSignature(const JsonValue* params, std::string& result, Failure& err) {
  std::wstring path;
  if (!parsePath(params, path, err)) return false;
  DWORD attrs = GetFileAttributesW(path.c_str());
  if (attrs == INVALID_FILE_ATTRIBUTES) {
    err = win32Failure(GetLastError());
    return false;
  }
  if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
    err = plainFailure("The path is a directory, not a file.");
    return false;
  }

  WINTRUST_FILE_INFO fileInfo;
  std::memset(&fileInfo, 0, sizeof fileInfo);
  fileInfo.cbStruct = sizeof fileInfo;
  fileInfo.pcwszFilePath = path.c_str();
  WINTRUST_DATA data;
  initData(data);
  data.dwUnionChoice = WTD_CHOICE_FILE;
  data.pFile = &fileInfo;

  std::string signer;
  LONG r = verify(data, &signer);
  if (r == 0) {
    result = signatureJson("signed", signer, "");
    return true;
  }
  if (r == TRUST_E_NOSIGNATURE || r == TRUST_E_PROVIDER_UNKNOWN || r == TRUST_E_SUBJECT_FORM_UNKNOWN) {
    std::string catalogSigner;
    if (verifyViaCatalog(path, catalogSigner)) {
      result = signatureJson("catalog-signed", catalogSigner, "");
      return true;
    }
    result = signatureJson("unsigned", "", "");
    return true;
  }
  result = signatureJson("invalid", signer, hresultText(r));
  return true;
}

}  // namespace sys
