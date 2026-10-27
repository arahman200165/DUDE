package expo.modules.dudehub

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.IOException
import java.net.InetAddress
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Public-CA trust mode of the Android Hub client (32-SS1, Milestone 839, PD-143), adversarially; mirrors `apps/device-agent/src/hub/public-ca-trust.spec.ts`.
 * A throwaway CA signs the "public" leaves and reaches a client ONLY through the `PublicCaTestSeam` of a transport instance (it also dials loopback while the
 * TLS host name stays the trusted domain). Plain JVM: no Android classes.
 */
class PublicCaTrustTest {
  private val domain = "hub.example.com"
  private val day = 86_400_000L
  private val root: HeldCertificate = HeldCertificate.Builder().commonName("Test public CA").certificateAuthority(0).build()
  private val otherRoot: HeldCertificate = HeldCertificate.Builder().commonName("Untrusted CA").certificateAuthority(0).build()
  private val trustedRoots = HandshakeCertificates.Builder().addTrustedCertificate(root.certificate).build()
  private val seam = PublicCaTestSeam(trustedRoots.sslSocketFactory(), trustedRoots.trustManager, InetAddress.getByName("127.0.0.1"))
  private val token = "ddt_${"A".repeat(43)}"

  private fun leaf(vararg names: String, issuer: HeldCertificate = root, from: Long? = null, to: Long? = null): HeldCertificate =
    HeldCertificate.Builder().commonName(names.first()).apply {
      names.forEach { addSubjectAlternativeName(it) }
      if (from != null && to != null) validityInterval(from, to)
    }.signedBy(issuer).build()
  private fun selfSigned(vararg names: String): HeldCertificate = HeldCertificate.Builder().commonName(names.first()).apply { names.forEach { addSubjectAlternativeName(it) } }.build()
  /** A TLS server presenting [cert] (plus its [intermediates]). A CA-issued leaf also sends the test root, as real servers send their chain. */
  private fun serve(cert: HeldCertificate, vararg intermediates: HeldCertificate): MockWebServer = MockWebServer().apply {
    useHttps(HandshakeCertificates.Builder().heldCertificate(cert, *intermediates.map { it.certificate }.toTypedArray()).build().sslSocketFactory(), false)
    start()
  }
  private fun originOf(server: MockWebServer, host: String = domain) = "https://$host:${server.port}/"
  private val json = { MockResponse().setHeader("Content-Type", "application/json").setBody("{\"ok\":true}") }
  private fun publicTransport() = PinnedHubTransport(seam) { }
  private fun get(server: MockWebServer, host: String = domain, pins: List<String> = emptyList(), domainArg: String? = domain, transport: PinnedHubTransport = publicTransport()) =
    transport.request(originOf(server, host), pins, "GET", "/api/v1/hello", emptyMap(), null, domainArg)

  @Test fun acceptsACaIssuedCertificateForTheDomainWithoutAnyPin() {
    serve(leaf(domain), root).use { server ->
      server.enqueue(json())
      assertEquals(200, get(server)["status"])
      assertEquals(1, server.requestCount)
    }
  }

  @Test fun refusesACaIssuedCertificateForAnotherHostNameWithZeroApplicationBytes() {
    serve(leaf("other.example.com"), root).use { server ->
      server.enqueue(json())
      assertEquals(PUBLIC_CA_UNTRUSTED, assertThrows(IOException::class.java) { get(server) }.message)
      assertEquals(0, server.requestCount)
    }
  }

  @Test fun refusesExpiredAndNotYetValidCertificates() {
    val now = System.currentTimeMillis()
    serve(leaf(domain, from = now - 30 * day, to = now - day), root).use { server ->
      assertEquals(PUBLIC_CA_UNTRUSTED, assertThrows(IOException::class.java) { get(server) }.message)
      assertEquals(0, server.requestCount)
    }
    serve(leaf(domain, from = now + day, to = now + 30 * day), root).use { server ->
      assertEquals(PUBLIC_CA_UNTRUSTED, assertThrows(IOException::class.java) { get(server) }.message)
      assertEquals(0, server.requestCount)
    }
  }

  @Test fun refusesASelfSignedCertificateEvenWithEveryHubSuppliedFieldNamingIt() {
    val self = selfSigned(domain)
    serve(self).use { server ->
      // `pins` is exactly what a hostile Hub could have handed the device; it must not widen public-ca trust.
      assertEquals(PUBLIC_CA_UNTRUSTED, assertThrows(IOException::class.java) { get(server, pins = listOf(certificatePin(self.certificate))) }.message)
      assertEquals(0, server.requestCount)
    }
  }

  @Test fun refusesACertificateFromADifferentUntrustedCa() {
    serve(leaf(domain, issuer = otherRoot), otherRoot).use { server ->
      assertEquals(PUBLIC_CA_UNTRUSTED, assertThrows(IOException::class.java) { get(server) }.message)
      assertEquals(0, server.requestCount)
    }
  }

