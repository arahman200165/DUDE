// DUDE Windows system helper: minimal JSON reader (DUDE_PRD.md §21 Phase 31, Milestone 593).
//
// Just enough to parse one request object per line: objects, arrays, strings (all escapes incl.
// \uXXXX and surrogate pairs), numbers, true/false/null. No third-party libraries.
#pragma once
#include <string>
#include <utility>
#include <vector>

namespace sys {

struct JsonValue {
  enum Kind { Null, Bool, Number, String, Array, Object } kind = Null;
  bool boolean = false;
  double number = 0;
  std::string string;
  std::vector<JsonValue> items;
  std::vector<std::pair<std::string, JsonValue>> members;

  const JsonValue* find(const char* key) const;
};

// Returns false on any syntax error or trailing garbage.
bool parseJson(const std::string& text, JsonValue& out);

}  // namespace sys
