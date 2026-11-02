import type { Context, Next } from "hono";
import type { AppEnv } from "../types/hono";

export const requireAdmin = async (c: Context<AppEnv>, next: Next) => {
  if (c.get("auth").role !== "admin") return c.json({ error: "Doar administratorii cabinetului pot face această operație" }, 403);
  await next();
};
