// DUDE Windows system helper: evt.channels, evt.query, evt.queryFile (Milestone 603, DUDE_PRD.md §21 Phase 31).
//
// Strictly read-only access to the Windows Event Log API (wevtapi). Channels are enumerated with their config
// (type / enabled); queries render the System properties through a compiled render context, the message via the
// provider's publisher metadata (EvtFormatMessage) and the raw event XML. A single event that will not render
// never fails the whole query: whatever could be read is reported and the rest left empty / null.
#include "common.hpp"

#include <winevt.h>
#include <sddl.h>

#include <algorithm>
#include <climits>
#include <map>

namespace sys {

namespace {

constexpr size_t kMaxChannels = 5000;
constexpr size_t kMaxLimit = 1000;
constexpr size_t kDefaultLimit = 200;
constexpr size_t kMaxOutputBytes = 32u * 1024u * 1024u;
constexpr DWORD kBatch = 32;
constexpr size_t kMaxProviderCache = 256;

struct EvtHandle {
  EVT_HANDLE h = nullptr;
  EvtHandle() = default;
  explicit EvtHandle(EVT_HANDLE handle) : h(handle) {}
  EvtHandle(const EvtHandle&) = delete;
  EvtHandle& operator=(const EvtHandle&) = delete;
  ~EvtHandle() { if (h) EvtClose(h); }
};

Failure evtFailure(DWORD code) {
  Failure f = win32Failure(code);
  // Query syntax problems carry a more useful extended status message.
  if (code == ERROR_EVT_INVALID_QUERY || code == ERROR_EVT_QUERY_RESULT_STALE) {
    DWORD used = 0;
    EvtGetExtendedStatus(0, nullptr, &used);
    if (used > 1) {
      std::wstring buf(used, L'\0');
      DWORD used2 = 0;
      if (EvtGetExtendedStatus(used, &buf[0], &used2) == ERROR_SUCCESS && buf[0]) {
        f.message = narrow(buf.c_str(), wcslen(buf.c_str()));
      }
    }
  }
  return f;
}

// ---- evt.channels -----------------------------------------------------------------------------

bool isClassic(const std::wstring& name) {
  return _wcsicmp(name.c_str(), L"Application") == 0 || _wcsicmp(name.c_str(), L"System") == 0 ||
         _wcsicmp(name.c_str(), L"Security") == 0 || _wcsicmp(name.c_str(), L"Setup") == 0;
}

struct ChannelInfo {
  std::string name;
  const char* type;
  bool enabled;
};

}  // namespace

bool handleEvtChannels(std::string& result, Failure& err) {
  EvtHandle en(EvtOpenChannelEnum(nullptr, 0));
  if (!en.h) { err = evtFailure(GetLastError()); return false; }
  std::vector<ChannelInfo> channels;
  std::vector<wchar_t> path(256);
  while (channels.size() < kMaxChannels) {
    DWORD used = 0;
    if (!EvtNextChannelPath(en.h, (DWORD)path.size(), path.data(), &used)) {
      DWORD e = GetLastError();
      if (e == ERROR_INSUFFICIENT_BUFFER) { path.resize(used + 1); continue; }
      if (e == ERROR_NO_MORE_ITEMS) break;
      err = evtFailure(e);
      return false;
    }
    std::wstring name(path.data());
    EvtHandle cfg(EvtOpenChannelConfig(nullptr, name.c_str(), 0));
    if (!cfg.h) continue;  // access denied / vanished: skip
    ChannelInfo info;
    info.name = narrow(name);
    info.type = "operational";
    info.enabled = false;
    std::vector<BYTE> buf(sizeof(EVT_VARIANT) + 512);
    DWORD need = 0;
    if (EvtGetChannelConfigProperty(cfg.h, EvtChannelConfigType, 0, (DWORD)buf.size(), (PEVT_VARIANT)buf.data(), &need)) {
      DWORD t = ((PEVT_VARIANT)buf.data())->UInt32Val;
      info.type = t == 0 ? "admin" : t == 1 ? "operational" : t == 2 ? "analytic" : "debug";
    }
    if (isClassic(name)) info.type = "classic";
    need = 0;
    if (EvtGetChannelConfigProperty(cfg.h, EvtChannelConfigEnabled, 0, (DWORD)buf.size(), (PEVT_VARIANT)buf.data(), &need)) {
      info.enabled = ((PEVT_VARIANT)buf.data())->BooleanVal != FALSE;
    }
    channels.push_back(std::move(info));
  }
  std::sort(channels.begin(), channels.end(), [](const ChannelInfo& a, const ChannelInfo& b) {
    std::string la = a.name, lb = b.name;
    for (auto& c : la) c = (char)tolower((unsigned char)c);
    for (auto& c : lb) c = (char)tolower((unsigned char)c);
    return la < lb;
  });
  result = "{\"channels\":[";
  bool first = true;
  for (const auto& c : channels) {
    if (!first) result += ",";
    first = false;
    result += "{\"name\":";
    appendJsonString(result, c.name);
    result += ",\"type\":\"";
    result += c.type;
    result += "\",\"enabled\":";
    result += c.enabled ? "true" : "false";
    result += "}";
  }
  result += "]}";
  return true;
}

namespace {

// ---- event rendering --------------------------------------------------------------------------

std::string isoTime(ULONGLONG fileTime) {
  FILETIME ft;
  ft.dwLowDateTime = (DWORD)(fileTime & 0xFFFFFFFFu);
  ft.dwHighDateTime = (DWORD)(fileTime >> 32);
  SYSTEMTIME st;
  if (!FileTimeToSystemTime(&ft, &st)) return std::string();
  char buf[40];
  std::snprintf(buf, sizeof buf, "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", st.wYear, st.wMonth, st.wDay, st.wHour,
                st.wMinute, st.wSecond, st.wMilliseconds);
  return buf;
}

bool guidString(const GUID* g, std::string& out) {
  static const GUID zero = {};
  if (!g || memcmp(g, &zero, sizeof zero) == 0) return false;
  char buf[48];
  std::snprintf(buf, sizeof buf, "{%08lX-%04X-%04X-%02X%02X-%02X%02X%02X%02X%02X%02X}", g->Data1, g->Data2, g->Data3,
                g->Data4[0], g->Data4[1], g->Data4[2], g->Data4[3], g->Data4[4], g->Data4[5], g->Data4[6],
                g->Data4[7]);
  out = buf;
  return true;
}

const char* levelName(int level) {
  switch (level) {
    case 1: return "critical";
    case 2: return "error";
    case 3: return "warning";
    case 4: return "information";
    case 5: return "verbose";
    default: return "unknown";
  }
}

struct Renderer {
  std::map<std::wstring, EVT_HANDLE> publishers;  // null handle = no metadata available
  std::vector<BYTE> valueBuf;
  std::vector<wchar_t> textBuf;
  EVT_HANDLE ctx = nullptr;

