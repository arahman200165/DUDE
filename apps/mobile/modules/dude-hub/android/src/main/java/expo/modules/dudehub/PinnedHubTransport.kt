package expo.modules.dudehub

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
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
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

internal class PinnedHubTransport(private val emit: (Map<String, Any>) -> Unit) {
  companion object {
    const val MAX_JSON_BYTES = 4 * 1024 * 1024
    const val MAX_REALTIME_BYTES = 16 * 1024
    fun client(pins: List<String>): OkHttpClient {
      val trust = PinTrustManager(pins.toSet())
      val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
      return OkHttpClient.Builder().sslSocketFactory(context.socketFactory, trust)
        // A local-CA/self-signed Hub may be reached under an IP or a proxy name. Match desktop pin-only identity.
        .hostnameVerifier { _, session -> (session.peerCertificates.firstOrNull() as? X509Certificate)?.let(trust::matches) == true }
        .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).writeTimeout(15, TimeUnit.SECONDS)
        .callTimeout(15, TimeUnit.SECONDS).build()
    }
    fun pemPin(pem: String): String {
      require(pem.toByteArray(Charsets.UTF_8).size <= 64 * 1024) { "Certificate too large" }
      val cert = CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(pem.toByteArray(Charsets.UTF_8))) as X509Certificate
      return certificatePin(cert)
    }
  }
  private data class SocketEntry(var socket: WebSocket?, val client: OkHttpClient)
  private val sockets = ConcurrentHashMap<String, SocketEntry>()
  private fun requestBuilder(origin: String, path: String): Request.Builder {
    val base = origin.toHttpUrl()
    require(base.scheme == "https" && base.username.isEmpty() && base.password.isEmpty() && base.encodedPath == "/" && base.query == null && base.fragment == null) { "HTTPS Hub origin required" }
    require(path.startsWith("/api/v1/") && !path.contains('#') && !path.contains('\\') && !path.contains("..")) { "Invalid Hub path" }
    val url = base.resolve(path) ?: throw IllegalArgumentException("Invalid Hub path")
    require(url.scheme == "https" && url.host == base.host && url.port == base.port) { "Hub origin changed" }
    return Request.Builder().url(url).header("Accept", "application/json")
  }
  fun request(origin: String, pins: List<String>, method: String, path: String, headers: Map<String, String>, body: String?): Map<String, Any> {
    require(method in listOf("GET", "POST", "PUT", "PATCH", "DELETE")) { "Invalid method" }
    require(body == null || body.toByteArray(Charsets.UTF_8).size <= MAX_JSON_BYTES) { "Request too large" }
    val builder = requestBuilder(origin, path)
    headers.forEach { (name, value) ->
      require(name.lowercase(java.util.Locale.ROOT) == "authorization" && Regex("^Bearer ddt_[A-Za-z0-9_-]{43}$").matches(value)) { "Invalid Hub header" }
      builder.header(name, value)
    }
    val requestBody = if (body != null) body.toRequestBody("application/json".toMediaType()) else if (method in listOf("POST", "PUT", "PATCH")) "".toRequestBody("application/json".toMediaType()) else null
    val client = client(pins)
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
    } finally { client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown() }
  }
  fun open(id: String, origin: String, pins: List<String>, token: String) {
    require(uuidPattern.matches(id) && !sockets.containsKey(id)) { "Invalid socket id" }
    require(Regex("^ddt_[A-Za-z0-9_-]{43}$").matches(token)) { "Invalid device token" }
    val client = client(pins).newBuilder().pingInterval(25, TimeUnit.SECONDS).build()
    val entry = SocketEntry(null, client)
    require(sockets.putIfAbsent(id, entry) == null) { "Socket id already open" }
    val socket = client.newWebSocket(requestBuilder(origin, "/api/v1/realtime").header("Authorization", "Bearer $token").build(), object : WebSocketListener() {
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
        val pinMismatch = generateSequence(t as Throwable?) { it.cause }.any { it.message?.contains("tls-pin-mismatch") == true }
        emit(mapOf("id" to id, "kind" to "failure", "code" to (response?.code ?: 0), "error" to if (pinMismatch) "tls-pin-mismatch" else "hub-unreachable"))
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
