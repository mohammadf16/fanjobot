const { z } = require("zod");

const skillLevelEnum = z.enum(["beginner", "intermediate", "advanced"]);
const contentTypeEnum = z.enum(["university", "industry"]);
const contentKindEnum = z.enum([
  "course",
  "professor",
  "resource",
  "note",
  "book",
  "video",
  "sample-question",
  "summary",
  "exam-tip",
  "project",
  "internship",
  "job",
  "roadmap"
]);

const registerSchema = z.object({
  fullName: z.string().min(2),
  phoneOrEmail: z.string().min(3),
  telegramId: z.string().optional()
});

const profileSchema = z.object({
  userId: z.coerce.number().int().positive(),
  university: z.string().optional(),
  city: z.string().optional(),
  major: z.string().min(2),
  level: z.string().min(2),
  term: z.string().min(1),
  interests: z.array(z.string()).default([]),
  skillLevel: skillLevelEnum,
  shortTermGoal: z.string().min(2),
  weeklyHours: z.coerce.number().int().min(1).max(80),
  resumeUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
  skills: z.array(z.object({ name: z.string(), score: z.number().min(1).max(10) })).default([]),
  passedCourses: z.array(z.string()).default([])
});

const contentSchema = z.object({
  createdByUserId: z.coerce.number().int().positive(),
  title: z.string().min(2),
  description: z.string().min(5),
  type: contentTypeEnum,
  kind: contentKindEnum,
  major: z.string().optional(),
  term: z.string().optional(),
  skillLevel: skillLevelEnum.default("beginner"),
  tags: z.array(z.string()).default([]),
  estimatedHours: z.coerce.number().int().positive().optional(),
  isPublished: z.boolean().default(true)
});

module.exports = {
  registerSchema,
  profileSchema,
  contentSchema
};
