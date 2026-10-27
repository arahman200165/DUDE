package expo.modules.dudehub

import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.ByteString
import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.InetAddress
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager

internal fun certificatePin(cert: X509Certificate): String = b64(MessageDigest.getInstance("SHA-256").digest(cert.publicKey.encoded))

/** Trust is checked DURING TLS handshake, before OkHttp can write HTTP headers or the WSS upgrade. Pin is sole identity. */
internal class PinTrustManager(private val pins: Set<String>) : X509TrustManager {
  init { require(pins.isNotEmpty() && pins.size <= 32 && pins.all { Regex("^[A-Za-z0-9_-]{43}$").matches(it) }) }
  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) { throw CertificateException("Client trust unsupported") }
  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    if (chain.isEmpty() || certificatePin(chain[0]) !in pins) throw CertificateException("tls-pin-mismatch")
  }
  fun matches(cert: X509Certificate): Boolean = certificatePin(cert) in pins
}

/** What a TLS failure of a `public-ca` connection looks like to the JS layer (the pinned mode keeps `tls-pin-mismatch`). */
internal const val PUBLIC_CA_UNTRUSTED = "tls-public-ca-untrusted"
/** A `public-ca` origin that is not https on exactly the stored domain, or a stored domain that is not a public DNS name. Nothing was sent. */
internal const val TRUST_ORIGIN_REFUSED = "trust-origin-refused"

/** Same pattern and reserved suffixes as `isPublicCaDomain` in `@dude/contracts/hub` (trust.schema.ts): a lower-case public DNS name, never an IP literal. */
private val PUBLIC_CA_DOMAIN = Regex("^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$")
private val RESERVED_SUFFIXES = setOf("local", "localhost", "localdomain", "internal", "lan", "home", "corp", "invalid", "test", "example")
internal fun isPublicCaDomain(value: String): Boolean = PUBLIC_CA_DOMAIN.matches(value) && value.substringAfterLast('.') !in RESERVED_SUFFIXES

/**
 * How one connection verifies the Hub (32-SS1, Milestone 839, PD-143). Chosen from the device's STORED enrollment by the JS layer, never from anything
 * a Hub sent. `Pinned` is the original mode. `PublicCa` verifies the ordinary chain against the system roots and the host name against exactly `domain`.
 */
internal sealed class HubTrust {
  class Pinned(val pins: List<String>) : HubTrust()
  class PublicCa(val domain: String) : HubTrust()
  companion object {
    /** `publicCaDomain == null` is the pinned mode (and the only mode of a pre-839 caller); a non-null value must be a public DNS name. */
    fun of(pins: List<String>, publicCaDomain: String?): HubTrust {
      if (publicCaDomain == null) return Pinned(pins)
      require(isPublicCaDomain(publicCaDomain)) { TRUST_ORIGIN_REFUSED }
      return PublicCa(publicCaDomain)
    }
  }
}

/**
 * TEST SEAM ONLY (Milestone 839): the roots a `public-ca` client trusts, and where it dials, so JVM tests can use a throwaway CA and loopback while the TLS
 * host name and SNI stay the trusted domain. It is a constructor parameter of [PinnedHubTransport] that nothing in `main` supplies: the Expo module, the
 * JS bridge and every Hub-provided value cannot reach it (`public-ca-trust-seam.spec.ts` scans for that).
 */
internal class PublicCaTestSeam(val sslSocketFactory: SSLSocketFactory, val trustManager: X509TrustManager, val dialAddress: InetAddress? = null)