  Renderer() = default;
  Renderer(const Renderer&) = delete;
  Renderer& operator=(const Renderer&) = delete;
  ~Renderer() {
    for (auto& p : publishers) if (p.second) EvtClose(p.second);
    if (ctx) EvtClose(ctx);
  }

  EVT_HANDLE publisher(const std::wstring& name) {
    auto it = publishers.find(name);
    if (it != publishers.end()) return it->second;
    EVT_HANDLE h = name.empty() ? nullptr : EvtOpenPublisherMetadata(nullptr, name.c_str(), nullptr, 0, 0);
    if (publishers.size() >= kMaxProviderCache) {
      for (auto& p : publishers) if (p.second) EvtClose(p.second);
      publishers.clear();
    }
    publishers[name] = h;
    return h;
  }

  // Formats a message (event / task / opcode); '' on any failure.
  std::wstring format(EVT_HANDLE meta, EVT_HANDLE event, DWORD flags) {
    if (!meta) return std::wstring();
    DWORD used = 0;
    if (textBuf.size() < 1024) textBuf.resize(1024);
    for (int attempt = 0; attempt < 2; attempt++) {
      if (EvtFormatMessage(meta, event, 0, 0, nullptr, flags, (DWORD)textBuf.size(), textBuf.data(), &used)) {
        return std::wstring(textBuf.data());
      }
      DWORD e = GetLastError();
      if (e == ERROR_INSUFFICIENT_BUFFER && used > textBuf.size() && used < 16u * 1024u * 1024u) {
        textBuf.resize(used);
        continue;
      }
      // An unresolved insert still leaves the partially formatted text in the buffer.
      if (e == ERROR_EVT_UNRESOLVED_VALUE_INSERT || e == ERROR_EVT_UNRESOLVED_PARAMETER_INSERT) {
        textBuf[textBuf.size() - 1] = L'\0';
        return std::wstring(textBuf.data());
      }
      break;
    }
    return std::wstring();
  }

