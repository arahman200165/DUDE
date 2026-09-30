#include "common.hpp"
#include <aclapi.h>
#include <sddl.h>
#include <cwctype>
#include <map>
#include <vector>

// acl.get (Milestone 610): read-only owner/group/DACL/SACL of a file, folder or registry key.
// Access masks are returned raw; the renderer decodes them (src/shared-logic/system/sddl.ts) so that files
// and registry keys share one rights table. Names come from LookupAccountSidW (per-call cache, null when
// unresolved) and, for file targets, GetInheritanceSourceW supplies the ancestor each inherited ACE came from.

namespace sys {
namespace {
struct AclTarget { bool file=false; std::wstring path; std::string kind; std::string hiveName; std::string viewName; HKEY hive=nullptr; REGSAM view=0; };

bool parseAclTarget(const JsonValue* params,AclTarget& t) {
  if(!params||params->kind!=JsonValue::Object)return false; const auto* o=params->find("target"); if(!o||o->kind!=JsonValue::Object)return false;
  const auto* k=o->find("kind"); const auto* p=o->find("path"); if(!k||k->kind!=JsonValue::String||!p||p->kind!=JsonValue::String||p->string.empty())return false;
  t.path=widen(p->string); t.kind=k->string; if(t.path.size()>32767)return false; if(k->string=="file"){t.file=true;return true;} if(k->string!="registry")return false;
  const auto* h=o->find("hive");const auto* v=o->find("view");if(!h||h->kind!=JsonValue::String||!v||v->kind!=JsonValue::String)return false;
  t.hiveName=h->string;t.viewName=v->string;if(h->string=="HKLM")t.hive=HKEY_LOCAL_MACHINE;else if(h->string=="HKCU")t.hive=HKEY_CURRENT_USER;else if(h->string=="HKCR")t.hive=HKEY_CLASSES_ROOT;else if(h->string=="HKU")t.hive=HKEY_USERS;else if(h->string=="HKCC")t.hive=HKEY_CURRENT_CONFIG;else return false;
  if(v->string=="64")t.view=KEY_WOW64_64KEY;else if(v->string=="32")t.view=KEY_WOW64_32KEY;else if(v->string!="default")return false; return true;
}

// Enables SeSecurityPrivilege for the current scope (needed to read the SACL when elevated) and restores the prior state.
struct SecurityPrivilege {
  HANDLE token=nullptr; TOKEN_PRIVILEGES previous{}; bool changed=false;
  SecurityPrivilege() {
    if(!OpenProcessToken(GetCurrentProcess(),TOKEN_ADJUST_PRIVILEGES|TOKEN_QUERY,&token))return;
    TOKEN_PRIVILEGES tp{}; tp.PrivilegeCount=1; tp.Privileges[0].Attributes=SE_PRIVILEGE_ENABLED;
    if(!LookupPrivilegeValueW(nullptr,L"SeSecurityPrivilege",&tp.Privileges[0].Luid))return;
    DWORD len=sizeof(previous);
    if(AdjustTokenPrivileges(token,FALSE,&tp,sizeof(previous),&previous,&len)&&GetLastError()==ERROR_SUCCESS)changed=true;
  }
  ~SecurityPrivilege() {
    if(token){ if(changed)AdjustTokenPrivileges(token,FALSE,&previous,0,nullptr,nullptr); CloseHandle(token); }
  }
};

struct ResolvedName { bool ok=false; std::string name; };
class NameCache {
 public:
  const ResolvedName& lookup(PSID sid) {
    LPWSTR s=nullptr; std::string key; if(sid&&IsValidSid(sid)&&ConvertSidToStringSidW(sid,&s)){key=narrow(s,wcslen(s));LocalFree(s);}
    auto it=cache_.find(key); if(it!=cache_.end())return it->second;
    ResolvedName r; if(!key.empty()) {
      std::vector<wchar_t> name(256),domain(256); DWORD nl=(DWORD)name.size(),dl=(DWORD)domain.size(); SID_NAME_USE use;
      BOOL ok=LookupAccountSidW(nullptr,sid,name.data(),&nl,domain.data(),&dl,&use);
      if(!ok&&GetLastError()==ERROR_INSUFFICIENT_BUFFER){name.assign(nl+1,0);domain.assign(dl+1,0);ok=LookupAccountSidW(nullptr,sid,name.data(),&nl,domain.data(),&dl,&use);}
      if(ok&&nl>0){ r.ok=true; r.name=dl>0?narrow(domain.data(),dl)+"\\"+narrow(name.data(),nl):narrow(name.data(),nl); }
    }
    return cache_.emplace(key,r).first->second;
  }
 private:
  std::map<std::string,ResolvedName> cache_;
};

void appendSid(std::string& out,PSID sid){LPWSTR s=nullptr;if(sid&&IsValidSid(sid)&&ConvertSidToStringSidW(sid,&s)){appendJsonString(out,narrow(s,wcslen(s)));LocalFree(s);}else out+="null";}
void appendName(std::string& out,NameCache& names,PSID sid){const auto& r=names.lookup(sid);if(r.ok)appendJsonString(out,r.name);else out+="null";}

// Object ACE types carry two optional GUIDs between the flags and the SID.
bool aceSid(void* raw,PSID& sid,ACCESS_MASK& mask) {
  auto* h=(ACE_HEADER*)raw; if(h->AceSize<8)return false; auto* base=(BYTE*)raw; mask=*(DWORD*)(base+4);
  size_t offset=8;
  switch(h->AceType){
    case ACCESS_ALLOWED_OBJECT_ACE_TYPE: case ACCESS_DENIED_OBJECT_ACE_TYPE: case SYSTEM_AUDIT_OBJECT_ACE_TYPE: case SYSTEM_ALARM_OBJECT_ACE_TYPE:
    case ACCESS_ALLOWED_CALLBACK_OBJECT_ACE_TYPE: case ACCESS_DENIED_CALLBACK_OBJECT_ACE_TYPE: case SYSTEM_AUDIT_CALLBACK_OBJECT_ACE_TYPE: case SYSTEM_ALARM_CALLBACK_OBJECT_ACE_TYPE: {
      if(h->AceSize<12)return false; DWORD f=*(DWORD*)(base+8); offset=12; if(f&ACE_OBJECT_TYPE_PRESENT)offset+=16; if(f&ACE_INHERITED_OBJECT_TYPE_PRESENT)offset+=16; break; }
    default: break;
  }
  if(offset+8>h->AceSize)return false; PSID candidate=(PSID)(base+offset);
  if(!IsValidSid(candidate)||offset+GetLengthSid(candidate)>h->AceSize)return false;
  sid=candidate; return true;
}

const char* aceKind(BYTE type){return type==ACCESS_ALLOWED_ACE_TYPE?"allow":type==ACCESS_DENIED_ACE_TYPE?"deny":type==SYSTEM_AUDIT_ACE_TYPE?"audit":"other";}

void appendAceList(std::string& out,PACL acl,BOOL present,NameCache& names,const INHERITED_FROMW* inheritedFrom) {
  if(!present||!acl){out+="[]";return;}
  out+="["; bool first=true;
  for(DWORD i=0;i<acl->AceCount;i++){
    void* raw=nullptr; if(!GetAce(acl,i,&raw)||!raw)continue;
    auto* h=(ACE_HEADER*)raw; PSID sid=nullptr; ACCESS_MASK mask=0;
    bool haveSid=aceSid(raw,sid,mask);
    if(!first)out+=","; first=false;
    out+="{\"sid\":"; if(haveSid)appendSid(out,sid); else out+="null";
    out+=",\"account\":"; if(haveSid)appendName(out,names,sid); else out+="null";
    out+=",\"type\":"; appendJsonString(out,aceKind(h->AceType));
    out+=",\"aceType\":"+std::to_string((unsigned)h->AceType)+",\"flags\":"+std::to_string((unsigned)h->AceFlags)+",\"mask\":"+std::to_string((unsigned long)mask);
    bool inherited=(h->AceFlags&INHERITED_ACE)!=0;
    out+=",\"inherited\":"; out+=inherited?"true":"false";
    out+=",\"inheritedFrom\":";
    if(inherited&&inheritedFrom&&inheritedFrom[i].AncestorName&&inheritedFrom[i].AncestorName[0])appendJsonString(out,narrow(inheritedFrom[i].AncestorName,wcslen(inheritedFrom[i].AncestorName)));
    else out+="null";
    out+="}";
  }
  out+="]";
}

DWORD readSecurity(const AclTarget& t,SECURITY_INFORMATION si,PSID* owner,PSID* group,PACL* dacl,PACL* sacl,PSECURITY_DESCRIPTOR* sd) {
  if(t.file)return GetNamedSecurityInfoW((LPWSTR)t.path.c_str(),SE_FILE_OBJECT,si,owner,group,dacl,sacl,sd);
  REGSAM rights=READ_CONTROL|t.view; if(si&SACL_SECURITY_INFORMATION)rights|=ACCESS_SYSTEM_SECURITY;
  HKEY key=nullptr; LONG x=RegOpenKeyExW(t.hive,t.path.c_str(),0,rights,&key); if(x!=ERROR_SUCCESS)return (DWORD)x;
  DWORD e=GetSecurityInfo(key,SE_REGISTRY_KEY,si,owner,group,dacl,sacl,sd); RegCloseKey(key); return e;
}

// Best effort: the ancestor path of every ACE, or an empty vector when Windows cannot tell.
std::vector<INHERITED_FROMW> inheritanceSources(const AclTarget& t,SECURITY_INFORMATION si,BOOL container,PACL acl) {
  std::vector<INHERITED_FROMW> out; if(!t.file||!acl||acl->AceCount==0)return out;
  out.assign(acl->AceCount,INHERITED_FROMW{0,nullptr});
  GENERIC_MAPPING map={FILE_GENERIC_READ,FILE_GENERIC_WRITE,FILE_GENERIC_EXECUTE,FILE_ALL_ACCESS};
  if(GetInheritanceSourceW((LPWSTR)t.path.c_str(),SE_FILE_OBJECT,si,container,nullptr,0,acl,nullptr,&map,out.data())!=ERROR_SUCCESS)out.clear();
  return out;
}
} // namespace

bool handleAclGet(const JsonValue* params,std::string& result,Failure& err) {
  AclTarget t; if(!parseAclTarget(params,t)){err=plainFailure("Invalid ACL target.");return false;}
  SecurityPrivilege privilege;
  PSECURITY_DESCRIPTOR sd=nullptr; PACL dacl=nullptr,sacl=nullptr; PSID owner=nullptr,group=nullptr;
  SECURITY_INFORMATION si=OWNER_SECURITY_INFORMATION|GROUP_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION|SACL_SECURITY_INFORMATION;
  bool saclReadable=true;
  DWORD e=readSecurity(t,si,&owner,&group,&dacl,&sacl,&sd);
  if(e==ERROR_ACCESS_DENIED||e==ERROR_PRIVILEGE_NOT_HELD){
    saclReadable=false; si&=~SACL_SECURITY_INFORMATION; sd=nullptr;owner=nullptr;group=nullptr;dacl=nullptr;sacl=nullptr;
    e=readSecurity(t,si,&owner,&group,&dacl,&sacl,&sd);
  }
  if(e!=ERROR_SUCCESS){err=win32Failure(e);return false;}
  LPWSTR sddl=nullptr;
  if(!ConvertSecurityDescriptorToStringSecurityDescriptorW(sd,SDDL_REVISION_1,si,&sddl,nullptr)){e=GetLastError();LocalFree(sd);err=win32Failure(e);return false;}
  BOOL daclPresent=FALSE,daclDefaulted=FALSE,saclPresent=FALSE,saclDefaulted=FALSE;
  GetSecurityDescriptorDacl(sd,&daclPresent,&dacl,&daclDefaulted); GetSecurityDescriptorSacl(sd,&saclPresent,&sacl,&saclDefaulted);
  SECURITY_DESCRIPTOR_CONTROL control=0; DWORD revision=0; GetSecurityDescriptorControl(sd,&control,&revision);

  bool isContainer=!t.file; if(t.file){DWORD attrs=GetFileAttributesW(t.path.c_str());isContainer=attrs!=INVALID_FILE_ATTRIBUTES&&(attrs&FILE_ATTRIBUTE_DIRECTORY);}
  NameCache names;
  std::vector<INHERITED_FROMW> daclSources=daclPresent?inheritanceSources(t,DACL_SECURITY_INFORMATION,isContainer,dacl):std::vector<INHERITED_FROMW>();
  std::vector<INHERITED_FROMW> saclSources=(saclReadable&&saclPresent)?inheritanceSources(t,SACL_SECURITY_INFORMATION,isContainer,sacl):std::vector<INHERITED_FROMW>();

  result="{\"target\":{\"kind\":";appendJsonString(result,t.kind);result+=",\"path\":";appendJsonString(result,narrow(t.path));
  if(!t.file){result+=",\"hive\":";appendJsonString(result,t.hiveName);result+=",\"view\":";appendJsonString(result,t.viewName);}
  result+="},\"isContainer\":";result+=isContainer?"true":"false";
  result+=",\"owner\":";appendSid(result,owner);result+=",\"ownerName\":";appendName(result,names,owner);
  result+=",\"group\":";appendSid(result,group);result+=",\"groupName\":";appendName(result,names,group);
  result+=",\"sddl\":";appendJsonString(result,narrow(sddl,wcslen(sddl)));LocalFree(sddl);
  result+=",\"dacl\":";appendAceList(result,dacl,daclPresent,names,daclSources.empty()?nullptr:daclSources.data());
  result+=",\"daclNull\":";result+=(!daclPresent||!dacl)?"true":"false";
  result+=",\"sacl\":";if(saclReadable&&saclPresent)appendAceList(result,sacl,saclPresent,names,saclSources.empty()?nullptr:saclSources.data());else result+="null";
  result+=",\"saclUnreadable\":";result+=saclReadable?"false":"true";
  result+=",\"needsElevation\":";result+=saclReadable?"false":"true";
  result+=",\"inheritanceProtected\":";result+=(control&SE_DACL_PROTECTED)?"true":"false";
  if(!daclSources.empty())FreeInheritedFromArray(daclSources.data(),(USHORT)daclSources.size(),nullptr);
  if(!saclSources.empty())FreeInheritedFromArray(saclSources.data(),(USHORT)saclSources.size(),nullptr);

  result+=",\"effective\":";
  const JsonValue* accountValue=params->find("account");
  std::string effectiveError;
  if(accountValue&&accountValue->kind==JsonValue::String&&!accountValue->string.empty()&&accountValue->string.size()<=512){
    std::wstring account=widen(accountValue->string);
    TRUSTEE_W trustee={}; PSID accountSid=nullptr;
    if(account.rfind(L"S-1-",0)==0){
      if(ConvertStringSidToSidW(account.c_str(),&accountSid))BuildTrusteeWithSidW(&trustee,accountSid);
      else effectiveError="The account SID could not be decoded.";
    } else BuildTrusteeWithNameW(&trustee,const_cast<LPWSTR>(account.c_str()));
    ACCESS_MASK rights=0;
    DWORD code=effectiveError.empty()&&dacl?GetEffectiveRightsFromAclW(dacl,&trustee,&rights):ERROR_INVALID_ACL;
    if(!dacl&&effectiveError.empty()){rights=0x1f01ff;code=ERROR_SUCCESS;}
    if(code==ERROR_SUCCESS){
      result+="{\"account\":";appendJsonString(result,accountValue->string);
      result+=",\"mask\":"+std::to_string((unsigned long)rights)+",\"nullDacl\":";result+=dacl?"false":"true";
      result+=",\"uncertain\":true,\"disclosure\":\"DACL-derived rights only. Owner rights, token privileges, logon groups, remote groups and parent-object rules are not included.\"}";
    } else {result+="null";if(effectiveError.empty())effectiveError="Effective-rights lookup failed with Windows error "+std::to_string(code)+".";}
    if(accountSid)LocalFree(accountSid);
  } else result+="null";
  result+=",\"errors\":[";
  bool firstError=true;
  auto addError=[&](const std::string& text){if(!firstError)result+=",";firstError=false;appendJsonString(result,text);};
  if(!effectiveError.empty())addError(effectiveError);
  if(t.file&&daclPresent&&dacl&&dacl->AceCount>0&&daclSources.empty())addError("Windows could not report where inherited entries came from.");
  result+="]}";
  LocalFree(sd);return true;
}
} // namespace sys

