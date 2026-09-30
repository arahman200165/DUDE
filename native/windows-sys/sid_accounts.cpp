// DUDE Windows system helper: SID and account inspection (Milestone 609).
// Read-only account/token/profile queries. Domain name lookups can contact a domain controller.
#include "common.hpp"
#include <algorithm>
#include <sddl.h>
#include <wincrypt.h>
#include <lm.h>
#include <vector>

namespace sys { namespace {
std::string sidText(PSID sid) {
  LPWSTR value = nullptr;
  if (!ConvertSidToStringSidW(sid, &value)) return {};
  std::string out = narrow(value, wcslen(value)); LocalFree(value); return out;
}
std::string base64(const BYTE* data, DWORD size) {
  DWORD n = 0; CryptBinaryToStringA(data, size, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &n);
  std::string out(n, '\0'); if (n) { CryptBinaryToStringA(data, size, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, out.data(), &n); if (!out.empty() && out.back() == '\0') out.pop_back(); } return out;
}
std::string hex(const BYTE* data, DWORD size) {
  static const char* d="0123456789abcdef"; std::string out; out.reserve(size*2);
  for (DWORD i=0;i<size;i++){out.push_back(d[data[i]>>4]);out.push_back(d[data[i]&15]);} return out;
}
bool sidObject(PSID sid, std::string& out) {
  if (!IsValidSid(sid)) return false;
  auto* id=static_cast<SID*>(sid); BYTE* bytes=static_cast<BYTE*>(sid); DWORD size=GetLengthSid(sid);
  std::string text=sidText(sid); if(text.empty()) return false;
  out="{\"sid\":"; appendJsonString(out,text);
  out+=",\"revision\":"+std::to_string(id->Revision)+",\"identifierAuthority\":";
  unsigned long long auth=0; for(int i=0;i<6;i++) auth=(auth<<8)|id->IdentifierAuthority.Value[i]; out+=std::to_string(auth);
  out+=",\"subAuthorities\":["; for(DWORD i=0;i<*GetSidSubAuthorityCount(sid);i++){if(i)out+=",";out+=std::to_string(*GetSidSubAuthority(sid,i));}
  out+="],\"binaryHex\":"; appendJsonString(out,hex(bytes,size)); out+=",\"base64\":"; appendJsonString(out,base64(bytes,size)); out+="}"; return true;
}
bool paramString(const JsonValue* p,const char* k,std::string& v){auto x=p&&p->kind==JsonValue::Object?p->find(k):nullptr;if(!x||x->kind!=JsonValue::String)return false;v=x->string;return true;}
bool resolveName(PSID sid,std::string& name,std::string& domain,DWORD& use){DWORD nc=0,dc=0; SID_NAME_USE u{}; LookupAccountSidW(nullptr,sid,nullptr,&nc,nullptr,&dc,&u); if(GetLastError()!=ERROR_INSUFFICIENT_BUFFER)return false; std::vector<wchar_t> n(nc),d(dc); if(!LookupAccountSidW(nullptr,sid,n.data(),&nc,d.data(),&dc,&u))return false;name=narrow(n.data(),wcslen(n.data()));domain=narrow(d.data(),wcslen(d.data()));use=(DWORD)u;return true;}
const char* useName(DWORD use){switch(use){case SidTypeUser:return "user";case SidTypeGroup:return "group";case SidTypeDomain:return "domain";case SidTypeAlias:return "alias";case SidTypeWellKnownGroup:return "well-known-group";case SidTypeComputer:return "computer";case SidTypeLabel:return "label";default:return "unknown";}}
std::string quote(const std::string& s){std::string o;appendJsonString(o,s);return o;}
void appendUser(std::string& out,const wchar_t* name,const wchar_t* comment,DWORD flags){std::string n=narrow(name,wcslen(name)),c=comment?narrow(comment,wcslen(comment)):"";out+="{\"name\":"+quote(n)+",\"comment\":"+quote(c)+",\"disabled\":"+((flags&UF_ACCOUNTDISABLE)?"true":"false")+",\"sid\":";DWORD sc=0,dc=0;SID_NAME_USE use{};LookupAccountNameW(nullptr,name,nullptr,&sc,nullptr,&dc,&use);std::vector<BYTE> sid(sc);std::vector<wchar_t> dom(dc);if(sc&&LookupAccountNameW(nullptr,name,sid.data(),&sc,dom.data(),&dc,&use))appendJsonString(out,sidText(sid.data()));else out+="null";out+="}";}
}

bool handleSidDecode(const JsonValue* p,std::string& out,Failure& err){
 std::string format,input;if(!paramString(p,"inputFormat",format)||!paramString(p,"input",input)){err=plainFailure("SID decode requires inputFormat and input strings.");return false;} PSID sid=nullptr; std::vector<BYTE> bytes;
 if(format=="sid"){std::wstring w=widen(input);if(!ConvertStringSidToSidW(w.c_str(),&sid)){err=win32Failure(GetLastError());return false;}}
 else if(format=="binary-base64"||format=="binary-hex") {if(format=="binary-base64"){DWORD n=0;if(!CryptStringToBinaryA(input.c_str(),0,CRYPT_STRING_BASE64,nullptr,&n,nullptr,nullptr)||n>SECURITY_MAX_SID_SIZE){err=plainFailure("SID binary data is invalid or too long.");return false;}bytes.resize(n);if(!CryptStringToBinaryA(input.c_str(),0,CRYPT_STRING_BASE64,bytes.data(),&n,nullptr,nullptr)){err=win32Failure(GetLastError());return false;}bytes.resize(n);}else{if(input.size()%2||input.size()>SECURITY_MAX_SID_SIZE*2){err=plainFailure("SID hex data must have an even length within the SID size limit.");return false;}for(size_t i=0;i<input.size();i+=2){unsigned int b;if(sscanf_s(input.substr(i,2).c_str(),"%2x",&b)!=1){err=plainFailure("SID hex data is invalid.");return false;}bytes.push_back((BYTE)b);}}
 if(bytes.size()<8||bytes.size()>SECURITY_MAX_SID_SIZE||bytes.size()!=8u+static_cast<size_t>(bytes[1])*4u||!IsValidSid(bytes.data())){err=plainFailure("Binary data is not a valid SID.");return false;}sid=bytes.data();
 } else {err=plainFailure("Unknown SID input format.");return false;}
 bool ok=sidObject(sid,out);if(format=="sid")LocalFree(sid);if(!ok){err=plainFailure("Invalid SID.");return false;}return true;
}
bool handleSidLookup(const JsonValue* p,std::string& out,Failure& err){std::string q,k;if(!paramString(p,"query",q)||!paramString(p,"lookupKind",k)||q.empty()||q.size()>512){err=plainFailure("SID lookup requires a query up to 512 characters.");return false;} if(k=="sid"){std::wstring w=widen(q);PSID sid=nullptr;if(!ConvertStringSidToSidW(w.c_str(),&sid)){err=win32Failure(GetLastError());return false;}std::string name,domain;DWORD use=0;bool found=resolveName(sid,name,domain,use);DWORD lookupError=GetLastError();std::string sidstr=sidText(sid);LocalFree(sid);if(!found){err=win32Failure(lookupError);return false;}out="{\"sid\":"+quote(sidstr)+",\"accountName\":"+quote(name)+",\"domain\":"+quote(domain)+",\"use\":"+quote(useName(use))+",\"dcLookupDisclosure\":\"SID-to-name lookup uses Windows account resolution and may contact a domain controller.\"}";return true;}
 if(k!="account"){err=plainFailure("lookupKind must be account or sid.");return false;}std::wstring w=widen(q);DWORD sc=0,dc=0;SID_NAME_USE use{};LookupAccountNameW(nullptr,w.c_str(),nullptr,&sc,nullptr,&dc,&use);DWORD e=GetLastError();if(e!=ERROR_INSUFFICIENT_BUFFER){err=win32Failure(e);return false;}std::vector<BYTE> sid(sc);std::vector<wchar_t> dom(dc);if(!LookupAccountNameW(nullptr,w.c_str(),sid.data(),&sc,dom.data(),&dc,&use)){err=win32Failure(GetLastError());return false;}std::string d=narrow(dom.data(),wcslen(dom.data()));out="{\"sid\":"+quote(sidText(sid.data()))+",\"accountName\":"+quote(q)+",\"domain\":"+quote(d)+",\"use\":"+quote(useName(use))+",\"dcLookupDisclosure\":\"Account-to-SID lookup uses Windows account resolution and may contact a domain controller.\"}";return true;
}
bool handleSidWellKnown(std::string& out,Failure&){struct E{WELL_KNOWN_SID_TYPE type;const char* label;};static E entries[]={{WinNullSid,"Null"},{WinWorldSid,"Everyone"},{WinLocalSid,"LOCAL"},{WinCreatorOwnerSid,"Creator Owner"},{WinNtAuthoritySid,"NT AUTHORITY"},{WinBuiltinAdministratorsSid,"BUILTIN\\Administrators"},{WinBuiltinUsersSid,"BUILTIN\\Users"},{WinBuiltinGuestsSid,"BUILTIN\\Guests"},{WinLocalSystemSid,"NT AUTHORITY\\SYSTEM"},{WinLocalServiceSid,"NT AUTHORITY\\LOCAL SERVICE"},{WinNetworkServiceSid,"NT AUTHORITY\\NETWORK SERVICE"},{WinAuthenticatedUserSid,"NT AUTHORITY\\Authenticated Users"},{WinAnonymousSid,"NT AUTHORITY\\ANONYMOUS LOGON"},{WinBuiltinRemoteDesktopUsersSid,"BUILTIN\\Remote Desktop Users"}};out="{\"entries\":[";bool first=true;for(auto&e:entries){BYTE b[SECURITY_MAX_SID_SIZE];DWORD n=sizeof b;if(!CreateWellKnownSid(e.type,nullptr,b,&n))continue;if(!first)out+=",";first=false;out+="{\"name\":"+quote(e.label)+",\"sid\":"+quote(sidText(b))+"}";}out+="]}";return true;}
bool handleAccountToken(std::string& out,Failure& err){HANDLE h=nullptr;if(!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&h)){err=win32Failure(GetLastError());return false;}auto query=[&](TOKEN_INFORMATION_CLASS c,std::vector<BYTE>& b)->bool{DWORD n=0;GetTokenInformation(h,c,nullptr,0,&n);if(!n)return false;b.resize(n);return GetTokenInformation(h,c,b.data(),n,&n)!=0;};std::vector<BYTE> user,groups,privs,integrity;if(!query(TokenUser,user)){err=win32Failure(GetLastError());CloseHandle(h);return false;}if(!query(TokenGroups,groups)||!query(TokenPrivileges,privs)||!query(TokenIntegrityLevel,integrity)){err=win32Failure(GetLastError());CloseHandle(h);return false;}auto* tu=(TOKEN_USER*)user.data();std::string name,domain;DWORD use=0;resolveName(tu->User.Sid,name,domain,use);out="{\"user\":{\"name\":"+quote(name)+",\"domain\":"+quote(domain)+",\"sid\":"+quote(sidText(tu->User.Sid))+"},\"groups\":[";auto* tg=(TOKEN_GROUPS*)groups.data();for(DWORD i=0;i<tg->GroupCount;i++){if(i)out+=",";std::string n,d;DWORD u=0;resolveName(tg->Groups[i].Sid,n,d,u);out+="{\"sid\":"+quote(sidText(tg->Groups[i].Sid))+",\"name\":"+quote(n)+",\"domain\":"+quote(d)+",\"attributes\":"+std::to_string(tg->Groups[i].Attributes)+"}";}out+="],\"privileges\":[";auto* tp=(TOKEN_PRIVILEGES*)privs.data();for(DWORD i=0;i<tp->PrivilegeCount;i++){if(i)out+=",";wchar_t n[256];DWORD c=256;std::string s;if(LookupPrivilegeNameW(nullptr,&tp->Privileges[i].Luid,n,&c))s=narrow(n,wcslen(n));out+="{\"name\":"+quote(s)+",\"enabled\":"+((tp->Privileges[i].Attributes&SE_PRIVILEGE_ENABLED)?"true":"false")+",\"attributes\":"+std::to_string(tp->Privileges[i].Attributes)+"}";}DWORD rid=0;if(!integrity.empty()){auto* ml=(TOKEN_MANDATORY_LABEL*)integrity.data();DWORD count=*GetSidSubAuthorityCount(ml->Label.Sid);if(count)rid=*GetSidSubAuthority(ml->Label.Sid,count-1);}const char* level=rid<0x1000?"untrusted":rid<0x2000?"low":rid<0x2100?"medium":rid<0x3000?"medium-plus":rid<0x4000?"high":"system";out+="],\"integrity\":{\"level\":"+quote(level)+",\"rid\":"+std::to_string(rid)+"}}";CloseHandle(h);return true;}
bool handleAccountLocalAccounts(std::string& out, Failure& err) {
  constexpr DWORD kMaxEntries = 5000;
  constexpr DWORD kMaxPages = 32;
  constexpr ULONGLONG kBudgetMs = 5000;
  const ULONGLONG started = GetTickCount64();
  DWORD resume = 0;
  DWORD pages = 0;
  DWORD count = 0;
  bool truncated = false;
  bool first = true;
  out = "{\"accounts\":[";
  for (;;) {
    if (pages >= kMaxPages || count >= kMaxEntries || GetTickCount64() - started >= kBudgetMs) {
      truncated = true;
      break;
    }
    LPBYTE buffer = nullptr;
    DWORD read = 0, total = 0;
    NET_API_STATUS status = NetUserEnum(nullptr, 1, FILTER_NORMAL_ACCOUNT, &buffer, MAX_PREFERRED_LENGTH, &read, &total, &resume);
    pages++;
    if (status != NERR_Success && status != ERROR_MORE_DATA) {
      if (buffer) NetApiBufferFree(buffer);
      err = win32Failure(status);
      return false;
    }
    auto* users = reinterpret_cast<USER_INFO_1*>(buffer);
    DWORD take = std::min(read, kMaxEntries - count);
    if (take < read) truncated = true;
    for (DWORD i = 0; i < take; i++) {
      if (!first) out += ",";
      first = false;
      appendUser(out, users[i].usri1_name, users[i].usri1_comment, users[i].usri1_flags);
      count++;
    }
    if (buffer) NetApiBufferFree(buffer);
    if (status == NERR_Success) break;
    if (count >= kMaxEntries || GetTickCount64() - started >= kBudgetMs) {
      truncated = true;
      break;
    }
  }
  out += "],\"truncated\":" + std::string(truncated ? "true" : "false") + "}";
  return true;
}

