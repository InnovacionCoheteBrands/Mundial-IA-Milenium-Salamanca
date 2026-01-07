import { users, transformations, type User, type InsertUser, type Transformation, type InsertTransformation } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getAllTransformations(): Promise<Transformation[]>;
  getTransformation(id: number): Promise<Transformation | undefined>;
  createTransformation(transformation: InsertTransformation): Promise<Transformation>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getAllTransformations(): Promise<Transformation[]> {
    return db.select().from(transformations).orderBy(desc(transformations.createdAt));
  }

  async getTransformation(id: number): Promise<Transformation | undefined> {
    const [transformation] = await db.select().from(transformations).where(eq(transformations.id, id));
    return transformation || undefined;
  }

  async createTransformation(insertTransformation: InsertTransformation): Promise<Transformation> {
    const [transformation] = await db
      .insert(transformations)
      .values(insertTransformation)
      .returning();
    return transformation;
  }
}

export const storage = new DatabaseStorage();
