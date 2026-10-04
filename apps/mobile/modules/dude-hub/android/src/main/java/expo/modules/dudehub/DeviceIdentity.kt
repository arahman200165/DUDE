package expo.modules.dudehub

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal fun b64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
internal val uuidPattern = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

/** Closed protocol proofs. No generic message-signing bridge is exposed. */
internal object DeviceProof {
  fun enrollment(hub: String, code: String, device: String, publicKey: String): String {
    require(uuidPattern.matches(hub) && uuidPattern.matches(device)) { "Invalid identity" }
    val normalized = code.uppercase(java.util.Locale.ROOT).replace(Regex("[\\s-]"), "").replace('I', '1').replace('L', '1').replace('O', '0')
    require(Regex("^[0-9A-HJKMNP-TV-Z]{8}$").matches(normalized)) { "Invalid pairing code" }
    require(Regex("^[A-Za-z0-9_-]{43}$").matches(publicKey)) { "Invalid public key" }
    return "dude-enroll:v1|$hub|$normalized|$device|$publicKey"
  }
  fun challenge(hub: String, nonce: String, device: String): String {
    require(uuidPattern.matches(hub) && uuidPattern.matches(device)) { "Invalid identity" }
    // Hub challenges are 32 random bytes, encoded base64url (the schema's 128-character upper bound is also enforced).
    require(nonce.length in 1..128 && !nonce.contains('|') && !nonce.contains('\n') && !nonce.contains('\r')) { "Invalid challenge" }
    return "dude-device-auth:v1|$hub|$nonce|$device"
  }
  fun sign(seed: ByteArray, message: String): ByteArray {
    val key = Ed25519PrivateKeyParameters(seed, 0)
    val signer = Ed25519Signer()
    signer.init(true, key)
    val bytes = message.toByteArray(Charsets.UTF_8)
    signer.update(bytes, 0, bytes.size)
    return signer.generateSignature()
  }
}

/** A Keystore AES-GCM key wraps each Ed25519 seed. Ciphertext stays in Android noBackup storage. */
internal class DeviceIdentity(context: Context) {
  private val root = File(context.noBackupFilesDir, "dude-identities").apply { mkdirs() }
  private val random = SecureRandom()
  private val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  private val refPattern = Regex("^[A-Za-z0-9_-]{43}\\.[0-9a-f-]{36}$")

  @Synchronized fun prepare(environmentId: String, installId: String): String {
    require(uuidPattern.matches(environmentId) && uuidPattern.matches(installId)) { "Invalid key scope" }
    val scope = b64(MessageDigest.getInstance("SHA-256").digest("$environmentId|$installId".toByteArray(Charsets.UTF_8)))
    val ref = "$scope.${UUID.randomUUID()}"
    val alias = alias(ref)
    if (!store.containsAlias(alias)) {
      val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
      generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256).setRandomizedEncryptionRequired(true).build())
      generator.generateKey()
    }
    val seed = ByteArray(32).also { random.nextBytes(it) }
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, wrappingKey(ref))
      cipher.updateAAD(ref.toByteArray(Charsets.UTF_8))
      val encrypted = cipher.doFinal(seed)
      val file = AtomicFile(file(ref))
      val output = file.startWrite()
      try { output.write(byteArrayOf(cipher.iv.size.toByte())); output.write(cipher.iv); output.write(encrypted); file.finishWrite(output) }
      catch (error: Throwable) { file.failWrite(output); throw error }
      return ref
    } catch (error: Throwable) {
      AtomicFile(file(ref)).delete()
      store.deleteEntry(alias)
      throw error
    } finally { seed.fill(0) }
  }
  fun publicKey(ref: String): String = withSeed(ref) { b64(Ed25519PrivateKeyParameters(it, 0).generatePublicKey().encoded) }
  fun signEnrollment(ref: String, hub: String, code: String, device: String): String = withSeed(ref) {
    val publicKey = b64(Ed25519PrivateKeyParameters(it, 0).generatePublicKey().encoded)
    b64(DeviceProof.sign(it, DeviceProof.enrollment(hub, code, device, publicKey)))
  }
  fun signChallenge(ref: String, hub: String, nonce: String, device: String): String = withSeed(ref) { b64(DeviceProof.sign(it, DeviceProof.challenge(hub, nonce, device))) }
  @Synchronized fun delete(ref: String) { AtomicFile(file(ref)).delete(); store.deleteEntry(alias(ref)) }
  fun randomBytes(length: Int): String {
    require(length in 1..128) { "Invalid random byte count" }
    return b64(ByteArray(length).also { random.nextBytes(it) })
  }
  private fun file(ref: String): File { require(refPattern.matches(ref)) { "Invalid key reference" }; return File(root, ref) }
  private fun alias(ref: String): String { file(ref); return "dude.ed25519.wrap.$ref" }
  private fun wrappingKey(ref: String): SecretKey = store.getKey(alias(ref), null) as SecretKey
  private fun <T> withSeed(ref: String, fn: (ByteArray) -> T): T {
    val bytes = AtomicFile(file(ref)).readFully()
    require(bytes.size == 1 + 12 + 32 + 16 && bytes[0].toInt() == 12) { "Invalid wrapped identity" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, wrappingKey(ref), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
    cipher.updateAAD(ref.toByteArray(Charsets.UTF_8))
    val seed = cipher.doFinal(bytes.copyOfRange(13, bytes.size))
    try { return fn(seed) } finally { seed.fill(0) }
  }
}
