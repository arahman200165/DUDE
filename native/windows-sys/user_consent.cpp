// DUDE Windows system helper: user-presence verification for device-assisted owner recovery (Phase 31C, PD-029).
//
// `user-consent` asks the signed-in Windows user to prove presence: Windows Hello (UserConsentVerifier through the
// window-handle interop) when it is available, otherwise a CredUI credential prompt whose credential is validated with
// LogonUserW and must belong to the CURRENT user. Honest limit (PD-029): this is a client-side UI gate that the Hub
// cannot verify. NOT in SYS_READ_METHODS: only the desktop main process reaches it, for recovery confirmation.
//
// Runs the WinRT work on a dedicated MTA thread so the blocking .get() is legal (the RPC loop thread stays untouched).
// Credential buffers are zeroed before release and never logged or returned.
#include <unknwn.h>
#include "common.hpp"

#include <wincred.h>
#include <UserConsentVerifierInterop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Security.Credentials.UI.h>

#include <cstdlib>
#include <cwchar>

namespace sys { namespace {

constexpr size_t kMaxMessage = 256;

struct Outcome {
  bool verified = false;
  const char* method = "none";
  std::string reason;
  bool failed = false;  // an RPC-level failure rather than a verification result
  Failure failure;
};

struct Job {
  HWND hwnd = nullptr;
  std::wstring message;
  Outcome outcome;
};

bool stringParam(const JsonValue* p, const char* key, std::string& value) {
  const JsonValue* v = p && p->kind == JsonValue::Object ? p->find(key) : nullptr;
  if (!v || v->kind != JsonValue::String) return false;
  value = v->string;
  return true;
}

// Decimal or 0x-prefixed hexadecimal, no sign, no trailing characters.
bool parseHandle(const std::string& text, uintptr_t& value) {
  if (text.empty() || text.size() > 20) return false;
  int base = 10;
  size_t start = 0;
  if (text.size() > 2 && text[0] == '0' && (text[1] == 'x' || text[1] == 'X')) { base = 16; start = 2; }
  for (size_t i = start; i < text.size(); i++) {
    char c = text[i];
    bool digit = (c >= '0' && c <= '9') || (base == 16 && ((c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')));
    if (!digit) return false;
  }
  char* end = nullptr;
  unsigned long long parsed = std::strtoull(text.c_str() + start, &end, base);
  if (end == nullptr || *end != '\0') return false;
  value = (uintptr_t)parsed;
  return true;
}

std::string hresultText(HRESULT hr) {
  char buf[40];
  std::snprintf(buf, sizeof buf, "0x%08lX", (unsigned long)hr);
  return buf;
}

const char* verificationReason(winrt::Windows::Security::Credentials::UI::UserConsentVerificationResult r) {
  using R = winrt::Windows::Security::Credentials::UI::UserConsentVerificationResult;
  switch (r) {
    case R::Verified: return "";
    case R::DeviceNotPresent: return "device-not-present";
    case R::NotConfiguredForUser: return "not-configured";
    case R::DisabledByPolicy: return "disabled-by-policy";
    case R::DeviceBusy: return "device-busy";
    case R::RetriesExhausted: return "retries-exhausted";
    case R::Canceled: return "canceled";
    default: return "unknown";
  }
}

const char* availabilityReason(winrt::Windows::Security::Credentials::UI::UserConsentVerifierAvailability a) {
  using A = winrt::Windows::Security::Credentials::UI::UserConsentVerifierAvailability;
  switch (a) {
    case A::Available: return "";
    case A::DeviceNotPresent: return "device-not-present";
    case A::NotConfiguredForUser: return "not-configured";
    case A::DisabledByPolicy: return "disabled-by-policy";
    case A::DeviceBusy: return "device-busy";
    default: return "unknown";
  }
}

// ---- Windows Hello ----------------------------------------------------------------------------------------------

enum class HelloState { Unavailable, Done };

// Returns Unavailable when Hello cannot be used (the caller falls back to CredUI); Done fills `out`.
HelloState tryHello(const Job& job, Outcome& out) {
  using namespace winrt::Windows::Security::Credentials::UI;
  try {
    auto availability = UserConsentVerifier::CheckAvailabilityAsync().get();
    if (availability == UserConsentVerifierAvailability::DeviceBusy) {
      out.method = "hello"; out.reason = availabilityReason(availability); return HelloState::Done;
    }
    if (availability != UserConsentVerifierAvailability::Available) return HelloState::Unavailable;
  } catch (winrt::hresult_error const&) {
    return HelloState::Unavailable;
  }
  out.method = "hello";
  try {
    auto interop = winrt::get_activation_factory<UserConsentVerifier, IUserConsentVerifierInterop>();
    winrt::hstring message{job.message};
    winrt::Windows::Foundation::IAsyncOperation<UserConsentVerificationResult> operation{nullptr};
    winrt::check_hresult(interop->RequestVerificationForWindowAsync(
        job.hwnd, static_cast<HSTRING>(winrt::get_abi(message)),
        winrt::guid_of<winrt::Windows::Foundation::IAsyncOperation<UserConsentVerificationResult>>(), winrt::put_abi(operation)));
    UserConsentVerificationResult result = operation.get();
    out.verified = result == UserConsentVerificationResult::Verified;
    out.reason = verificationReason(result);
  } catch (winrt::hresult_error const& e) {
    out.verified = false;
    out.reason = "hello-error " + hresultText(e.code());
  }
  return HelloState::Done;
}

// ---- CredUI fallback --------------------------------------------------------------------------------------------

class Handle {
 public:
  Handle() = default;
  ~Handle() { if (h_) CloseHandle(h_); }
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  HANDLE* put() { return &h_; }
  HANDLE get() const { return h_; }
 private:
  HANDLE h_ = nullptr;
};

bool tokenUserSid(HANDLE token, std::vector<BYTE>& buffer) {
  DWORD needed = 0;
  GetTokenInformation(token, TokenUser, nullptr, 0, &needed);
  if (needed == 0) return false;
  buffer.assign(needed, 0);
  return GetTokenInformation(token, TokenUser, buffer.data(), needed, &needed) != FALSE;
}

bool sameUser(HANDLE a, HANDLE b) {
  std::vector<BYTE> x, y;
  if (!tokenUserSid(a, x) || !tokenUserSid(b, y)) return false;
  return EqualSid(((TOKEN_USER*)x.data())->User.Sid, ((TOKEN_USER*)y.data())->User.Sid) != FALSE;
}

void zeroWide(std::vector<wchar_t>& v) { if (!v.empty()) SecureZeroMemory(v.data(), v.size() * sizeof(wchar_t)); }

void credUiPrompt(const Job& job, Outcome& out) {
  out.method = "credui";
  CREDUI_INFOW info{};
  info.cbSize = sizeof info;
  info.hwndParent = job.hwnd;
  info.pszCaptionText = L"DUDE";
  info.pszMessageText = job.message.c_str();
  ULONG authPackage = 0;
  void* authBuffer = nullptr;
  ULONG authSize = 0;
  BOOL save = FALSE;
  DWORD rc = CredUIPromptForWindowsCredentialsW(&info, 0, &authPackage, nullptr, 0, &authBuffer, &authSize, &save, CREDUIWIN_ENUMERATE_CURRENT_USER);
  if (rc == ERROR_CANCELLED) { out.reason = "canceled"; return; }
  if (rc != NO_ERROR) { out.reason = "credui-error " + std::to_string(rc); return; }

  DWORD userLen = 0, domainLen = 0, passLen = 0;
  CredUnPackAuthenticationBufferW(0, authBuffer, authSize, nullptr, &userLen, nullptr, &domainLen, nullptr, &passLen);
  if (userLen == 0 && passLen == 0 && GetLastError() != ERROR_INSUFFICIENT_BUFFER) {
    SecureZeroMemory(authBuffer, authSize); CoTaskMemFree(authBuffer);
    out.reason = "credential-unreadable";
    return;
  }
  std::vector<wchar_t> user(userLen + 1), domain(domainLen + 1), pass(passLen + 1);
  DWORD ul = userLen, dl = domainLen, pl = passLen;
  BOOL unpacked = CredUnPackAuthenticationBufferW(0, authBuffer, authSize, user.data(), &ul, domain.data(), &dl, pass.data(), &pl);
  SecureZeroMemory(authBuffer, authSize);
  CoTaskMemFree(authBuffer);
  if (!unpacked) { zeroWide(user); zeroWide(domain); zeroWide(pass); out.reason = "credential-unreadable"; return; }

  // "DOMAIN\name" is split; a UPN or a bare name stays whole (a bare local name logs on against the local machine).
  std::wstring name(user.data());
  std::wstring dom(domain.data());
  size_t slash = name.find(L'\\');
  if (dom.empty() && slash != std::wstring::npos) { dom = name.substr(0, slash); name = name.substr(slash + 1); }
  if (dom.empty() && name.find(L'@') == std::wstring::npos) dom = L".";

  Handle logon;
  BOOL ok = LogonUserW(name.c_str(), dom.empty() ? nullptr : dom.c_str(), pass.data(), LOGON32_LOGON_INTERACTIVE, LOGON32_PROVIDER_DEFAULT, logon.put());
  DWORD logonError = ok ? 0 : GetLastError();
  zeroWide(user); zeroWide(domain); zeroWide(pass);
  SecureZeroMemory(&name[0], name.size() * sizeof(wchar_t));
  if (!ok) { out.reason = logonError == ERROR_LOGON_FAILURE ? "credential-rejected" : "logon-error " + std::to_string(logonError); return; }

  Handle self;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, self.put())) { out.reason = "token-error"; return; }
  if (!sameUser(self.get(), logon.get())) { out.reason = "not-current-user"; return; }
  out.verified = true;
}

DWORD WINAPI worker(void* argument) {
  Job& job = *static_cast<Job*>(argument);
  try {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
  } catch (...) {
    // Hello is unavailable without WinRT; the CredUI fallback below does not need it.
    credUiPrompt(job, job.outcome);
    return 0;
  }
  try {
    if (tryHello(job, job.outcome) == HelloState::Unavailable) credUiPrompt(job, job.outcome);
  } catch (...) {
    job.outcome.failed = true;
    job.outcome.failure = plainFailure("User verification failed unexpectedly.");
  }
  winrt::uninit_apartment();
  return 0;
}

}  // namespace

bool handleUserConsent(const JsonValue* params, std::string& result, Failure& err) {
  std::string hwndText, message;
  if (!stringParam(params, "hwnd", hwndText)) { err = plainFailure("user-consent requires an hwnd string."); return false; }
  if (!stringParam(params, "message", message) || message.empty() || message.size() > kMaxMessage) {
    err = plainFailure("user-consent requires a message of 1 to 256 characters."); return false;
  }
  uintptr_t handle = 0;
  if (!parseHandle(hwndText, handle)) { err = plainFailure("hwnd must be a decimal or 0x-prefixed hexadecimal window handle."); return false; }
  HWND hwnd = (HWND)handle;
  if (hwnd != nullptr && !IsWindow(hwnd)) { err = plainFailure("hwnd is not a window."); return false; }

  Job job;
  job.hwnd = hwnd;
  job.message = widen(message);
  if (job.message.size() > kMaxMessage) { err = plainFailure("user-consent requires a message of 1 to 256 characters."); return false; }
  HANDLE thread = CreateThread(nullptr, 0, worker, &job, 0, nullptr);
  if (!thread) { err = win32Failure(GetLastError()); return false; }
  WaitForSingleObject(thread, INFINITE);
  CloseHandle(thread);

  if (job.outcome.failed) { err = job.outcome.failure; return false; }
  result = std::string("{\"verified\":") + (job.outcome.verified ? "true" : "false") + ",\"method\":\"" + job.outcome.method + "\"";
  if (!job.outcome.verified && !job.outcome.reason.empty()) { result += ",\"reason\":"; appendJsonString(result, job.outcome.reason); }
  result += "}";
  return true;
}

}  // namespace sys
