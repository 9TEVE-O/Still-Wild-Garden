package garden.stillwild.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class GardenRecordTest {
    @Test public void readsActualWebsiteExport() throws Exception {
        try (java.io.InputStream input = getClass().getResourceAsStream("/web-export.json")) {
            assertNotNull(input);
            GardenRecord garden = GardenRecord.parse(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            assertEquals(4294967295L, garden.seed); assertEquals(1790290000123L, garden.bornAt);
        }
    }
    private String file(String seed, String bornAt) {
        return "{\"format\":\"stillwild-garden\",\"formatVersion\":1,\"garden\":{\"version\":1,\"seed\":" + seed + ",\"bornAt\":" + bornAt + "}}";
    }
    @Test public void preservesOriginalIdentityAndUint32() throws Exception {
        GardenRecord record = GardenRecord.parse(file("4294967295", "1790290000123"));
        assertEquals(4294967295L, record.seed); assertEquals(1790290000123L, record.bornAt);
        assertTrue(record.sameAs(GardenRecord.parse(record.fileJson())));
        assertFalse(record.sameAs(GardenRecord.parse(file("1", "1790290000123"))));
        assertFalse(record.sameAs(GardenRecord.parse(file("4294967295", "1790290000124"))));
    }
    @Test public void acceptsZeroWithoutSubstitutingRandomSeed() throws Exception {
        assertEquals(0L, GardenRecord.parse(file("0", "0")).seed);
    }
    @Test public void rejectsWrongTypeVersionRangesAndGift() {
        String[] invalid = {
            file("-1", "1"), file("4294967296", "1"), file("1.5", "1"), file("\"1\"", "1"), file("true", "1"),
            file("1", "-1"), file("1", "8640000000000001"), file("1", "1.1"), file("1", "1e309"),
            file("1", "1").replace("\"version\":1", "\"version\":2"), file("1", "1").replace("\"formatVersion\":1", "\"formatVersion\":2"),
            file("1", "1").replace("\"seed\":1", "\"seed\":1,\"parentSeed\":2"), "<html>A descendant gift</html>",
            "{\"seed\":1,\"bornAt\":1,\"version\":1}", " ".repeat(4097)
        };
        for (String input : invalid) assertThrows(Exception.class, () -> GardenRecord.parse(input));
    }
}
