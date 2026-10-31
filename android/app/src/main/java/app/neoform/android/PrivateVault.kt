package app.neoform.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Private app storage, encrypted with a non-exportable Android Keystore key. Never backed up. */
class PrivateVault(private val context: Context) {
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("neoform-private-v1", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("neoform-private-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    @Synchronized fun read(name: String): JSONObject? {
        val file = java.io.File(context.noBackupFilesDir, "$name.enc")
        if (!file.exists()) return null
        val bytes = file.readBytes()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
    }
    @Synchronized fun write(name: String, value: JSONObject) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val file = java.io.File(context.noBackupFilesDir, "$name.enc")
        val tmp = java.io.File(context.noBackupFilesDir, "$name.tmp")
        tmp.outputStream().use { it.write(cipher.iv + cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8))); it.flush() }
        check(tmp.renameTo(file)) { "Private storage unavailable" }
    }
    @Synchronized fun delete(name: String) { java.io.File(context.noBackupFilesDir, "$name.enc").delete() }
}
