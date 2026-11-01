package app.neoform.android
object HealthImportPolicy {
 data class Sleep(val asleep: Double, val awake: Double, val coverage: Double)
 fun sleep(start: Long, end: Long, stages: List<Triple<Long,Long,Int>>): Sleep {
   if (end <= start) return Sleep(0.0,0.0,0.0)
   var previous = start; var asleep = 0L; var awake = 0L
   for ((a,b,type) in stages.sortedBy { it.first }) {
     if (a < previous || a < start || b > end || b <= a) return Sleep(0.0,0.0,0.0)
     previous = b
     if (type in listOf(2,4,5,6)) asleep += b-a
     if (type in listOf(1,3,7)) awake += b-a
   }
   return Sleep(asleep/60000.0, awake/60000.0, (asleep+awake).toDouble()/(end-start))
 }
 fun canCommit(start: Long, current: Long, enabled: Boolean, permitted: Boolean) = start == current && enabled && permitted
 fun retry(attempt: Int) = attempt < 3
}
