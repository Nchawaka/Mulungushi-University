const request = require("supertest");
const { app, reports } = require("../server");

const validReport = {
  studentName: "Aubrey Muwaya",
  email: "student@example.com",
  phone: "+260 971 234 567",
  category: "water",
  location: "Engineering block",
  dateObserved: "2026-10-22",
  urgency: "medium",
  description: "There is a leaking tap outside the laboratory.",
  agreement: true
};

beforeEach(() => {
  reports.length = 0;
});

describe("CampusCare API", () => {
  test("GET /api/health returns service status", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  test("accepts a valid report and returns 201", async () => {
    const response = await request(app).post("/api/reports").send(validReport);
    expect(response.status).toBe(201);
    expect(response.body.report.studentName).toBe("Aubrey Muwaya");
    expect(response.body.report.id).toBeDefined();
  });

  test("rejects an invalid email with structured 422 errors", async () => {
    const response = await request(app)
      .post("/api/reports")
      .send({ ...validReport, email: "not-an-email" });

    expect(response.status).toBe(422);
    expect(response.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(response.body.errors.some((item) => item.field === "email")).toBe(true);
  });

  test("rejects a missing agreement", async () => {
    const { agreement, ...withoutAgreement } = validReport;
    const response = await request(app).post("/api/reports").send(withoutAgreement);
    expect(response.status).toBe(422);
    expect(response.body.errors.some((item) => item.field === "agreement")).toBe(true);
  });

  test("rejects invalid category and short description", async () => {
    const response = await request(app).post("/api/reports").send({
      ...validReport,
      category: "made-up-category",
      description: "bad"
    });
    expect(response.status).toBe(422);
    expect(response.body.errors.length).toBeGreaterThanOrEqual(2);
  });
});
