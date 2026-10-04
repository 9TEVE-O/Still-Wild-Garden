package garden.stillwild.companion;

import android.content.Context;
import android.content.SharedPreferences;

final class GardenStore {
    static SharedPreferences preferences(Context context) { return context.getSharedPreferences("stillwild", Context.MODE_PRIVATE); }
    static GardenRecord read(Context context) throws Exception {
        String stored = preferences(context).getString("garden", null);
        return stored == null ? null : GardenRecord.parse(stored);
    }
    static void importOnce(Context context, GardenRecord incoming) throws Exception {
        GardenRecord existing = read(context);
        if (existing != null && !existing.sameAs(incoming)) throw new IllegalArgumentException("This companion already holds a different garden. Your current garden has been kept.");
        if (existing == null && !preferences(context).edit().putString("garden", incoming.fileJson()).commit())
            throw new IllegalStateException("The garden could not be saved. Please try again.");
    }
}
