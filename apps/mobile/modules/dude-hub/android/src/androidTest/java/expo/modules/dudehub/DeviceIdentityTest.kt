package expo.modules.dudehub

import android.util.Base64
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.security.KeyStore

@RunWith(AndroidJUnit4::class)
class DeviceIdentityTest {
  private val hub = "11111111-1111-4111-8111-111111111111"
  private val device = "22222222-2222-4222-8222-222222222222"
  private fun decode(value: String) = Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

  @Test fun sharedContractNodeCryptoVectors() {
    // Independently produced with node:crypto.sign(null, ...) and @dude/contracts/hub enrollMessage/deviceAuthMessage.
    val seed = ByteArray(32) { it.toByte() }
    val publicKey = "A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg"
    assertEquals(publicKey, b64(Ed25519PrivateKeyParameters(seed, 0).generatePublicKey().encoded))
    assertEquals("274b5npZ8-q2QoS_e7n-M5ZmhhjX1vubbiaTmtV-vP5B65DjeBEKyMw9JQrEHkyg-CwpeFd0z8PXXk_SpT8ZCw", b64(DeviceProof.sign(seed, DeviceProof.enrollment(hub, "o123-4567", device, publicKey))))
    assertEquals("uqKnbWlAHj3NYHTPcG2dOoLsGPlblQhcpFqbEOrpDIzC4LNxDysD4KbOf9CUDPEeNPcaSYQIucOvUY7UxTqAAg", b64(DeviceProof.sign(seed, DeviceProof.challenge(hub, "A".repeat(43), device))))
  }
  @Test fun keystoreWrappedIdentitySurvivesReopenAndDeleteDestroysOnlyItsKey() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val identity = DeviceIdentity(context)
    val first = identity.prepare(hub, device)
    val second = identity.prepare(hub, device)
    try {
      val publicKey = identity.publicKey(first)
      assertEquals(43, publicKey.length)
      assertNotEquals(publicKey, identity.publicKey(second))
      assertEquals(publicKey, DeviceIdentity(context).publicKey(first))
      val message = DeviceProof.challenge(hub, "A".repeat(43), device).toByteArray(Charsets.UTF_8)
      val signature = decode(identity.signChallenge(first, hub, "A".repeat(43), device))
      assertEquals(64, signature.size)
      val verifier = Ed25519Signer().apply { init(false, Ed25519PublicKeyParameters(decode(publicKey), 0)); update(message, 0, message.size) }
      assertTrue(verifier.verifySignature(signature))
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      assertTrue(store.containsAlias("dude.ed25519.wrap.$first"))
      identity.delete(first)
      assertFalse(store.containsAlias("dude.ed25519.wrap.$first"))
      assertThrows(Exception::class.java) { identity.publicKey(first) }
      assertEquals(43, identity.publicKey(second).length)
      // Simulate a restored ciphertext with missing Keystore material: fail closed instead of creating/replacing a key.
      store.deleteEntry("dude.ed25519.wrap.$second")
      assertThrows(Exception::class.java) { identity.signChallenge(second, hub, "A".repeat(43), device) }
    } finally { identity.delete(first); identity.delete(second) }
  }
  @Test fun refusesProtocolInjectionAndPathReferences() {
    assertThrows(IllegalArgumentException::class.java) { DeviceProof.enrollment("$hub|other", "01234567", device, "A".repeat(43)) }
    assertThrows(IllegalArgumentException::class.java) { DeviceProof.challenge(hub, "nonce|other", device) }
    val identity = DeviceIdentity(InstrumentationRegistry.getInstrumentation().targetContext)
    assertThrows(IllegalArgumentException::class.java) { identity.publicKey("../../seed") }
  }
  @Test fun publicRandomnessIsBoundedAndIndependent() {
    val identity = DeviceIdentity(InstrumentationRegistry.getInstrumentation().targetContext)
    assertEquals(1, decode(identity.randomBytes(1)).size)
    assertEquals(128, decode(identity.randomBytes(128)).size)
    assertNotEquals(identity.randomBytes(32), identity.randomBytes(32))
    assertThrows(IllegalArgumentException::class.java) { identity.randomBytes(0) }
    assertThrows(IllegalArgumentException::class.java) { identity.randomBytes(129) }
  }
}