  @Test fun refusesPlainHttpAnotherHostCredentialsAndNonPublicDomainsBeforeAnySocketOpens() {
    serve(leaf(domain), root).use { server ->
      fun call(origin: String, stored: String? = domain) = publicTransport().request(origin, emptyList(), "GET", "/api/v1/hello", emptyMap(), null, stored)
      assertThrows(IllegalArgumentException::class.java) { call(originOf(server).replace("https:", "http:")) }
      assertEquals(TRUST_ORIGIN_REFUSED, assertThrows(IllegalArgumentException::class.java) { call(originOf(server, "evil.example.com")) }.message)
      assertThrows(IllegalArgumentException::class.java) { call("https://user:pw@$domain:${server.port}/") }
      // The stored domain itself must be a public DNS name: IP literals, single labels and reserved suffixes cannot carry public-ca.
      for (bad in listOf("127.0.0.1", "localhost", "hub.local", "hub.internal", "[::1]", "HUB.EXAMPLE.COM", "hub.example.com.", "")) {
        assertThrows(bad, IllegalArgumentException::class.java) { call("https://127.0.0.1:${server.port}/", bad) }
      }
      assertEquals(0, server.requestCount)
    }
  }

  @Test fun refusesRedirectsInPublicCaMode() {
    serve(leaf(domain), root).use { server ->
      serve(leaf(domain), root).use { elsewhere ->
        server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", "https://$domain:${elsewhere.port}/api/v1/secret"))
        assertThrows(IOException::class.java) { get(server) }
        assertEquals(0, elsewhere.requestCount)
      }
    }
  }

  @Test fun pinnedModeIsUnchangedAndNeverFallsBackToThePublicChain() {
    // A certificate the test CA issued (the seam trusts it) whose key is NOT pinned: refused, zero application bytes, even though the chain is valid.
    val wrong = selfSigned("wrong-pin")
    serve(leaf("localhost"), root).use { server ->
      server.enqueue(json())
      assertThrows(IOException::class.java) { publicTransport().request(server.url("/").toString(), listOf(certificatePin(wrong.certificate)), "GET", "/api/v1/hello", emptyMap(), null, null) }
      assertEquals(0, server.requestCount)
    }
    // Its own pin on a certificate outside any chain, under a different host name, is still accepted.
    val self = selfSigned("unrelated-name")
    serve(self).use { server ->
      server.enqueue(json())
      assertEquals(200, publicTransport().request(server.url("/").toString(), listOf(certificatePin(self.certificate)), "GET", "/api/v1/hello", emptyMap(), null, null)["status"])
    }
  }

  @Test fun realtimeSocketRefusesAnUntrustedChainAndAWrongOriginWithZeroUpgradeBytes() {
    serve(leaf("other.example.com"), root).use { server ->
      val failed = CountDownLatch(1)
      val events = CopyOnWriteArrayList<Map<String, Any>>()
      val transport = PinnedHubTransport(seam) { event -> events.add(event); if (event["kind"] == "failure") failed.countDown() }
      transport.open("11111111-1111-4111-8111-111111111111", originOf(server), emptyList(), token, domain)
      assertTrue(failed.await(20, TimeUnit.SECONDS))
      assertEquals(PUBLIC_CA_UNTRUSTED, events.last()["error"])
      assertEquals(0, server.requestCount)
      // A different host than the stored domain throws before the socket id is reserved, so the id can be used again.
      assertEquals(TRUST_ORIGIN_REFUSED, assertThrows(IllegalArgumentException::class.java) { transport.open("22222222-2222-4222-8222-222222222222", originOf(server, "evil.example.com"), emptyList(), token, domain) }.message)
      assertEquals(TRUST_ORIGIN_REFUSED, assertThrows(IllegalArgumentException::class.java) { transport.open("22222222-2222-4222-8222-222222222222", originOf(server, "evil.example.com"), emptyList(), token, domain) }.message)
      transport.closeAll()
    }
  }

  @Test fun trustSelectionComesFromTheStoredDomainOnly() {
    assertTrue(HubTrust.of(listOf("x"), null) is HubTrust.Pinned)
    val trust = HubTrust.of(listOf(certificatePin(selfSigned("a").certificate)), domain)
    assertTrue(trust is HubTrust.PublicCa)
    assertEquals(domain, (trust as HubTrust.PublicCa).domain)
    assertFalse(isPublicCaDomain("a.b.local"))
    assertTrue(isPublicCaDomain("a.b.dev"))
  }

  @Test fun theTestSeamIsReachableOnlyFromTheTransportFileNeverFromTheModuleOrBridge() {
    val main = File("src/main/java/expo/modules/dudehub")
    val files = main.listFiles { f -> f.extension == "kt" }!!
    assertTrue(files.isNotEmpty())
    val users = files.filter { it.readText().contains("PublicCaTestSeam") }.map { it.name }
    assertEquals(listOf("PinnedHubTransport.kt"), users)
    assertFalse(File(main, "DudeHubModule.kt").readText().contains("seam", ignoreCase = true))
  }
}
