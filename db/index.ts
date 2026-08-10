import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getD1Database } from "../app/d1";

export async function getDb() {
  const database = await getD1Database();
  return drizzle(database as never, { schema });
}
