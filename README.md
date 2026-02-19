# Fanjobo MVP (Railway + Google Drive + Telegram)

## What is implemented
- University Hub: courses, professors, resources, exam tips.
- Industry Hub: projects, roadmaps, jobs, internships.
- Profile + matching engine (rule-based with tags).
- Personal roadmap endpoint.
- File upload API to Google Drive and store file links in database (PostgreSQL or SQLite).
- Telegram bot menu in Persian:
  - `شروع`
  - `تکمیل پروفایل`
  - `دانشگاه`
  - `صنعت`
  - `مسیر من`

## Project structure
- `src/server.js`: API bootstrap + bot launch
- `src/bot.js`: Telegram menu flow
- `src/services/googleDrive.js`: Drive upload integration
- `src/services/recommendation.js`: Rule-based ranking
- `src/routes/*`: API modules
- `sql/init.sql`: PostgreSQL schema + seed data
- `sql/init.sqlite.sql`: SQLite schema + seed data
- `scripts/initDb.js`: DB initializer

## Run locally
1. Install dependencies:
```bash
npm install
```
2. Fill env vars:
```bash
cp .env.example .env
```
3. Set these required env vars:
- `DRIVE_ROOT_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`
- Database defaults to SQLite file in project path: `db/fanjobo.db`
- For admin APIs: set `ADMIN_API_KEY`
- Optional but recommended for strict admin access: `ADMIN_USER_ID`
4. Initialize DB:
```bash
npm run db:init
```
5. Start app:
```bash
npm start
```

## Railway deployment
1. Create a Railway project.
2. Set all env vars from `.env.example`.
3. Default DB is SQLite file (`db/fanjobo.db`) so no external DB service is required.
4. If you need persistence across redeploy/restart on Railway, mount a persistent volume and set `SQLITE_PATH` to the mounted path.
5. For Telegram webhook on Railway set:
- `TELEGRAM_USE_WEBHOOK=true`
- `TELEGRAM_WEBHOOK_DOMAIN=https://<your-railway-domain>`
- Optional: `TELEGRAM_WEBHOOK_PATH=/telegram/webhook/<secret-path>`
6. Deploy. `railway.json` runs:
- `npm run db:init && npm start`

## Telegram webhook mode
- If `TELEGRAM_USE_WEBHOOK=true` (or `TELEGRAM_WEBHOOK_DOMAIN` is set), bot runs in webhook mode.
- Webhook URL will be:
  - `${TELEGRAM_WEBHOOK_DOMAIN}${TELEGRAM_WEBHOOK_PATH}`
  - If path is empty, default path is `/telegram/webhook/<bot-id-prefix>`
- If webhook vars are not set, bot falls back to polling mode (good for local dev).

## Admin web panel
- URL: `/admin` on your deployed domain (example: `https://<railway-domain>/admin`)
- Login inside browser with:
  - `ADMIN_API_KEY`
  - `ADMIN_USER_ID` (if configured)
- Panel features:
  - dashboard stats
  - user search/list
  - full user register from admin panel
  - profile edit/delete for users
  - notifications + moderation queue view

