// DUDE Windows system helper: JSON-lines RPC loop (DUDE_PRD.md §21 Phase 31, Milestone 593).
//
// Long-lived process started by the Electron main process. One request per stdin line:
//   {"id":1,"method":"process.list","params":{...}}
// One response line per request on stdout, flushed immediately:
//   {"id":1,"ok":true,"result":...}  or  {"id":1,"ok":false,"error":"...","code":5}
// Exits cleanly on stdin EOF. Read-only in Milestone 593: nothing here mutates the system.
#include <fcntl.h>
#include <io.h>

#include <cmath>
#include <iostream>

#include "common.hpp"

namespace {

void writeLine(const std::string& line) {
  std::fwrite(line.data(), 1, line.size(), stdout);
  std::fputc('\n', stdout);
  std::fflush(stdout);
}

std::string formatId(double id) {
  char buf[40];
  if (std::floor(id) == id && std::fabs(id) < 9007199254740992.0) std::snprintf(buf, sizeof buf, "%.0f", id);
  else std::snprintf(buf, sizeof buf, "%.17g", id);
  return buf;
}

std::string failureLine(const std::string& id, const sys::Failure& f) {
  std::string out = "{\"id\":" + id + ",\"ok\":false,\"error\":";
  sys::appendJsonString(out, f.message);
  if (f.hasCode) out += ",\"code\":" + std::to_string(f.code);
  out += "}";
  return out;
}

std::string handleLine(const std::string& line) {
  sys::JsonValue request;
  const sys::JsonValue* idValue = nullptr;
  const sys::JsonValue* methodValue = nullptr;
  if (!sys::parseJson(line, request) || request.kind != sys::JsonValue::Object ||
      !(idValue = request.find("id")) || idValue->kind != sys::JsonValue::Number ||
      !(methodValue = request.find("method")) || methodValue->kind != sys::JsonValue::String) {
    return "{\"id\":null,\"ok\":false,\"error\":\"Malformed request.\"}";
  }
  std::string id = formatId(idValue->number);
  const std::string& method = methodValue->string;
  const sys::JsonValue* params = request.find("params");

  std::string result;
  sys::Failure err;
  bool ok = false;
  if (method == "helper.info") ok = sys::handleHelperInfo(result, err);
  else if (method == "process.list") ok = sys::handleProcessList(result, err);
  else if (method == "net.tcp") ok = sys::handleNetTcp(result, err);
  else if (method == "net.udp") ok = sys::handleNetUdp(result, err);
  else if (method == "reg.enumKey") ok = sys::handleRegEnumKey(params, result, err);
  else if (method == "reg.getValues") ok = sys::handleRegGetValues(params, result, err);
  else return failureLine(id, sys::plainFailure("Unknown method."));

  if (!ok) return failureLine(id, err);
  return "{\"id\":" + id + ",\"ok\":true,\"result\":" + result + "}";
}

}  // namespace

int main() {
  _setmode(_fileno(stdout), _O_BINARY);
  _setmode(_fileno(stdin), _O_BINARY);
  std::ios::sync_with_stdio(false);
  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty()) continue;
    std::string response;
    try {
      response = handleLine(line);
    } catch (...) {
      response = "{\"id\":null,\"ok\":false,\"error\":\"Internal error.\"}";
    }
    writeLine(response);
  }
  return 0;
}