// ---- acl.set (Milestone 610 part B): MUTATES the DACL only; reached only from confirmed engine plans. ----
namespace sys {
namespace {
std::wstring loweredPath(std::wstring path) {
  while(!path.empty()&&path.front()==L'\\')path.erase(path.begin());
  while(!path.empty()&&path.back()==L'\\')path.pop_back();
  for(auto& c:path)c=(wchar_t)towlower(c);
  return path;
}
// The registry protected-location list (matches registry_ops.cpp): HKLM\SAM, HKLM\SECURITY, HKLM\BCD00000000 and below.
bool aclProtectedKey(const AclTarget& t) {
  if(t.file||t.hive!=HKEY_LOCAL_MACHINE)return false;
  std::wstring p=loweredPath(t.path);
  for(const wchar_t* root:{L"sam",L"security",L"bcd00000000"}){std::wstring r=root; if(p==r||(p.size()>r.size()&&p.compare(0,r.size()+1,r+L"\\")==0))return true;}
  return false;
}
} // namespace

bool handleAclSet(const JsonValue* params,std::string& result,Failure& err) {
  AclTarget t; if(!parseAclTarget(params,t)){err=plainFailure("Invalid ACL target.");return false;}
  const JsonValue* sddlValue=params->find("sddl");
  if(!sddlValue||sddlValue->kind!=JsonValue::String||sddlValue->string.empty()||sddlValue->string.size()>131072){err=plainFailure("A security descriptor string is required.");return false;}
  if(aclProtectedKey(t)){err=plainFailure("This registry location is protected from edits by DUDE.");return false;}
  std::wstring text=widen(sddlValue->string);
  PSECURITY_DESCRIPTOR parsed=nullptr;
  if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(text.c_str(),SDDL_REVISION_1,&parsed,nullptr)){err=win32Failure(GetLastError());return false;}
  BOOL present=FALSE,defaulted=FALSE; PACL dacl=nullptr;
  if(!GetSecurityDescriptorDacl(parsed,&present,&dacl,&defaulted)||!present||!dacl){LocalFree(parsed);err=plainFailure("The security descriptor must contain a DACL.");return false;}
  SECURITY_DESCRIPTOR_CONTROL control=0; DWORD revision=0; GetSecurityDescriptorControl(parsed,&control,&revision);
  // Only the DACL (and its protection flag) is ever written; owner, group and SACL are never touched.
  SECURITY_INFORMATION si=DACL_SECURITY_INFORMATION|((control&SE_DACL_PROTECTED)?PROTECTED_DACL_SECURITY_INFORMATION:UNPROTECTED_DACL_SECURITY_INFORMATION);
  DWORD e;
  if(t.file){
    e=SetNamedSecurityInfoW((LPWSTR)t.path.c_str(),SE_FILE_OBJECT,si,nullptr,nullptr,dacl,nullptr);
  } else {
    HKEY key=nullptr; LONG x=RegOpenKeyExW(t.hive,t.path.c_str(),0,WRITE_DAC|READ_CONTROL|t.view,&key);
    if(x!=ERROR_SUCCESS)e=(DWORD)x;
    else { e=SetSecurityInfo(key,SE_REGISTRY_KEY,si,nullptr,nullptr,dacl,nullptr); RegCloseKey(key); }
  }
  LocalFree(parsed);
  if(e!=ERROR_SUCCESS){err=win32Failure(e);return false;}
  PSECURITY_DESCRIPTOR sd=nullptr; PACL d2=nullptr; PSID owner=nullptr,group=nullptr;
  SECURITY_INFORMATION read=OWNER_SECURITY_INFORMATION|GROUP_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION;
  e=readSecurity(t,read,&owner,&group,&d2,nullptr,&sd);
  if(e!=ERROR_SUCCESS){err=win32Failure(e);return false;}
  LPWSTR out=nullptr;
  if(!ConvertSecurityDescriptorToStringSecurityDescriptorW(sd,SDDL_REVISION_1,read,&out,nullptr)){e=GetLastError();LocalFree(sd);err=win32Failure(e);return false;}
  result="{\"sddl\":";appendJsonString(result,narrow(out,wcslen(out)));result+="}";
  LocalFree(out);LocalFree(sd);return true;
}
} // namespace sys
