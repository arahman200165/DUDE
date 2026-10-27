package expo.modules.dudehub

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import okhttp3.tls.HeldCertificate
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException
import java.net.InetAddress
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Tunnel-domain (public-CA) acceptance on a real Android trust path (32-SS1, Milestone 840, PD-143). It needs the harness: `node scripts/mobile-instrument.mjs
 * <apk> --tunnel-edge` starts `scripts/mobile-tunnel-edge.mjs` on the host (a TLS-terminating edge in front of a stub Hub, one listener per certificate),
 * installs the throwaway CA into the emulator's USER trust store and passes `dudeTunnelDomain` and `dudeTunnelPorts`. Without them every test is skipped,
 * so the plain `am instrument` run of the other tests is unchanged.
 *
 * The transport is the production one: platform default trust manager, OkHttp's host name verifier, no pins. The only test-side input is
 * [PublicCaTestSeam.dialAddress] (the host's `10.0.2.2` alias), because the emulator cannot resolve the throwaway domain; the TLS host name and SNI stay the
 * domain. The CA is trusted because this instrumentation APK's network security config (src/androidTest) trusts the user store; the release app does not.
 */
@RunWith(AndroidJUnit4::class)
class PublicCaTunnelAcceptanceTest {
  private val args = InstrumentationRegistry.getArguments()
  private val domain: String? = args.getString("dudeTunnelDomain")
  private val ports: Map<String, Int> = args.getString("dudeTunnelPorts")?.split(',')?.associate { it.substringBefore('=') to it.substringAfter('=').toInt() } ?: emptyMap()
  private val hostAlias: InetAddress = InetAddress.getByName("10.0.2.2")
  private val token = "ddt_${"A".repeat(43)}"
  private val bearer = mapOf("authorization" to "Bearer $token")

  @Before fun requireTheTunnelEdge() {
    assumeTrue("Run through scripts/mobile-instrument.mjs --tunnel-edge", domain != null && ports.keys.containsAll(listOf("good", "wrongHost", "selfSigned", "otherCa")))
  }

  private fun origin(listener: String) = "https://$domain:${ports.getValue(listener)}/"
  private fun transport(emit: (Map<String, Any>) -> Unit = { }) = PinnedHubTransport(PublicCaTestSeam(dialAddress = hostAlias), emit)
  private fun call(listener: String, method: String, path: String, headers: Map<String, String> = emptyMap(), body: String? = null) =
    transport().request(origin(listener), emptyList(), method, path, headers, body, domain)
  private fun counts(): JSONObject = JSONObject(call("good", "GET", "/api/v1/acceptance/counts")["body"] as String).getJSONObject("counts")

  @Test fun theUserInstalledCaIsTrustedForTheTunnelDomainAndTheHubSeesHttpsFromTheEdge() {
    val response = call("good", "GET", "/api/v1/hello")
    assertEquals(200, response["status"])
    val hello = JSONObject(response["body"] as String)
    assertEquals("public-ca", hello.getString("trustMode"))
    assertEquals(domain, hello.getString("trustDomain"))
    assertEquals("https", hello.getString("forwardedProto"))
    assertEquals("$domain:${ports.getValue("good")}", hello.getString("host"))
  }

  @Test fun anAuthenticatedPushThenPullRoundTripsThroughTheEdge() {
    val item = "{\"item\":\"${UUID.randomUUID()}\"}"
    assertEquals(401, call("good", "POST", "/api/v1/acceptance/sync", emptyMap(), item)["status"])
    val pushed = JSONObject(call("good", "POST", "/api/v1/acceptance/sync", bearer, item)["body"] as String)
    assertTrue(pushed.getBoolean("ok"))
    val pulled = JSONObject(call("good", "GET", "/api/v1/acceptance/sync", bearer)["body"] as String).getJSONArray("items")
    assertTrue((0 until pulled.length()).any { pulled.getString(it) == item })
  }

  @Test fun theRealtimeSocketUpgradesThroughTheEdgeAndReceivesItsWelcome() {
    val welcome = CountDownLatch(1)
    val events = CopyOnWriteArrayList<Map<String, Any>>()
    val socket = transport { event -> events.add(event); if (event["kind"] == "message" || event["kind"] == "failure") welcome.countDown() }
    socket.open("11111111-1111-4111-8111-111111111111", origin("good"), emptyList(), token, domain)
    try {
      assertTrue("no welcome within 20 s: $events", welcome.await(20, TimeUnit.SECONDS))
      val message = events.last()
      assertEquals(message.toString(), "message", message["kind"])
      assertEquals("acceptance-welcome", JSONObject(message["text"] as String).getString("type"))
    } finally { socket.closeAll() }
  }

  private fun assertUntrusted(listener: String) {
    val before = counts().getInt(listener)
    val error = assertThrows(IOException::class.java) { transport().request(origin(listener), emptyList(), "GET", "/api/v1/hello", emptyMap(), null, domain) }
    assertEquals(PUBLIC_CA_UNTRUSTED, error.message)
    val finished = CountDownLatch(1)
    val events = CopyOnWriteArrayList<Map<String, Any>>()
    val socket = transport { event -> events.add(event); if (event["kind"] == "failure" || event["kind"] == "open") finished.countDown() }
    socket.open("22222222-2222-4222-8222-222222222222", origin(listener), emptyList(), token, domain)
    try {
      assertTrue(finished.await(20, TimeUnit.SECONDS))
      assertEquals(events.toString(), PUBLIC_CA_UNTRUSTED, events.last()["error"])
    } finally { socket.closeAll() }
    // Refused during the handshake: neither the HTTP request nor the upgrade reached the Hub behind the edge.
    assertEquals(before, counts().getInt(listener))
  }

  @Test fun aCaIssuedCertificateForAnotherHostNameIsRefused() = assertUntrusted("wrongHost")
  @Test fun aSelfSignedCertificateForTheDomainIsRefused() = assertUntrusted("selfSigned")
  @Test fun aCertificateFromAnUninstalledCaIsRefused() = assertUntrusted("otherCa")

  @Test fun aPinnedEnrolledDeviceDoesNotAcceptThePublicCaEndpointWithoutItsPin() {
    val before = counts().getInt("good")
    val wrongPin = certificatePin(HeldCertificate.Builder().commonName("not-the-hub").build().certificate)
    // Reached by IP so the name is not the issue: the chain is valid and the endpoint is the edge's, yet a pinned device trusts only its pin.
    val error = assertThrows(IOException::class.java) {
      PinnedHubTransport(null) { }.request("https://10.0.2.2:${ports.getValue("good")}/", listOf(wrongPin), "GET", "/api/v1/hello", emptyMap(), null, null)
    }
    assertTrue(generateSequence(error as Throwable?) { it.cause }.any { it.message?.contains("tls-pin-mismatch") == true })
    assertEquals(before, counts().getInt("good"))
  }
}