  std::wstring renderXml(EVT_HANDLE event) {
    DWORD used = 0, count = 0;
    if (textBuf.size() < 4096) textBuf.resize(4096);
    for (int attempt = 0; attempt < 2; attempt++) {
      if (EvtRender(nullptr, event, EvtRenderEventXml, (DWORD)(textBuf.size() * sizeof(wchar_t)), textBuf.data(), &used, &count)) {
        return std::wstring(textBuf.data());
      }
      if (GetLastError() == ERROR_INSUFFICIENT_BUFFER && used > textBuf.size() * sizeof(wchar_t) &&
          used < 32u * 1024u * 1024u) {
        textBuf.resize(used / sizeof(wchar_t) + 1);
        continue;
      }
      break;
    }
    return std::wstring();
  }

  bool systemValues(EVT_HANDLE event, PEVT_VARIANT& vars) {
    if (!ctx) {
      ctx = EvtCreateRenderContext(0, nullptr, EvtRenderContextSystem);
      if (!ctx) return false;
    }
    DWORD used = 0, count = 0;
    if (valueBuf.size() < 2048) valueBuf.resize(2048);
    for (int attempt = 0; attempt < 2; attempt++) {
      if (EvtRender(ctx, event, EvtRenderEventValues, (DWORD)valueBuf.size(), valueBuf.data(), &used, &count)) {
        vars = (PEVT_VARIANT)valueBuf.data();
        return count >= (DWORD)EvtSystemVersion;
      }
      if (GetLastError() == ERROR_INSUFFICIENT_BUFFER && used > valueBuf.size()) { valueBuf.resize(used); continue; }
      break;
    }
    return false;
  }
};

bool isNull(const EVT_VARIANT& v) { return (v.Type & EVT_VARIANT_TYPE_MASK) == EvtVarTypeNull; }

std::wstring varWString(const EVT_VARIANT& v) {
  if ((v.Type & EVT_VARIANT_TYPE_MASK) == EvtVarTypeString && v.StringVal) return std::wstring(v.StringVal);
  return std::wstring();
}

std::string varString(const EVT_VARIANT& v) { return narrow(varWString(v)); }

unsigned long long varUInt(const EVT_VARIANT& v) {
  switch (v.Type & EVT_VARIANT_TYPE_MASK) {
    case EvtVarTypeByte: return v.ByteVal;
    case EvtVarTypeUInt16: return v.UInt16Val;
    case EvtVarTypeUInt32: return v.UInt32Val;
    case EvtVarTypeUInt64: return v.UInt64Val;
    case EvtVarTypeSByte: return (unsigned long long)(unsigned char)v.SByteVal;
    case EvtVarTypeInt16: return (unsigned long long)(unsigned short)v.Int16Val;
    case EvtVarTypeInt32: return (unsigned long long)(unsigned int)v.Int32Val;
    case EvtVarTypeInt64: return (unsigned long long)v.Int64Val;
    case EvtVarTypeHexInt32: return v.UInt32Val;
    case EvtVarTypeHexInt64: return v.UInt64Val;
    default: return 0;
  }
}

void appendGuidOrNull(std::string& out, const EVT_VARIANT& v) {
  std::string g;
  if (!isNull(v) && (v.Type & EVT_VARIANT_TYPE_MASK) == EvtVarTypeGuid && guidString(v.GuidVal, g)) appendJsonString(out, g);
  else out += "null";
}

void appendUIntOrNull(std::string& out, const EVT_VARIANT& v) {
  if (isNull(v)) out += "null";
  else out += std::to_string(varUInt(v));
}

void renderEvent(Renderer& r, EVT_HANDLE event, PEVT_VARIANT vars, std::string& out) {
  out += "{\"recordId\":\"" + std::to_string(varUInt(vars[EvtSystemEventRecordId])) + "\"";
  out += ",\"timeCreated\":";
  appendJsonString(out, (vars[EvtSystemTimeCreated].Type & EVT_VARIANT_TYPE_MASK) == EvtVarTypeFileTime
                            ? isoTime(vars[EvtSystemTimeCreated].FileTimeVal) : std::string());
  out += ",\"level\":\"";
  out += isNull(vars[EvtSystemLevel]) ? "unknown" : levelName((int)varUInt(vars[EvtSystemLevel]));
  out += "\",\"providerName\":";
  std::wstring provider = varWString(vars[EvtSystemProviderName]);
  appendJsonString(out, narrow(provider));
  out += ",\"eventId\":" + std::to_string(varUInt(vars[EvtSystemEventID]));

  EVT_HANDLE meta = r.publisher(provider);
  std::wstring task = r.format(meta, event, EvtFormatMessageTask);
  std::wstring opcode = r.format(meta, event, EvtFormatMessageOpcode);
  if (task.empty()) task = std::to_wstring(varUInt(vars[EvtSystemTask]));
  if (opcode.empty()) opcode = std::to_wstring(varUInt(vars[EvtSystemOpcode]));
  out += ",\"task\":";
  appendJsonString(out, narrow(task));
  out += ",\"opcode\":";
  appendJsonString(out, narrow(opcode));

  out += ",\"keywords\":[";
  unsigned long long kw = isNull(vars[EvtSystemKeywords]) ? 0 : varUInt(vars[EvtSystemKeywords]);
  if (kw) {
    char buf[32];
    std::snprintf(buf, sizeof buf, "\"0x%016llX\"", kw);
    out += buf;
  }
  out += "],\"channel\":";
  appendJsonString(out, varString(vars[EvtSystemChannel]));
  out += ",\"computer\":";
  appendJsonString(out, varString(vars[EvtSystemComputer]));
  out += ",\"userSid\":";
  const EVT_VARIANT& sid = vars[EvtSystemUserID];
  LPWSTR sidText = nullptr;
  if (!isNull(sid) && (sid.Type & EVT_VARIANT_TYPE_MASK) == EvtVarTypeSid && sid.SidVal &&
      ConvertSidToStringSidW(sid.SidVal, &sidText) && sidText) {
    appendJsonString(out, narrow(sidText, wcslen(sidText)));
    LocalFree(sidText);
  } else {
    out += "null";
  }
  out += ",\"processId\":";
  appendUIntOrNull(out, vars[EvtSystemProcessID]);
  out += ",\"threadId\":";
  appendUIntOrNull(out, vars[EvtSystemThreadID]);
  out += ",\"activityId\":";
  appendGuidOrNull(out, vars[EvtSystemActivityID]);
  out += ",\"relatedActivityId\":";
  appendGuidOrNull(out, vars[EvtSystemRelatedActivityID]);
  out += ",\"message\":";
  appendJsonString(out, narrow(r.format(meta, event, EvtFormatMessageEvent)));
  out += ",\"xml\":";
  appendJsonString(out, narrow(r.renderXml(event)));
  out += "}";
}

bool strParam(const JsonValue* params, const char* key, std::string& out) {
  const JsonValue* v = params->find(key);
  if (!v || v->kind != JsonValue::String) return false;
  out = v->string;
  return true;
}

bool runQuery(const JsonValue* p, bool file, std::string& result, Failure& err) {
  if (!p || p->kind != JsonValue::Object) { err = plainFailure("Parameters are required."); return false; }
  std::string target;
  const size_t maxTarget = file ? 32767u : 512u;
  if (!strParam(p, file ? "path" : "channel", target) || target.empty() || target.size() > maxTarget) {
    err = plainFailure(file ? "A .evtx file path is required." : "A channel name is required.");
    return false;
  }
  for (unsigned char c : target) if (c < 0x20 || c == 0x7f) { err = plainFailure("Target contains control characters."); return false; }
  std::string xpath = "*";
  if (const JsonValue* x = p->find("xpath")) {
    if (x->kind != JsonValue::String || x->string.size() > 8192) { err = plainFailure("XPath must be a string of at most 8192 characters."); return false; }
    for (unsigned char c : x->string) if (c < 0x20 || c == 0x7f) { err = plainFailure("XPath contains control characters."); return false; }
    if (!x->string.empty()) xpath = x->string;
  }
  bool reverse = true;
  if (const JsonValue* rv = p->find("reverse")) {
    if (rv->kind == JsonValue::Bool) reverse = rv->boolean;
  }
  size_t limit = kDefaultLimit;
  if (const JsonValue* l = p->find("limit")) {
    if (l->kind != JsonValue::Number || l->number < 1 || l->number > (double)kMaxLimit || l->number != (double)(size_t)l->number) { err = plainFailure("limit must be an integer from 1 to 1000."); return false; }
    limit = (size_t)l->number;
  }
  unsigned long long after = 0;
  bool hasAfter = false;
  if (!file) {
    std::string a;
    if (strParam(p, "afterRecordId", a) && !a.empty()) {
      for (char c : a) {
        if (c < '0' || c > '9') { err = plainFailure("afterRecordId must be a decimal number."); return false; }
      }
      unsigned long long parsed = 0;
      for (char c : a) {
        unsigned digit = (unsigned)(c - '0');
        if (parsed > (ULLONG_MAX - digit) / 10) { err = plainFailure("afterRecordId exceeds the unsigned 64-bit range."); return false; }
        parsed = parsed * 10 + digit;
      }
      after = parsed;
      hasAfter = true;
    }
  }

  std::wstring wtarget = widen(target);
  DWORD flags = (file ? EvtQueryFilePath : EvtQueryChannelPath) | (reverse ? EvtQueryReverseDirection : EvtQueryForwardDirection);
  if (file) {
    if (wtarget.size() < 8 || !(wtarget[1] == L':' && (wtarget[2] == L'\\' || wtarget[2] == L'/')) ||
        _wcsicmp(wtarget.c_str() + wtarget.size() - 5, L".evtx") != 0) {
      err = plainFailure("An absolute .evtx file path is required.");
      return false;
    }
    DWORD attrs = GetFileAttributesW(wtarget.c_str());
    if (attrs == INVALID_FILE_ATTRIBUTES) { err = win32Failure(GetLastError()); return false; }
    if (attrs & FILE_ATTRIBUTE_DIRECTORY) { err = plainFailure("The path is a directory."); return false; }
  }

  EvtHandle q(EvtQuery(nullptr, wtarget.c_str(), widen(xpath).c_str(), flags));
  if (!q.h) { err = evtFailure(GetLastError()); return false; }

  Renderer r;
  std::string events;
  size_t count = 0;
  bool truncated = false;
  bool done = false;
  while (!done) {
    EVT_HANDLE handles[kBatch] = {};
    DWORD returned = 0;
    if (!EvtNext(q.h, kBatch, handles, 5000, 0, &returned)) {
      DWORD e = GetLastError();
      if (e == ERROR_NO_MORE_ITEMS || e == ERROR_TIMEOUT) break;
      if (count == 0) { err = evtFailure(e); return false; }
      break;  // keep what was already read
    }
    for (DWORD i = 0; i < returned; i++) {
      EVT_HANDLE ev = handles[i];
      if (!done) {
        PEVT_VARIANT vars = nullptr;
        bool haveVars = r.systemValues(ev, vars);
        unsigned long long id = haveVars ? varUInt(vars[EvtSystemEventRecordId]) : 0;
        bool skip = false;
        if (hasAfter && haveVars && id <= after) {
          skip = true;
          if (reverse) done = true;  // record ids only decrease from here
        }
        if (!skip && !done) {
          if (count >= limit || events.size() > kMaxOutputBytes) {
            truncated = true;
            done = true;
          } else {
            if (count) events += ",";
            if (haveVars) {
              renderEvent(r, ev, vars, events);
            } else {
              std::wstring xml = r.renderXml(ev);
              events += "{\"recordId\":\"0\",\"timeCreated\":\"\",\"level\":\"unknown\",\"providerName\":\"\",\"eventId\":0,"
                        "\"task\":\"\",\"opcode\":\"\",\"keywords\":[],\"channel\":\"\",\"computer\":\"\",\"userSid\":null,"
                        "\"processId\":null,\"threadId\":null,\"activityId\":null,\"relatedActivityId\":null,\"message\":\"\",\"xml\":";
              appendJsonString(events, narrow(xml));
              events += "}";
            }
            count++;
          }
        }
      }
      EvtClose(ev);
    }
  }
  result = "{\"events\":[" + events + "],\"truncated\":" + (truncated ? "true" : "false") + "}";
  return true;
}

}  // namespace

bool handleEvtQuery(const JsonValue* params, std::string& result, Failure& err) { return runQuery(params, false, result, err); }
bool handleEvtQueryFile(const JsonValue* params, std::string& result, Failure& err) { return runQuery(params, true, result, err); }

}  // namespace sys
