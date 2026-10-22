package expo.modules.dudeshare

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareContentTest {
  @Test fun textualTypesAndExtensions() {
    assertTrue(ShareContent.isTextual("text/plain", null))
    assertTrue(ShareContent.isTextual("application/json", "a.bin"))
    assertTrue(ShareContent.isTextual("application/x-pem-file", null))
    assertTrue(ShareContent.isTextual("application/octet-stream", "cert.PEM"))
    assertFalse(ShareContent.isTextual("application/octet-stream", "blob.bin"))
    assertFalse(ShareContent.isTextual("image/png", "a.txt"))
  }

  @Test fun utf8DecodeIsStrict() {
    assertEquals("héllo", ShareContent.decodeUtf8("héllo".toByteArray(Charsets.UTF_8)))
    assertEquals("x", ShareContent.decodeUtf8(byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte(), 'x'.code.toByte())))
    assertNull(ShareContent.decodeUtf8(byteArrayOf(0xC3.toByte(), 0x28)))
    assertNull(ShareContent.decodeUtf8(byteArrayOf('a'.code.toByte(), 0, 'b'.code.toByte())))
  }

  @Test fun onlyContentUrisAreRead() {
    assertTrue(ShareContent.isAllowedScheme("content"))
    assertFalse(ShareContent.isAllowedScheme("file"))
    assertFalse(ShareContent.isAllowedScheme(null))
  }
}
