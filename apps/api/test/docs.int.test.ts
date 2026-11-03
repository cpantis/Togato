import { describe, expect, it } from "vitest";
import fs from "fs";
import { app } from "../src/app";
import { ROUTES_DOC, routesMarkdown } from "../src/scripts/routesDoc";

describe("documentația API", () => {
  it("docs/api-routes.md corespunde rutelor din cod (regenerați cu npm run docs:routes -w @togato/api)", () => {
    expect(fs.readFileSync(ROUTES_DOC, "utf-8")).toBe(routesMarkdown(app.routes));
  });
});
