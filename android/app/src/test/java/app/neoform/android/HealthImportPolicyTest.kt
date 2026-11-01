package app.neoform.android
import org.junit.Assert.*
import org.junit.Test
class HealthImportPolicyTest {
 @Test fun stagesCannotOverlapOrInventAsleepTime() {
   val s = HealthImportPolicy.sleep(0, 600000, listOf(Triple(0L,300000L,2), Triple(300000L,600000L,1)))
   assertEquals(5.0, s.asleep, .001); assertEquals(5.0,s.awake,.001); assertEquals(1.0,s.coverage,.001)
   assertEquals(0.0,HealthImportPolicy.sleep(0,600000,listOf(Triple(0L,400000L,2),Triple(300000L,600000L,4))).coverage,.001)
 }
 @Test fun unknownStagesAndMissingRangesDoNotBecomeSleep() {
   val s = HealthImportPolicy.sleep(0,600000,listOf(Triple(0L,300000L,0),Triple(300000L,600000L,2)))
   assertEquals(.5,s.coverage,.001); assertEquals(5.0,s.asleep,.001)
 }
 @Test fun cancellationAndEnrollmentFenceEveryWrite() {
   assertTrue(HealthImportPolicy.canCommit(2,2,true,true))
   assertFalse(HealthImportPolicy.canCommit(2,3,true,true))
   assertFalse(HealthImportPolicy.canCommit(2,2,false,true))
   assertFalse(HealthImportPolicy.canCommit(2,2,true,false))
 }
 @Test fun retriesAreBoundedAndNoNetworkIsRequiredForLocalReads() {
   assertTrue(HealthImportPolicy.retry(0)); assertTrue(HealthImportPolicy.retry(2)); assertFalse(HealthImportPolicy.retry(3))
 }
}
