import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (existing)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Teams enum
export const TEAMS = [
  "mexico",
  "usa",
  "canada", 
  "spain",
  "england",
  "brazil",
  "argentina",
  "portugal"
] as const;

export type TeamId = typeof TEAMS[number];

export const teamInfo: Record<TeamId, { name: string; flag: string; colors: { primary: string; secondary: string } }> = {
  mexico: { name: "México", flag: "🇲🇽", colors: { primary: "#006847", secondary: "#CE1126" } },
  usa: { name: "Estados Unidos", flag: "🇺🇸", colors: { primary: "#002868", secondary: "#BF0A30" } },
  canada: { name: "Canadá", flag: "🇨🇦", colors: { primary: "#FF0000", secondary: "#FFFFFF" } },
  spain: { name: "España", flag: "🇪🇸", colors: { primary: "#AA151B", secondary: "#F1BF00" } },
  england: { name: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", colors: { primary: "#FFFFFF", secondary: "#CF081F" } },
  brazil: { name: "Brasil", flag: "🇧🇷", colors: { primary: "#009C3B", secondary: "#FFDF00" } },
  argentina: { name: "Argentina", flag: "🇦🇷", colors: { primary: "#75AADB", secondary: "#FFFFFF" } },
  portugal: { name: "Portugal", flag: "🇵🇹", colors: { primary: "#006600", secondary: "#FF0000" } },
};

// Transformations table
export const transformations = pgTable("transformations", {
  id: serial("id").primaryKey(),
  team: text("team").notNull(),
  originalImageUrl: text("original_image_url").notNull(),
  transformedImageUrl: text("transformed_image_url").notNull(),
  promptUsed: text("prompt_used"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTransformationSchema = createInsertSchema(transformations).omit({
  id: true,
  createdAt: true,
});

export type InsertTransformation = z.infer<typeof insertTransformationSchema>;
export type Transformation = typeof transformations.$inferSelect;