internal class PinnedHubTransport(private val publicCaTestSeam: PublicCaTestSeam? = null, private val emit: (Map<String, Any>) -> Unit) {
  companion object {
    const val MAX_JSON_BYTES = 4 * 1024 * 1024
    const val MAX_REALTIME_BYTES = 16 * 1024
    fun client(pins: List<String>): OkHttpClient = client(HubTrust.Pinned(pins), null)
    fun client(trust: HubTrust, seam: PublicCaTestSeam?): OkHttpClient {
      val builder = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).writeTimeout(15, TimeUnit.SECONDS).callTimeout(15, TimeUnit.SECONDS)
      return when (trust) {
        is HubTrust.Pinned -> {
          val pinTrust = PinTrustManager(trust.pins.toSet())
          val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf(pinTrust), null) }
          builder.sslSocketFactory(context.socketFactory, pinTrust)
            // A local-CA/self-signed Hub may be reached under an IP or a proxy name. Match desktop pin-only identity.
            .hostnameVerifier { _, session -> (session.peerCertificates.firstOrNull() as? X509Certificate)?.let(pinTrust::matches) == true }.build()
        }
        // Platform default trust manager (system roots only: no extra CA, no pins, no global trust-all) and OkHttp's default host name verifier, which
        // checks the certificate against the request host. `requestBuilder` has already pinned that host to the stored domain.
        is HubTrust.PublicCa -> {
          if (seam != null) {
            builder.sslSocketFactory(seam.sslSocketFactory, seam.trustManager)
            seam.dialAddress?.let { address -> builder.dns(object : Dns { override fun lookup(hostname: String): List<InetAddress> = listOf(address) }) }
          }
          builder.build()
        }
      }
    }
    fun pemPin(pem: String): String {
      require(pem.toByteArray(Charsets.UTF_8).size <= 64 * 1024) { "Certificate too large" }
      val cert = CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(pem.toByteArray(Charsets.UTF_8))) as X509Certificate
      return certificatePin(cert)
    }
  }
  private data class SocketEntry(var socket: WebSocket?, val client: OkHttpClient)
  private val sockets = ConcurrentHashMap<String, SocketEntry>()
  private fun requestBuilder(origin: String, path: String, trust: HubTrust): Request.Builder {
    val base = origin.toHttpUrl()
    require(base.scheme == "https" && base.username.isEmpty() && base.password.isEmpty() && base.encodedPath == "/" && base.query == null && base.fragment == null) { "HTTPS Hub origin required" }
    // A public-CA device trusts ONE domain: any other host (or an IP literal) is refused before a socket opens.
    if (trust is HubTrust.PublicCa) require(base.host == trust.domain) { TRUST_ORIGIN_REFUSED }
    require(path.startsWith("/api/v1/") && !path.contains('#') && !path.contains('\\') && !path.contains("..")) { "Invalid Hub path" }
    val url = base.resolve(path) ?: throw IllegalArgumentException("Invalid Hub path")
    require(url.scheme == "https" && url.host == base.host && url.port == base.port) { "Hub origin changed" }
    return Request.Builder().url(url).header("Accept", "application/json")
  }
  /** [publicCaDomain] null is the pinned mode (the pre-839 call shape); non-null verifies the public CA chain and host name for exactly that domain. */
  fun request(origin: String, pins: List<String>, method: String, path: String, headers: Map<String, String>, body: String?, publicCaDomain: String? = null): Map<String, Any> {
    val trust = HubTrust.of(pins, publicCaDomain)
    require(method in listOf("GET", "POST", "PUT", "PATCH", "DELETE")) { "Invalid method" }
    require(body == null || body.toByteArray(Charsets.UTF_8).size <= MAX_JSON_BYTES) { "Request too large" }
    val builder = requestBuilder(origin, path, trust)
    headers.forEach { (name, value) ->
      require(name.lowercase(java.util.Locale.ROOT) == "authorization" && Regex("^Bearer ddt_[A-Za-z0-9_-]{43}$").matches(value)) { "Invalid Hub header" }
      builder.header(name, value)
    }
    val requestBody = if (body != null) body.toRequestBody("application/json".toMediaType()) else if (method in listOf("POST", "PUT", "PATCH")) "".toRequestBody("application/json".toMediaType()) else null
    val client = client(trust, publicCaTestSeam)
    try {
      client.newCall(builder.method(method, requestBody).build()).execute().use { response ->
        if (response.code in 300..399) throw IOException("Hub redirects are refused")
        val responseBody = response.body ?: throw IOException("Missing JSON response")
        val mime = responseBody.contentType()
        if (mime?.subtype != "json" && mime?.subtype?.endsWith("+json") != true) throw IOException("Hub response must be JSON")
        if (responseBody.contentLength() > MAX_JSON_BYTES) throw IOException("Hub response too large")
        val source = responseBody.source()
        // Read one byte beyond the limit to detect a chunked/lying Content-Length without allocating an unbounded body.
        source.request((MAX_JSON_BYTES + 1).toLong())
        if (source.buffer.size > MAX_JSON_BYTES) throw IOException("Hub response too large")
        val text = source.readUtf8()
        return mapOf("status" to response.code, "headers" to mapOf("content-type" to (response.header("Content-Type") ?: "")), "body" to text)
      }
    } catch (error: SSLException) {
      // A public-CA failure (untrusted chain, expired, wrong host) carries no pin message of its own; name it for the JS layer.
      throw if (trust is HubTrust.PublicCa) IOException(PUBLIC_CA_UNTRUSTED, error) else error
    } finally { client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown() }
  }
  fun open(id: String, origin: String, pins: List<String>, token: String, publicCaDomain: String? = null) {
    val trust = HubTrust.of(pins, publicCaDomain)
    require(uuidPattern.matches(id) && !sockets.containsKey(id)) { "Invalid socket id" }
    require(Regex("^ddt_[A-Za-z0-9_-]{43}$").matches(token)) { "Invalid device token" }
    // The origin is checked against the trust BEFORE a client or a socket id exists, so a refused origin leaves nothing behind.
    val upgrade = requestBuilder(origin, "/api/v1/realtime", trust).header("Authorization", "Bearer $token").build()
    val client = client(trust, publicCaTestSeam).newBuilder().pingInterval(25, TimeUnit.SECONDS).build()
    val entry = SocketEntry(null, client)
    require(sockets.putIfAbsent(id, entry) == null) { "Socket id already open" }
    val socket = client.newWebSocket(upgrade, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) { emit(mapOf("id" to id, "kind" to "open")) }
      override fun onMessage(webSocket: WebSocket, text: String) {
        if (text.toByteArray(Charsets.UTF_8).size > MAX_REALTIME_BYTES) { webSocket.close(1009, "Message too large"); return }
        emit(mapOf("id" to id, "kind" to "message", "text" to text))
      }
      override fun onMessage(webSocket: WebSocket, bytes: ByteString) { webSocket.close(1003, "JSON text required") }
      override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, reason) }
      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { release(id, client); emit(mapOf("id" to id, "kind" to "close", "code" to code)) }
      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        release(id, client)
        val causes = generateSequence(t as Throwable?) { it.cause }.toList()
        val pinMismatch = causes.any { it.message?.contains("tls-pin-mismatch") == true }
        val publicCaUntrusted = trust is HubTrust.PublicCa && causes.any { it is SSLException }
        emit(mapOf("id" to id, "kind" to "failure", "code" to (response?.code ?: 0), "error" to if (pinMismatch) "tls-pin-mismatch" else if (publicCaUntrusted) PUBLIC_CA_UNTRUSTED else "hub-unreachable"))
      }
    })
    synchronized(entry) {
      if (sockets[id] === entry) entry.socket = socket else socket.cancel()
    }
  }
  fun send(id: String, text: String): Boolean {
    require(text.toByteArray(Charsets.UTF_8).size <= MAX_REALTIME_BYTES) { "Message too large" }
    return sockets[id]?.socket?.send(text) ?: false
  }
  fun close(id: String) { sockets.remove(id)?.let { synchronized(it) { it.socket?.cancel() }; it.client.connectionPool.evictAll(); it.client.dispatcher.executorService.shutdown() } }
  fun closeAll() { sockets.keys.toList().forEach(::close) }
  private fun release(id: String, client: OkHttpClient) { sockets.remove(id); client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown() }
}
