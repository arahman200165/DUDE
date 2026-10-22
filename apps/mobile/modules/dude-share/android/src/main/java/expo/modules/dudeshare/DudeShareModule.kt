package expo.modules.dudeshare

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

/**
 * Share-to-DUDE inbound (ACTION_SEND). The module keeps the most recent SEND intent in memory only; JavaScript reads it with
 * `getPendingShare(maxBytes)` and discards it with `clearPendingShare()`. Content URIs are read through the temporary grant that
 * arrives with the intent (no storage or media permission). Content is never logged, persisted or forwarded in events: `onShare`
 * carries no payload, it only tells JavaScript to call `getPendingShare` again.
 */
class DudeShareModule : Module() {
  /** The newest SEND intent delivered through onNewIntent; null until one arrives while the process is running. */
  private var latest: Intent? = null
  /** The intent object already handled (cleared), so the launch intent is not replayed by a later foreground. */
  private var consumed: Intent? = null

  private fun current(): Intent? {
    val intent = latest ?: appContext.currentActivity?.intent ?: return null
    return if (intent.action == Intent.ACTION_SEND && intent !== consumed) intent else null
  }

  @Suppress("DEPRECATION")
  private fun streamOf(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri

  private fun fileMap(name: String, mimeType: String, size: Long, extra: Pair<String, Any?>? = null): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>("kind" to "file", "name" to name, "mimeType" to mimeType, "size" to size)
    if (extra != null) map[extra.first] = extra.second
    return map
  }

  private fun describe(maxBytes: Int): Map<String, Any?>? {
    val intent = current() ?: return null
    val uri = streamOf(intent)
    if (uri == null) {
      val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: return null
      val size = text.toByteArray(Charsets.UTF_8).size
      val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
      val tooLarge = size > maxBytes
      return mapOf("kind" to "text", "text" to (if (tooLarge) "" else text), "subject" to subject, "size" to size, "tooLarge" to tooLarge)
    }
    if (!ShareContent.isAllowedScheme(uri.scheme)) throw CodedException("ERR_SHARE_UNSUPPORTED", "Only content shared through the Android share sheet can be opened.", null)
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val resolver = context.contentResolver
    var name = "shared-file"
    var declared: Long = -1
    try {
      resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
          if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) declared = cursor.getLong(sizeIndex)
        }
      }
    } catch (error: Exception) { /* name and size stay unknown; the read below enforces the cap. */ }
    val mimeType = intent.type ?: resolver.getType(uri) ?: "application/octet-stream"
    if (declared > maxBytes) return fileMap(name, mimeType, declared, "tooLarge" to true)
    val bytes = readCapped(uri, maxBytes) ?: return fileMap(name, mimeType, if (declared >= 0) declared else maxBytes.toLong() + 1, "tooLarge" to true)
    if (ShareContent.isTextual(mimeType, name)) {
      val text = ShareContent.decodeUtf8(bytes)
      if (text != null) return fileMap(name, mimeType, bytes.size.toLong(), "text" to text)
    }
    return fileMap(name, mimeType, bytes.size.toLong(), "base64" to Base64.encodeToString(bytes, Base64.NO_WRAP))
  }

  /** Reads at most `maxBytes`; returns null as soon as the stream proves larger, so an unreported size cannot bypass the cap. */
  private fun readCapped(uri: Uri, maxBytes: Int): ByteArray? {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val stream = (try { context.contentResolver.openInputStream(uri) } catch (error: Exception) { null })
      ?: throw CodedException("ERR_SHARE_UNREADABLE", "The shared content could not be read.", null)
    stream.use { input ->
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(16 * 1024)
      var total = 0
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        total += read
        if (total > maxBytes) return null
        output.write(buffer, 0, read)
      }
      return output.toByteArray()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("DudeShare")
    Events("onShare")
    AsyncFunction("getPendingShare") { maxBytes: Int ->
      if (maxBytes < 1) throw CodedException("ERR_SHARE_INPUT", "maxBytes must be positive.", null)
      describe(maxBytes)
    }
    Function("clearPendingShare") {
      consumed = current() ?: consumed
      latest = null
    }
    OnNewIntent { intent ->
      if (intent.action == Intent.ACTION_SEND) {
        latest = intent
        sendEvent("onShare", mapOf<String, Any?>())
      }
    }
  }
}
