package expo.modules.dudeshare

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/** Pure helpers of Share-to-DUDE (no Android types, so they are unit-testable). Content is never logged. */
object ShareContent {
  private val TEXT_MIME_TYPES = setOf(
    "application/json", "application/x-pem-file", "application/pkix-cert", "application/x-x509-ca-cert",
  )
  private val TEXT_EXTENSIONS = setOf(
    "txt", "json", "pem", "crt", "cer", "key", "csr", "csv", "tsv", "log", "md", "yaml", "yml", "xml", "toml", "ini", "env", "jwt",
  )

  /** True when the share should be offered as text if it is valid UTF-8: any text type, JSON and PEM/CRT types, or a known text extension. */
  fun isTextual(mimeType: String?, name: String?): Boolean {
    val type = mimeType?.substringBefore(';')?.trim()?.lowercase()
    if (type != null && (type.startsWith("text/") || type in TEXT_MIME_TYPES)) return true
    if (type != null && type.startsWith("image/")) return false
    val extension = name?.substringAfterLast('.', "")?.lowercase().orEmpty()
    return (type == null || type == "application/octet-stream" || type == "*/*") && extension in TEXT_EXTENSIONS
  }

  /** Strict UTF-8 decode (BOM stripped); null for invalid UTF-8 or content containing NUL, which is then treated as a binary file. */
  fun decodeUtf8(bytes: ByteArray): String? {
    val decoder = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
    val text = try { decoder.decode(ByteBuffer.wrap(bytes)).toString() } catch (error: CharacterCodingException) { return null }
    if (text.indexOf('\u0000') >= 0) return null
    return if (text.isNotEmpty() && text[0] == '﻿') text.substring(1) else text
  }

  /** The URI scheme must be `content`: `file:` URIs from another app could point into this app's private storage. */
  fun isAllowedScheme(scheme: String?): Boolean = scheme == "content"
}
