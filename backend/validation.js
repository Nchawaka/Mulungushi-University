const { z } = require("zod");

const categories = [
  "classroom", "water", "electricity", "internet", "furniture",
  "building", "cleanliness", "other"
];
const urgencies = ["low", "medium", "high"];

const trimmedString = (min, max, label) =>
  z.string({
    error: `${label} is required.`
  })
    .trim()
    .min(min, `${label} must contain at least ${min} characters.`)
    .max(max, `${label} must contain no more than ${max} characters.`);

const reportSchema = z.object({
  studentName: trimmedString(2, 80, "Student name"),
  email: z.string().trim().min(1, "Email is required.")
    .max(120, "Email must contain no more than 120 characters.")
    .email("Enter a valid email address."),
  phone: z.string().trim().min(9, "Phone number must contain at least 9 characters.")
    .max(20, "Phone number must contain no more than 20 characters.")
    .regex(/^[0-9+() -]{9,20}$/, "Phone number contains unsupported characters."),
  category: z.enum(categories, { error: "Choose a valid report category." }),
  location: trimmedString(3, 100, "Location"),
  dateObserved: z.string().trim().min(1, "Date observed is required.")
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),
      "Enter a valid date in YYYY-MM-DD format."),
  urgency: z.enum(urgencies, { error: "Choose low, medium, or high urgency." }),
  description: trimmedString(10, 1000, "Description"),
  agreement: z.boolean({ error: "You must agree before submitting the report." })
    .refine((value) => value === true, "You must agree before submitting the report.")
});

module.exports = { reportSchema, categories, urgencies };
