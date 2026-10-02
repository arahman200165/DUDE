// DUDE Windows system helper: DPAPI wrap/unwrap for the Device Agent (Phase 31C, PD-026/PD-031).
// CurrentUser scope only. These methods are deliberately NOT in SYS_READ_METHODS: only the Device Agent
// process reaches them. Secret buffers are zeroed before release.
#include "common.hpp"
#include <wincrypt.h>
#include <dpapi.h>
#include <vector>

namespace sys { namespace {
constexpr size_t kMaxInput = 64 * 1024;
constexpr size_t kMaxBase64 = ((kMaxInput + 2) / 3) * 4 + 64;

bool param(const JsonValue* p, const char* k, std::string& v) {
  auto x = p && p->kind == JsonValue::Object ? p->find(k) : nullptr;
  if (!x || x->kind != JsonValue::String) return false;
  v = x->string; return true;
}
bool decode(const std::string& in, std::vector<BYTE>& out, Failure& err, const char* what) {
  out.clear();
  if (in.size() > kMaxBase64) { err = plainFailure("DPAPI input exceeds the 64 KiB limit."); return false; }
  if (in.empty()) return true;
  DWORD n = 0;
  if (!CryptStringToBinaryA(in.c_str(), (DWORD)in.size(), CRYPT_STRING_BASE64, nullptr, &n, nullptr, nullptr)) {
    err = plainFailure(what); return false;
  }
  if (n > kMaxInput) { err = plainFailure("DPAPI input exceeds the 64 KiB limit."); return false; }
  out.resize(n);
  if (!CryptStringToBinaryA(in.c_str(), (DWORD)in.size(), CRYPT_STRING_BASE64, out.data(), &n, nullptr, nullptr)) {
    SecureZeroMemory(out.data(), out.size()); out.clear(); err = plainFailure(what); return false;
  }
  out.resize(n); return true;
}
std::string encode(const BYTE* data, DWORD size) {
  if (!size) return {};
  DWORD n = 0; CryptBinaryToStringA(data, size, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &n);
  std::string out(n, '\0');
  CryptBinaryToStringA(data, size, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, out.data(), &n);
  out.resize(n); while (!out.empty() && out.back() == '\0') out.pop_back();
  return out;
}
bool run(bool protect, const JsonValue* p, std::string& out, Failure& err) {
  const char* key = protect ? "data" : "blob";
  std::string in, ent;
  if (!param(p, key, in)) { err = plainFailure(protect ? "dpapi.protect requires a base64 data string." : "dpapi.unprotect requires a base64 blob string."); return false; }
  bool hasEntropy = param(p, "entropy", ent);
  std::vector<BYTE> input, entropy;
  if (!decode(in, input, err, "DPAPI input is not valid base64.")) return false;
  if (hasEntropy && !decode(ent, entropy, err, "DPAPI entropy is not valid base64.")) { if (!input.empty()) SecureZeroMemory(input.data(), input.size()); return false; }
  if (input.empty()) { err = plainFailure("DPAPI input must not be empty."); return false; }
  DATA_BLOB inBlob{(DWORD)input.size(), input.data()};
  DATA_BLOB entBlob{(DWORD)entropy.size(), entropy.empty() ? nullptr : entropy.data()};
  DATA_BLOB outBlob{0, nullptr};
  BOOL ok = protect
    ? CryptProtectData(&inBlob, L"DUDE", entropy.empty() ? nullptr : &entBlob, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &outBlob)
    : CryptUnprotectData(&inBlob, nullptr, entropy.empty() ? nullptr : &entBlob, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &outBlob);
  DWORD code = ok ? 0 : GetLastError();
  SecureZeroMemory(input.data(), input.size());
  if (!entropy.empty()) SecureZeroMemory(entropy.data(), entropy.size());
  if (!ok) { err = win32Failure(code); return false; }
  std::string b64 = encode(outBlob.pbData, outBlob.cbData);
  SecureZeroMemory(outBlob.pbData, outBlob.cbData);
  LocalFree(outBlob.pbData);
  out = std::string("{\"") + (protect ? "blob" : "data") + "\":\"" + b64 + "\"}";
  if (!protect && !b64.empty()) SecureZeroMemory(b64.data(), b64.size());
  return true;
}
}

bool handleDpapiProtect(const JsonValue* p, std::string& out, Failure& err) { return run(true, p, out, err); }
bool handleDpapiUnprotect(const JsonValue* p, std::string& out, Failure& err) { return run(false, p, out, err); }
}  // namespace sys
