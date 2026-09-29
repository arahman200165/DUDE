// DUDE Windows system helper: net.tcp / net.udp (DUDE_PRD.md §21 Phase 31, Milestone 593).
//
// Socket tables with owning PIDs via GetExtendedTcpTable / GetExtendedUdpTable for IPv4 and IPv6.
// Read-only: the tables are snapshots and nothing is opened, closed or reset.
#include "common.hpp"

#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>

#include <vector>

namespace sys {

namespace {

const char* tcpStateName(DWORD state) {
  switch (state) {
    case MIB_TCP_STATE_CLOSED: return "CLOSED";
    case MIB_TCP_STATE_LISTEN: return "LISTEN";
    case MIB_TCP_STATE_SYN_SENT: return "SYN_SENT";
    case MIB_TCP_STATE_SYN_RCVD: return "SYN_RCVD";
    case MIB_TCP_STATE_ESTAB: return "ESTABLISHED";
    case MIB_TCP_STATE_FIN_WAIT1: return "FIN_WAIT1";
    case MIB_TCP_STATE_FIN_WAIT2: return "FIN_WAIT2";
    case MIB_TCP_STATE_CLOSE_WAIT: return "CLOSE_WAIT";
    case MIB_TCP_STATE_CLOSING: return "CLOSING";
    case MIB_TCP_STATE_LAST_ACK: return "LAST_ACK";
    case MIB_TCP_STATE_TIME_WAIT: return "TIME_WAIT";
    case MIB_TCP_STATE_DELETE_TCB: return "DELETE_TCB";
    default: return "UNKNOWN";
  }
}

unsigned portOf(DWORD raw) { return (unsigned)ntohs((u_short)(raw & 0xFFFF)); }

std::string addr4(DWORD address) {
  IN_ADDR a;
  a.S_un.S_addr = address;
  wchar_t buf[INET_ADDRSTRLEN] = {};
  if (!InetNtopW(AF_INET, &a, buf, INET_ADDRSTRLEN)) return std::string();
  return narrow(buf, wcslen(buf));
}

std::string addr6(const UCHAR* bytes) {
  IN6_ADDR a;
  memcpy(&a, bytes, sizeof a);
  wchar_t buf[INET6_ADDRSTRLEN] = {};
  if (!InetNtopW(AF_INET6, &a, buf, INET6_ADDRSTRLEN)) return std::string();
  return narrow(buf, wcslen(buf));
}

void beginEntry(std::string& out, bool& first, const char* protocol, int family, const std::string& local, unsigned localPort) {
  if (!first) out.push_back(',');
  first = false;
  out += "{\"protocol\":\"";
  out += protocol;
  out += "\",\"family\":" + std::to_string(family) + ",\"localAddress\":";
  appendJsonString(out, local);
  out += ",\"localPort\":" + std::to_string(localPort);
}

// Fetches a table into `buffer`, retrying while the size races upward.
template <typename Fetch>
DWORD fetchTable(std::vector<unsigned char>& buffer, Fetch fetch) {
  DWORD size = 64 * 1024;
  for (int attempt = 0; attempt < 8; attempt++) {
    buffer.assign(size, 0);
    DWORD needed = size;
    DWORD rc = fetch(buffer.data(), &needed);
    if (rc != ERROR_INSUFFICIENT_BUFFER) return rc;
    size = needed + 16 * 1024;
  }
  return ERROR_INSUFFICIENT_BUFFER;
}

}  // namespace

bool handleNetTcp(std::string& result, Failure& err) {
  std::string out = "{\"entries\":[";
  bool first = true;
  std::vector<unsigned char> buffer;

  DWORD rc = fetchTable(buffer, [](unsigned char* data, DWORD* size) {
    return GetExtendedTcpTable(data, size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0);
  });
  if (rc != NO_ERROR) { err = win32Failure(rc); return false; }
  {
    const MIB_TCPTABLE_OWNER_PID* table = (const MIB_TCPTABLE_OWNER_PID*)buffer.data();
    for (DWORD i = 0; i < table->dwNumEntries; i++) {
      const MIB_TCPROW_OWNER_PID& row = table->table[i];
      beginEntry(out, first, "tcp", 4, addr4(row.dwLocalAddr), portOf(row.dwLocalPort));
      out += ",\"remoteAddress\":";
      appendJsonString(out, addr4(row.dwRemoteAddr));
      out += ",\"remotePort\":" + std::to_string(portOf(row.dwRemotePort));
      out += std::string(",\"state\":\"") + tcpStateName(row.dwState) + "\",\"pid\":" + std::to_string(row.dwOwningPid) + "}";
    }
  }

  rc = fetchTable(buffer, [](unsigned char* data, DWORD* size) {
    return GetExtendedTcpTable(data, size, FALSE, AF_INET6, TCP_TABLE_OWNER_PID_ALL, 0);
  });
  if (rc != NO_ERROR) { err = win32Failure(rc); return false; }
  {
    const MIB_TCP6TABLE_OWNER_PID* table = (const MIB_TCP6TABLE_OWNER_PID*)buffer.data();
    for (DWORD i = 0; i < table->dwNumEntries; i++) {
      const MIB_TCP6ROW_OWNER_PID& row = table->table[i];
      beginEntry(out, first, "tcp", 6, addr6(row.ucLocalAddr), portOf(row.dwLocalPort));
      out += ",\"remoteAddress\":";
      appendJsonString(out, addr6(row.ucRemoteAddr));
      out += ",\"remotePort\":" + std::to_string(portOf(row.dwRemotePort));
      out += std::string(",\"state\":\"") + tcpStateName(row.dwState) + "\",\"pid\":" + std::to_string(row.dwOwningPid) + "}";
    }
  }

  out += "]}";
  result = std::move(out);
  return true;
}

bool handleNetUdp(std::string& result, Failure& err) {
  std::string out = "{\"entries\":[";
  bool first = true;
  std::vector<unsigned char> buffer;

  DWORD rc = fetchTable(buffer, [](unsigned char* data, DWORD* size) {
    return GetExtendedUdpTable(data, size, FALSE, AF_INET, UDP_TABLE_OWNER_PID, 0);
  });
  if (rc != NO_ERROR) { err = win32Failure(rc); return false; }
  {
    const MIB_UDPTABLE_OWNER_PID* table = (const MIB_UDPTABLE_OWNER_PID*)buffer.data();
    for (DWORD i = 0; i < table->dwNumEntries; i++) {
      const MIB_UDPROW_OWNER_PID& row = table->table[i];
      beginEntry(out, first, "udp", 4, addr4(row.dwLocalAddr), portOf(row.dwLocalPort));
      out += ",\"pid\":" + std::to_string(row.dwOwningPid) + "}";
    }
  }

  rc = fetchTable(buffer, [](unsigned char* data, DWORD* size) {
    return GetExtendedUdpTable(data, size, FALSE, AF_INET6, UDP_TABLE_OWNER_PID, 0);
  });
  if (rc != NO_ERROR) { err = win32Failure(rc); return false; }
  {
    const MIB_UDP6TABLE_OWNER_PID* table = (const MIB_UDP6TABLE_OWNER_PID*)buffer.data();
    for (DWORD i = 0; i < table->dwNumEntries; i++) {
      const MIB_UDP6ROW_OWNER_PID& row = table->table[i];
      beginEntry(out, first, "udp", 6, addr6(row.ucLocalAddr), portOf(row.dwLocalPort));
      out += ",\"pid\":" + std::to_string(row.dwOwningPid) + "}";
    }
  }

  out += "]}";
  result = std::move(out);
  return true;
}

}  // namespace sys
