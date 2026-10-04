import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const gardens = sqliteTable("gardens", {
  id: text("id").primaryKey(),
  seed: integer("seed").notNull(),
  bornAt: integer("born_at").notNull(),
  version: integer("version").notNull().default(1),
});