bool handleAccountLocalGroups(std::string& out, Failure& err) {
  constexpr DWORD kMaxEntries = 5000;
  constexpr DWORD kMaxPages = 32;
  constexpr ULONGLONG kBudgetMs = 5000;
  const ULONGLONG started = GetTickCount64();
  DWORD_PTR resume = 0;
  DWORD pages = 0;
  DWORD count = 0;
  bool truncated = false;
  bool first = true;
  out = "{\"groups\":[";
  for (;;) {
    if (pages >= kMaxPages || count >= kMaxEntries || GetTickCount64() - started >= kBudgetMs) {
      truncated = true;
      break;
    }
    LPBYTE buffer = nullptr;
    DWORD read = 0, total = 0;
    NET_API_STATUS status = NetLocalGroupEnum(nullptr, 1, &buffer, MAX_PREFERRED_LENGTH, &read, &total, &resume);
    pages++;
    if (status != NERR_Success && status != ERROR_MORE_DATA) {
      if (buffer) NetApiBufferFree(buffer);
      err = win32Failure(status);
      return false;
    }
    auto* groups = reinterpret_cast<LOCALGROUP_INFO_1*>(buffer);
    DWORD take = std::min(read, kMaxEntries - count);
    if (take < read) truncated = true;
    for (DWORD i = 0; i < take; i++) {
      if (!first) out += ",";
      first = false;
      const auto& group = groups[i];
      out += "{\"name\":" + quote(narrow(group.lgrpi1_name, wcslen(group.lgrpi1_name))) +
             ",\"comment\":" + quote(group.lgrpi1_comment ? narrow(group.lgrpi1_comment, wcslen(group.lgrpi1_comment)) : "") +
             ",\"sid\":";
      {
        DWORD sc = 0, dc = 0;
        SID_NAME_USE use{};
        LookupAccountNameW(nullptr, group.lgrpi1_name, nullptr, &sc, nullptr, &dc, &use);
        std::vector<BYTE> sid(sc);
        std::vector<wchar_t> dom(dc);
        if (sc && LookupAccountNameW(nullptr, group.lgrpi1_name, sid.data(), &sc, dom.data(), &dc, &use)) out += quote(sidText(sid.data()));
        else out += "\"\"";
      }
      out += "}";
      count++;
    }
    if (buffer) NetApiBufferFree(buffer);
    if (status == NERR_Success) break;
    if (count >= kMaxEntries || GetTickCount64() - started >= kBudgetMs) {
      truncated = true;
      break;
    }
  }
  out += "],\"truncated\":" + std::string(truncated ? "true" : "false") + "}";
  return true;
}
bool handleAccountProfiles(std::string& out,Failure&){HKEY key=nullptr;if(RegOpenKeyExW(HKEY_LOCAL_MACHINE,L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList",0,KEY_READ|KEY_WOW64_64KEY,&key)!=ERROR_SUCCESS){out="{\"profiles\":[]}";return true;}out="{\"profiles\":[";DWORD idx=0;bool first=true;wchar_t name[256];DWORD n;while(true){n=256;FILETIME ft{};LONG r=RegEnumKeyExW(key,idx++,name,&n,nullptr,nullptr,nullptr,&ft);if(r!=ERROR_SUCCESS)break;std::wstring sid(name,n),path;HKEY child=nullptr;if(RegOpenKeyExW(key,sid.c_str(),0,KEY_QUERY_VALUE,&child)!=ERROR_SUCCESS)continue;wchar_t value[32768];DWORD bytes=sizeof(value),type=0;if(RegQueryValueExW(child,L"ProfileImagePath",nullptr,&type,(BYTE*)value,&bytes)!=ERROR_SUCCESS){RegCloseKey(child);continue;}RegCloseKey(child);DWORD needed=ExpandEnvironmentStringsW(value,nullptr,0);std::wstring expanded(needed?needed:1,L'\0');if(needed){ExpandEnvironmentStringsW(value,expanded.data(),needed);expanded.resize(wcslen(expanded.c_str()));}else expanded=value;if(!first)out+=",";first=false;out+="{\"sid\":"+quote(narrow(sid))+",\"path\":"+quote(narrow(expanded))+"}";}RegCloseKey(key);out+="]}";return true;}
} // namespace sys
