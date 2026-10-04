package garden.stillwild.companion;

import org.json.JSONObject;
import java.util.Iterator;
import java.util.Set;
import java.util.Arrays;
import java.util.HashSet;

/** Immutable v1 identity. Never generates, resets or substitutes a seed. */
public final class GardenRecord {
    public static final int MAX_BYTES = 4096;
    public final long seed;
    public final long bornAt;

    private GardenRecord(long seed, long bornAt) { this.seed = seed; this.bornAt = bornAt; }

    public static GardenRecord parse(String text) throws Exception {
        if (text == null || text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_BYTES)
            throw new IllegalArgumentException("This garden file is too large.");
        JSONObject root = new JSONObject(text);
        keys(root, new HashSet<>(Arrays.asList("format", "formatVersion", "garden")));
        if (!"stillwild-garden".equals(root.get("format")) || number(root, "formatVersion", 1, 1) != 1)
            throw new IllegalArgumentException("Use Save for Android on your Stillwild website.");
        JSONObject garden = root.getJSONObject("garden");
        keys(garden, new HashSet<>(Arrays.asList("version", "seed", "bornAt")));
        number(garden, "version", 1, 1);
        return new GardenRecord(number(garden, "seed", 0, 0xffffffffL), number(garden, "bornAt", 0, 8640000000000000L));
    }

    private static long number(JSONObject object, String key, long min, long max) throws Exception {
        Object raw = object.get(key);
        if (!(raw instanceof Number)) throw new IllegalArgumentException("Invalid garden field: " + key);
        double d = ((Number) raw).doubleValue();
        long n = ((Number) raw).longValue();
        if (!Double.isFinite(d) || d != (double) n || n < min || n > max)
            throw new IllegalArgumentException("Unsupported garden field: " + key);
        return n;
    }

    private static void keys(JSONObject value, Set<String> allowed) throws Exception {
        if (value.length() != allowed.size()) throw new IllegalArgumentException("Unexpected garden fields.");
        Iterator<String> keys = value.keys();
        while (keys.hasNext()) if (!allowed.contains(keys.next())) throw new IllegalArgumentException("Unexpected garden fields.");
    }

    public String gardenJson() { return "{\"version\":1,\"seed\":" + seed + ",\"bornAt\":" + bornAt + "}"; }
    public String fileJson() { return "{\"format\":\"stillwild-garden\",\"formatVersion\":1,\"garden\":" + gardenJson() + "}"; }
    public boolean sameAs(GardenRecord other) { return other != null && other.seed == seed && other.bornAt == bornAt; }
}