## Google Drive setup (important)
1. Create a Google Cloud project and enable **Google Drive API**.
2. Create a **Service Account**.
3. Generate JSON key.
4. Share your Drive folder(s) with service account email (`Editor` access).
5. Base64-encode JSON key and set as `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.
   - PowerShell:
```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content .\service-account.json -Raw)))
```
6. Put folder ID in:
- `DRIVE_ROOT_FOLDER_ID`
- optional: `DRIVE_UNIVERSITY_FOLDER_ID`
- optional: `DRIVE_INDUSTRY_FOLDER_ID`

## Core APIs
- `GET /health`
- `POST /api/auth/register`
- `POST /api/profile/upsert`
- `GET /api/profile/:userId`
- `POST /api/university/content`
- `GET /api/university/courses`
- `GET /api/university/professors`
- `GET /api/university/resources`
- `GET /api/university/videos`
- `GET /api/university/sample-questions`
- `GET /api/university/summaries`
- `GET /api/university/notes`
- `GET /api/university/books`
- `GET /api/university/exam-tips`
- `GET /api/university/modules?userId=<id>`
- `GET /api/university/my/:userId`
- `GET /api/university/student/dashboard/:userId`
- `GET /api/university/student/term-suggestion/:userId`
- `GET /api/university/student/courses?userId=<id>`
- `GET /api/university/student/courses/:courseCode?userId=<id>`
- `POST /api/university/student/course-chart`
- `POST /api/university/student/term-offerings`
- `POST /api/university/student/passed-courses`
- `GET /api/university/student/professors`
- `GET /api/university/student/professors/:professorName`
- `POST /api/university/student/professors/reviews`
- `POST /api/university/student/professors/reviews/:reviewId/approve`
- `GET /api/university/student/resources`
- `GET /api/university/student/study-plan/:userId`
- `POST /api/university/student/study-plan/tasks`
- `PATCH /api/university/student/study-plan/tasks/:taskId`
- `POST /api/university/student/deadlines`
- `GET /api/university/student/deadlines/:userId`
- `PATCH /api/university/student/deadlines/:deadlineId`
- `POST /api/university/student/qna/questions`
- `GET /api/university/student/qna/questions`
- `GET /api/university/student/qna/questions/:questionId`
- `POST /api/university/student/qna/questions/:questionId/answers`
- `POST /api/university/student/qna/answers/:answerId/vote`
- `POST /api/university/student/qna/answers/:answerId/verify`
- `PATCH /api/university/student/qna/questions/:questionId/resolve`
- `GET /api/industry/paths`
- `GET /api/industry/opportunities`
- `GET /api/industry/projects`
- `GET /api/industry/student/dashboard/:userId`
- `GET /api/industry/student/career-paths`
- `GET /api/industry/student/career-paths/:pathId`
- `GET /api/industry/student/projects`
- `GET /api/industry/student/projects/:projectId?userId=<id>`
- `POST /api/industry/student/projects/:projectId/start`
- `PATCH /api/industry/student/student-projects/:studentProjectId`
- `GET /api/industry/student/opportunities`
- `GET /api/industry/student/opportunities/:opportunityId`
- `POST /api/industry/student/opportunities/:opportunityId/application`
- `POST /api/industry/student/opportunities/:opportunityId/apply`
- `POST /api/industry/student/opportunities/:opportunityId/save`
- `PATCH /api/industry/student/opportunities/:opportunityId/follow-up`
- `GET /api/industry/student/applications/:userId`
- `GET /api/industry/student/saved/:userId`
- `GET /api/industry/student/skills/:userId`
- `POST /api/industry/student/skills/upsert`
- `POST /api/community/submissions`
- `POST /api/community/submissions/university`
- `POST /api/community/submissions/industry`
- `GET /api/community/submissions/meta`
- `GET /api/community/submissions/my/:userId`
- `GET /api/admin/notifications` (`x-admin-key`)
- `GET /api/admin/dashboard/overview` (`x-admin-key`, optional `x-admin-id`)
- `GET /api/admin/users` (`x-admin-key`, optional `x-admin-id`)
- `GET /api/admin/users/:userId` (`x-admin-key`, optional `x-admin-id`)
- `POST /api/admin/users/register` (`x-admin-key`, optional `x-admin-id`)
- `PATCH /api/admin/users/:userId` (`x-admin-key`, optional `x-admin-id`)
- `DELETE /api/admin/users/:userId` (`x-admin-key`, optional `x-admin-id`)
- `POST /api/admin/industry/companies` (`x-admin-key`)
- `POST /api/admin/industry/companies/:companyId/contacts` (`x-admin-key`)
- `POST /api/admin/industry/opportunities` (`x-admin-key`)
- `GET /api/admin/industry/opportunities` (`x-admin-key`)
- `PATCH /api/admin/industry/opportunities/:opportunityId/approval` (`x-admin-key`)
- `PATCH /api/admin/industry/opportunities/:opportunityId/status` (`x-admin-key`)
- `POST /api/admin/industry/projects` (`x-admin-key`)
- `GET /api/admin/industry/projects` (`x-admin-key`)
- `PATCH /api/admin/industry/projects/:projectId/status` (`x-admin-key`)
- `POST /api/admin/industry/projects/:projectId/milestones` (`x-admin-key`)
- `POST /api/admin/industry/milestones/:milestoneId/tasks` (`x-admin-key`)
- `POST /api/admin/industry/career-paths` (`x-admin-key`)
- `POST /api/admin/industry/skills` (`x-admin-key`)
- `POST /api/admin/industry/skill-requirements` (`x-admin-key`)
- `POST /api/admin/industry/roadmaps` (`x-admin-key`)
- `POST /api/admin/industry/roadmaps/:roadmapId/steps` (`x-admin-key`)
- `POST /api/admin/industry/roadmaps/:roadmapId/checklist` (`x-admin-key`)
- `GET /api/admin/industry/applications` (`x-admin-key`)
- `PATCH /api/admin/industry/applications/:applicationId/status` (`x-admin-key`)
- `GET /api/admin/content` (`x-admin-key`)
- `PATCH /api/admin/content/:contentId/publish` (`x-admin-key`)
- `GET /api/admin/moderation/submissions?status=&section=&contentKind=` (`x-admin-key`)
- `POST /api/admin/moderation/submissions/:submissionId/review` (`x-admin-key`)
- `GET /api/recommendations/:userId`
- `GET /api/roadmap/:userId`
- `POST /api/files/upload` (multipart form-data)

## Upload example
- Endpoint: `POST /api/files/upload`
- Form fields:
  - `contentId` (number)
  - `contentType` (`university` or `industry`)
  - `makePublic` (`true` or `false`)
  - `file` (binary)

## University student module
- Dashboard includes: current term overview, suggested term courses, upcoming deadlines, personal suggestions.
- Course section includes: course page with notes/books/resources/exam tips and study path.
- Professor section includes: reviews + quality metrics with approval flow.
- Resource section includes: search, tags filter, quality ranking, recency sorting.
- Study plan includes: weekly/daily task list and checklist progress.
- Q&A includes: questions, answers, votes, verified answers.
- Term suggestion is API-ready based on: passed courses + course chart + term offerings.

## Industry student module
- Main dashboard returns:
  - 3 profile-matched opportunities (job/internship/project-based)
  - 2 recommended portfolio projects
  - 1 short roadmap
- Career paths include required skills + sample projects + junior-ready checklist.
- Projects include industry/portfolio/open-source with milestones/tasks/student progress.
- Opportunities include filters + apply/save/follow-up workflow.
- Skill-based matching is built-in for opportunity/project ranking.

## Admin and moderation
- Admin APIs are protected by `x-admin-key` using `ADMIN_API_KEY`.
- If `ADMIN_USER_ID` is set, admin APIs also require `x-admin-id` to match it.
- Admin can create/approve/close opportunities, add projects/career paths/roadmaps/checklists, and publish/unpublish contents.
- Students can submit notes/books/resources/videos/sample-questions/summaries.
- Submission pre-filters run before saving (quality + banned words + link validation).
- Every pending submission creates an admin notification for review.
