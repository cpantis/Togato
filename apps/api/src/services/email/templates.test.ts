import { describe, expect, it } from "vitest";
import { escapeHtml, templates } from "./templates";
import { backoffMs } from "../../jobs/queue";

describe("șabloanele de email", () => {
  it("escapează valorile introduse de utilizatori", () => {
    expect(escapeHtml(`<script>"x"&'y'`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;");
    const m = templates.invitation({ to: "a@b.ro", orgName: "<Cabinet>", inviterName: "Ana", url: "https://t.ro/invite/abc", expiresDays: 7 });
    expect(m.html).toContain("&lt;Cabinet&gt;");
    expect(m.html).not.toContain("<Cabinet>");
    expect(m.text).toContain("https://t.ro/invite/abc");
  });
  it("textul simplu nu conține etichete HTML", () => {
    const m = templates.portalSubmission({ to: "a@b.ro", clientName: "C", systemName: "S", submittedBy: "Ion", url: "https://t.ro/x", needsBiometricReview: true });
    expect(m.text).not.toMatch(/<[a-z]/i);
    expect(m.text).toContain("biometrice");
  });
  it("rezumatul termenelor marchează termenele depășite", () => {
    const m = templates.deadlineDigest({ to: "a@b.ro", name: "Ana", dashboardUrl: "https://t.ro/dashboard", items: [{ client: "C", title: "FRIA", dueDate: "2026-01-01", overdue: true, url: "x" }] });
    expect(m.text).toContain("DEPĂȘIT");
  });
});

describe("reîncercări", () => {
  it("întârziere exponențială, plafonată", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(20)).toBe(6 * 3600_000);
  });
});
