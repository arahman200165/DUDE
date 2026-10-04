package expo.modules.dudehub

import androidx.test.ext.junit.runners.AndroidJUnit4
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.CopyOnWriteArrayList
import java.io.IOException

@RunWith(AndroidJUnit4::class)
class PinnedHubTransportTest {
  private fun server(cert: HeldCertificate): MockWebServer = MockWebServer().apply {
    useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
    start()
  }
  @Test fun mismatchedPinSendsZeroHttpApplicationBytesIncludingCredentials() {
    val cert = HeldCertificate.Builder().commonName("unrelated-name").build()
    val wrong = HeldCertificate.Builder().commonName("other").build()
    server(cert).use { peer ->
      peer.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("{}"))
      val transport = PinnedHubTransport { }
      assertThrows(IOException::class.java) { transport.request(peer.url("/").toString(), listOf(certificatePin(wrong.certificate)), "POST", "/api/v1/devices/enroll", mapOf("authorization" to "Bearer ddt_${"A".repeat(43)}"), "{\"pairingCode\":\"SECRET\"}") }
      assertEquals(0, peer.requestCount)
    }
  }
  @Test fun mismatchedPinSendsZeroWebsocketUpgradeBytes() {
    val cert = HeldCertificate.Builder().commonName("unrelated-name").build()
    val wrong = HeldCertificate.Builder().commonName("other").build()
    server(cert).use { peer ->
      val failed = CountDownLatch(1)
      val events = CopyOnWriteArrayList<Map<String, Any>>()
      val transport = PinnedHubTransport { event -> events.add(event); if (event["kind"] == "failure") failed.countDown() }
      transport.open("11111111-1111-4111-8111-111111111111", peer.url("/").toString(), listOf(certificatePin(wrong.certificate)), "ddt_${"A".repeat(43)}")
      assertTrue(failed.await(20, TimeUnit.SECONDS))
      assertEquals("tls-pin-mismatch", events.last()["error"])
      assertEquals(0, peer.requestCount)
      transport.closeAll()
    }
  }
  @Test fun acceptsPinnedSelfSignedNonMatchingHostnameAndRefusesRedirectsCleartextAndOversize() {
    val cert = HeldCertificate.Builder().commonName("unrelated-name").build()
    server(cert).use { peer ->
      server(HeldCertificate.Builder().commonName("second").build()).use { redirect ->
        val transport = PinnedHubTransport { }
        val origin = peer.url("/").toString()
        val pins = listOf(certificatePin(cert.certificate))
        peer.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("{\"ok\":true}"))
        assertEquals(200, transport.request(origin, pins, "GET", "/api/v1/hello", emptyMap(), null)["status"])
        peer.enqueue(MockResponse().setResponseCode(302).setHeader("Location", redirect.url("/api/v1/secret")))
        assertThrows(IOException::class.java) { transport.request(origin, pins, "GET", "/api/v1/hello", emptyMap(), null) }
        assertEquals(0, redirect.requestCount)
        assertThrows(IllegalArgumentException::class.java) { transport.request(origin.replace("https:", "http:"), pins, "GET", "/api/v1/hello", emptyMap(), null) }
        peer.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("x".repeat(PinnedHubTransport.MAX_JSON_BYTES + 1)))
        assertThrows(IOException::class.java) { transport.request(origin, pins, "GET", "/api/v1/hello", emptyMap(), null) }
      }
    }
  }
}
