package app.neoform.android

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import java.io.File
import java.security.MessageDigest

internal object UpdateArchive {
    fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    fun identity(info: PackageInfo) = UpdateIdentity(info.packageName,info.versionName ?: "",info.longVersionCode,
        info.signingInfo?.apkContentsSigners?.map { hash(it.toByteArray()) }?.toSet() ?: emptySet())
    fun installed(context: Context) = identity(context.packageManager.getPackageInfo(context.packageName,PackageManager.GET_SIGNING_CERTIFICATES))
    fun verified(context: Context, file: File, release: UpdateRelease, installed: UpdateIdentity): Boolean {
        if (!file.isFile || file.length()!=release.bytes) return false
        val digest=MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input -> val bytes=ByteArray(32768); while(true) { val n=input.read(bytes); if(n<0) break; digest.update(bytes,0,n) } }
        val sha=digest.digest().joinToString("") { "%02x".format(it) }
        if (!UpdatePolicy.integrity(release,file.length(),sha)) return false
        val info=context.packageManager.getPackageArchiveInfo(file.absolutePath,PackageManager.GET_SIGNING_CERTIFICATES) ?: return false
        return UpdatePolicy.accepts(installed,identity(info),release)
    }
}
