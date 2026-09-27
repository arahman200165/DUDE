#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0A00
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <icmpapi.h>
#include <shellapi.h>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>
#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Iphlpapi.lib")

static const char* statusName(unsigned long status) {
  switch (status) {
    case IP_SUCCESS: return "success";
    case IP_PACKET_TOO_BIG: return "packet-too-big";
    case IP_TTL_EXPIRED_TRANSIT: return "hop";
    case IP_REQ_TIMED_OUT: return "timeout";
    case IP_DEST_HOST_UNREACHABLE: case IP_DEST_NET_UNREACHABLE: case IP_DEST_UNREACHABLE: return "unreachable";
    default: return "unknown";
  }
}
static void output(const char* status, unsigned long code, unsigned int rtt = 0, const char* address = "") {
  std::cout << "{\"status\":\"" << status << "\",\"code\":" << code;
  if (status == std::string("success") || status == std::string("hop")) std::cout << ",\"rttMs\":" << rtt;
  if (address[0]) std::cout << ",\"address\":\"" << address << "\"";
  std::cout << "}" << std::endl;
}
static bool isElevated() {
  HANDLE token = nullptr;
  TOKEN_ELEVATION elevation{};
  DWORD size = 0;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
  bool result = GetTokenInformation(token, TokenElevation, &elevation, sizeof(elevation), &size) && elevation.TokenIsElevated;
  CloseHandle(token);
  return result;
}
static int relaunchMode() {
  int argc = 0;
  wchar_t** args = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (!args || argc < 2) { output("invalid", 5); return 2; }
  const std::wstring mode(args[1]);
  if (mode == L"status") {
    output(isElevated() ? "elevated" : "standard", 0);
    LocalFree(args);
    return 0;
  }
  if (mode == L"relaunch" && (argc == 4 || argc == 5)) {
    wchar_t self[MAX_PATH] = {};
    if (!GetModuleFileNameW(nullptr, self, MAX_PATH)) { output("error", GetLastError()); LocalFree(args); return 2; }
    const std::wstring parameters = L"elevated-relaunch " + std::wstring(args[2]) + L" \"" + std::wstring(args[3]) + L"\"" + (argc == 5 ? L" \"" + std::wstring(args[4]) + L"\"" : L"");
    SHELLEXECUTEINFOW info{}; info.cbSize = sizeof(info);
    info.fMask = SEE_MASK_NOCLOSEPROCESS;
    info.lpVerb = L"runas";
    info.lpFile = self;
    info.lpParameters = parameters.c_str();
    info.nShow = SW_HIDE;
    if (!ShellExecuteExW(&info)) { output("declined", GetLastError()); LocalFree(args); return 0; }
    if (info.hProcess) CloseHandle(info.hProcess);
    output("accepted", 0);
    LocalFree(args);
    return 0;
  }
  if (mode == L"elevated-relaunch" && (argc == 4 || argc == 5) && isElevated()) {
    const DWORD parentId = wcstoul(args[2], nullptr, 10);
    HANDLE parent = OpenProcess(SYNCHRONIZE, FALSE, parentId);
    if (parent) { WaitForSingleObject(parent, 30000); CloseHandle(parent); }
    Sleep(500);
    const std::wstring appArgs = argc == 5 ? L"\"" + std::wstring(args[4]) + L"\" --dude-admin-relaunch" : L"--dude-admin-relaunch";
    auto result = ShellExecuteW(nullptr, L"open", args[3], appArgs.c_str(), nullptr, SW_SHOWNORMAL);
    LocalFree(args);
    return reinterpret_cast<INT_PTR>(result) > 32 ? 0 : 2;
  }
  LocalFree(args);
  output("invalid", 6);
  return 2;
}int main(int argc, char** argv) {
  if (argc > 1 && std::string(argv[1]) != "probe") return relaunchMode();
  if (argc != 7 || std::string(argv[1]) != "probe") { output("invalid", 1); return 2; }
  const std::string target(argv[2]);
  const std::string family(argv[3]);
  const int ttl = std::atoi(argv[4]);
  const int packetSize = std::atoi(argv[5]);
  const int timeout = std::atoi(argv[6]);
  if (target.empty() || target.size() > 253 || ttl < 1 || ttl > 255 || packetSize < 48 || packetSize > 9000 || timeout < 100 || timeout > 30000) { output("invalid", 2); return 2; }
  WSADATA wsa{};
  if (WSAStartup(MAKEWORD(2,2), &wsa) != 0) { output("error", 3); return 2; }
  addrinfo hints{}; hints.ai_family = family == "ipv4" ? AF_INET : family == "ipv6" ? AF_INET6 : AF_UNSPEC; hints.ai_socktype = SOCK_STREAM;
  addrinfo* resolved = nullptr;
  if (getaddrinfo(target.c_str(), nullptr, &hints, &resolved) != 0 || !resolved) { output("resolve-error", WSAGetLastError()); WSACleanup(); return 0; }
  const int af = resolved->ai_family;
  if (af != AF_INET && af != AF_INET6) { output("resolve-error", 4); freeaddrinfo(resolved); WSACleanup(); return 0; }
  const int headerBytes = af == AF_INET ? 28 : 48;
  const int payloadBytes = packetSize > headerBytes ? packetSize - headerBytes : 1;
  std::vector<char> payload(payloadBytes, 'D');
  std::vector<char> reply(65536, 0);
  IP_OPTION_INFORMATION options{};
  options.Ttl = static_cast<unsigned char>(ttl);
  options.Flags = af == AF_INET ? IP_FLAG_DF : 0;
  char address[INET6_ADDRSTRLEN] = {};
  DWORD count = 0;
  DWORD error = 0;
  if (af == AF_INET) {
    HANDLE handle = IcmpCreateFile();
    if (handle == INVALID_HANDLE_VALUE) { output("error", GetLastError()); freeaddrinfo(resolved); WSACleanup(); return 0; }
    auto* destination = reinterpret_cast<sockaddr_in*>(resolved->ai_addr);
    count = IcmpSendEcho2(handle, nullptr, nullptr, nullptr, destination->sin_addr.S_un.S_addr,
      payload.data(), static_cast<WORD>(payload.size()), &options, reply.data(), static_cast<DWORD>(reply.size()), timeout);
    error = GetLastError();
    if (count) {
      auto* result = reinterpret_cast<ICMP_ECHO_REPLY*>(reply.data());
      in_addr source{}; source.S_un.S_addr = result->Address;
      InetNtopA(AF_INET, &source, address, sizeof(address));
      output(statusName(result->Status), result->Status, result->RoundTripTime, address);
    } else output(error == IP_REQ_TIMED_OUT ? "timeout" : "unknown", error);
    IcmpCloseHandle(handle);
  } else {
    HANDLE handle = Icmp6CreateFile();
    if (handle == INVALID_HANDLE_VALUE) { output("error", GetLastError()); freeaddrinfo(resolved); WSACleanup(); return 0; }
    sockaddr_in6 source{}; source.sin6_family = AF_INET6;
    auto* destination = reinterpret_cast<sockaddr_in6*>(resolved->ai_addr);
    count = Icmp6SendEcho2(handle, nullptr, nullptr, nullptr, &source, destination,
      payload.data(), static_cast<WORD>(payload.size()), &options, reply.data(), static_cast<DWORD>(reply.size()), timeout);
    error = GetLastError();
    if (count) {
      Icmp6ParseReplies(reply.data(), static_cast<DWORD>(reply.size()));
      auto* result = reinterpret_cast<ICMPV6_ECHO_REPLY*>(reply.data());
      InetNtopA(AF_INET6, result->Address.sin6_addr, address, sizeof(address));
      output(statusName(result->Status), result->Status, result->RoundTripTime, address);
    } else output(error == IP_REQ_TIMED_OUT ? "timeout" : "unknown", error);
    IcmpCloseHandle(handle);
  }
  freeaddrinfo(resolved);
  WSACleanup();
  return 0;
}
