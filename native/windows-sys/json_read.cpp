// DUDE Windows system helper: minimal JSON reader (DUDE_PRD.md §21 Phase 31, Milestone 593).
//
// Recursive-descent parser with a depth cap; see json_read.hpp.
#include "json_read.hpp"

#include <cstdlib>
#include <cstring>

namespace sys {

const JsonValue* JsonValue::find(const char* key) const {
  if (kind != Object) return nullptr;
  for (const auto& m : members) {
    if (m.first == key) return &m.second;
  }
  return nullptr;
}

namespace {

class Parser {
 public:
  explicit Parser(const std::string& t) : text(t) {}

  bool parseDocument(JsonValue& out) {
    skipWs();
    if (!parseValue(out, 0)) return false;
    skipWs();
    return pos == text.size();
  }

 private:
  const std::string& text;
  size_t pos = 0;

  void skipWs() {
    while (pos < text.size() && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\r' || text[pos] == '\n')) pos++;
  }

  bool literal(const char* word) {
    size_t n = std::strlen(word);
    if (text.compare(pos, n, word) != 0) return false;
    pos += n;
    return true;
  }

  bool parseValue(JsonValue& out, int depth) {
    if (depth > 64 || pos >= text.size()) return false;
    char c = text[pos];
    if (c == '{') return parseObject(out, depth);
    if (c == '[') return parseArray(out, depth);
    if (c == '"') { out.kind = JsonValue::String; return parseString(out.string); }
    if (c == 't') { out.kind = JsonValue::Bool; out.boolean = true; return literal("true"); }
    if (c == 'f') { out.kind = JsonValue::Bool; out.boolean = false; return literal("false"); }
    if (c == 'n') { out.kind = JsonValue::Null; return literal("null"); }
    return parseNumber(out);
  }

  bool parseNumber(JsonValue& out) {
    size_t start = pos;
    if (pos < text.size() && text[pos] == '-') pos++;
    size_t digits = 0;
    while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') { pos++; digits++; }
    if (digits == 0) return false;
    if (pos < text.size() && text[pos] == '.') {
      pos++;
      size_t frac = 0;
      while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') { pos++; frac++; }
      if (frac == 0) return false;
    }
    if (pos < text.size() && (text[pos] == 'e' || text[pos] == 'E')) {
      pos++;
      if (pos < text.size() && (text[pos] == '+' || text[pos] == '-')) pos++;
      size_t exp = 0;
      while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') { pos++; exp++; }
      if (exp == 0) return false;
    }
    out.kind = JsonValue::Number;
    out.number = std::strtod(text.substr(start, pos - start).c_str(), nullptr);
    return true;
  }

  bool hex4(unsigned& value) {
    if (pos + 4 > text.size()) return false;
    value = 0;
    for (int i = 0; i < 4; i++) {
      char c = text[pos++];
      value <<= 4;
      if (c >= '0' && c <= '9') value |= (unsigned)(c - '0');
      else if (c >= 'a' && c <= 'f') value |= (unsigned)(c - 'a' + 10);
      else if (c >= 'A' && c <= 'F') value |= (unsigned)(c - 'A' + 10);
      else return false;
    }
    return true;
  }

  static void appendUtf8(std::string& out, unsigned cp) {
    if (cp < 0x80) out.push_back((char)cp);
    else if (cp < 0x800) { out.push_back((char)(0xC0 | (cp >> 6))); out.push_back((char)(0x80 | (cp & 0x3F))); }
    else if (cp < 0x10000) {
      out.push_back((char)(0xE0 | (cp >> 12)));
      out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back((char)(0x80 | (cp & 0x3F)));
    } else {
      out.push_back((char)(0xF0 | (cp >> 18)));
      out.push_back((char)(0x80 | ((cp >> 12) & 0x3F)));
      out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back((char)(0x80 | (cp & 0x3F)));
    }
  }

  bool parseString(std::string& out) {
    if (pos >= text.size() || text[pos] != '"') return false;
    pos++;
    out.clear();
    while (pos < text.size()) {
      unsigned char c = (unsigned char)text[pos++];
      if (c == '"') return true;
      if (c < 0x20) return false;
      if (c != '\\') { out.push_back((char)c); continue; }
      if (pos >= text.size()) return false;
      char e = text[pos++];
      switch (e) {
        case '"': out.push_back('"'); break;
        case '\\': out.push_back('\\'); break;
        case '/': out.push_back('/'); break;
        case 'b': out.push_back('\b'); break;
        case 'f': out.push_back('\f'); break;
        case 'n': out.push_back('\n'); break;
        case 'r': out.push_back('\r'); break;
        case 't': out.push_back('\t'); break;
        case 'u': {
          unsigned cp = 0;
          if (!hex4(cp)) return false;
          if (cp >= 0xD800 && cp <= 0xDBFF) {
            unsigned low = 0;
            if (pos + 2 > text.size() || text[pos] != '\\' || text[pos + 1] != 'u') return false;
            pos += 2;
            if (!hex4(low) || low < 0xDC00 || low > 0xDFFF) return false;
            cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
          } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
            return false;
          }
          appendUtf8(out, cp);
          break;
        }
        default: return false;
      }
    }
    return false;
  }

  bool parseArray(JsonValue& out, int depth) {
    out.kind = JsonValue::Array;
    pos++;
    skipWs();
    if (pos < text.size() && text[pos] == ']') { pos++; return true; }
    for (;;) {
      JsonValue item;
      skipWs();
      if (!parseValue(item, depth + 1)) return false;
      out.items.push_back(std::move(item));
      skipWs();
      if (pos >= text.size()) return false;
      if (text[pos] == ',') { pos++; continue; }
      if (text[pos] == ']') { pos++; return true; }
      return false;
    }
  }

  bool parseObject(JsonValue& out, int depth) {
    out.kind = JsonValue::Object;
    pos++;
    skipWs();
    if (pos < text.size() && text[pos] == '}') { pos++; return true; }
    for (;;) {
      std::string key;
      skipWs();
      if (!parseString(key)) return false;
      skipWs();
      if (pos >= text.size() || text[pos] != ':') return false;
      pos++;
      skipWs();
      JsonValue value;
      if (!parseValue(value, depth + 1)) return false;
      out.members.emplace_back(std::move(key), std::move(value));
      skipWs();
      if (pos >= text.size()) return false;
      if (text[pos] == ',') { pos++; continue; }
      if (text[pos] == '}') { pos++; return true; }
      return false;
    }
  }
};

}  // namespace

bool parseJson(const std::string& text, JsonValue& out) {
  Parser parser(text);
  return parser.parseDocument(out);
}

}  // namespace sys
