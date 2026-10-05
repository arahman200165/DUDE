package expo.modules.dudehub

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.exception.CodedException

class DudeHubModule : Module() {
  private val identity by lazy { DeviceIdentity(appContext.reactContext ?: throw Exceptions.ReactContextLost()) }
  private val transport by lazy { PinnedHubTransport { sendEvent("socket", it) } }
  private fun <T> identityCall(fn: () -> T): T = try { fn() } catch (error: IllegalArgumentException) {
    throw CodedException("ERR_IDENTITY_INPUT", "Invalid device identity proof input.", null)
  } catch (error: Throwable) {
    throw CodedException("ERR_KEY_UNAVAILABLE", "Android device signing identity is unavailable. Review a new pairing to repair this device.", null)
  }
  override fun definition() = ModuleDefinition {
    Name("DudeHub")
    Events("socket")
    AsyncFunction("prepareKey") { environmentId: String, installId: String -> identityCall { identity.prepare(environmentId, installId) } }
    AsyncFunction("publicKey") { ref: String -> identityCall { identity.publicKey(ref) } }
    AsyncFunction("signEnrollment") { ref: String, hub: String, code: String, device: String -> identityCall { identity.signEnrollment(ref, hub, code, device) } }
    AsyncFunction("signChallenge") { ref: String, hub: String, nonce: String, device: String -> identityCall { identity.signChallenge(ref, hub, nonce, device) } }
    AsyncFunction("deleteKey") { ref: String -> identityCall { identity.delete(ref) } }
    AsyncFunction("randomBytes") { length: Int -> identity.randomBytes(length) }
    Function("randomBytesSync") { length: Int -> identity.randomBytes(length) }
    AsyncFunction("certificatePin") { pem: String -> PinnedHubTransport.pemPin(pem) }
    AsyncFunction("request") { origin: String, pins: List<String>, method: String, path: String, headers: Map<String, String>, body: String? -> transport.request(origin, pins, method, path, headers, body) }
    AsyncFunction("openSocket") { id: String, origin: String, pins: List<String>, token: String -> transport.open(id, origin, pins, token) }
    AsyncFunction("sendSocket") { id: String, text: String -> transport.send(id, text) }
    AsyncFunction("closeSocket") { id: String -> transport.close(id) }
    OnDestroy { transport.closeAll() }
  }
}
