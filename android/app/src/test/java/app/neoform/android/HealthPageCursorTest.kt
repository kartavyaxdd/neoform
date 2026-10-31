package app.neoform.android

import org.junit.Assert.*
import org.junit.Test

class HealthPageCursorTest {
    @Test fun emptyOrNullProviderTokensFinishTheRead() {
        assertNull(HealthPageCursor().next(null))
        assertNull(HealthPageCursor().next(""))
        assertNull(HealthPageCursor().next("  "))
    }
    @Test fun preservesOpaqueTokensAndStopsAfterFinalEmptyPage() {
        val pages = HealthPageCursor()
        assertEquals("opaque-page-2", pages.next("opaque-page-2"))
        assertEquals("opaque-page-3", pages.next("opaque-page-3"))
        assertNull(pages.next(""))
    }
    @Test fun rejectsAProviderRepeatingItsCursorRatherThanLooping() {
        val pages = HealthPageCursor()
        pages.next("same-page")
        try { pages.next("same-page"); fail("Repeated provider cursor must fail") }
        catch (_: IllegalStateException) {}
    }
    @Test fun boundsPaginationEvenWhenEveryReturnedRecordIsFilteredOut() {
        val pages = HealthPageCursor(3)
        pages.next("page-2")
        pages.next("page-3")
        try { pages.next("page-4"); fail("Unbounded provider pagination must fail") }
        catch (_: IllegalStateException) {}
    }
}
