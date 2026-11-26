import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user, member } from "./auth";
import { job } from "./jobs";
import { application } from "./jobs";

// ============================================
// Interview Type Constants
// ============================================

export const INTERVIEW_TYPE = {
	ONLINE: "online",
	PHYSICAL: "physical",
	// v3: the redesign's third interview mode.
	PHONE: "phone",
} as const;

export type InterviewType = (typeof INTERVIEW_TYPE)[keyof typeof INTERVIEW_TYPE];

// ============================================
// Interview Status Constants
// ============================================

export const INTERVIEW_RESULT = {
	PENDING: "pending",
	PASSED: "passed",
	FAILED: "failed",
	NO_SHOW: "no_show",
} as const;

export const CANDIDATE_RESPONSE = {
	PENDING: "pending",
	ACCEPTED: "accepted",
	DECLINED: "declined",
	// v3: the redesign lets a candidate ask for another time.
	RESCHEDULE_REQUESTED: "reschedule_requested",
} as const;

export type CandidateResponse = (typeof CANDIDATE_RESPONSE)[keyof typeof CANDIDATE_RESPONSE];

export type InterviewResult = (typeof INTERVIEW_RESULT)[keyof typeof INTERVIEW_RESULT];

// ============================================
// Interviews Table
// ============================================

export const interviews = sqliteTable(
	"interviews",
	{
		id: text("id").primaryKey(),
		candidateId: text("candidate_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		applicationId: text("application_id")
			.references(() => application.id, { onDelete: "cascade" }),
		scheduledAt: text("scheduled_at").notNull(),
		scheduledBy: text("scheduled_by").references(() => user.id, { onDelete: "cascade" }),
		interviewDuration: integer("interview_duration"), // Duration in minutes
		meetingLink: text("meeting_link"), // For online interviews
		location: text("location"), // For physical interviews
		mapUrl: text("map_url"), // Google Maps URL for physical location
		interviewType: text("interview_type").notNull().default(INTERVIEW_TYPE.ONLINE), // online or physical
		panel: text("panel"), // Panel/interviewer name or ID
		remarks: text("remarks"), // Additional notes/remarks about the interview
		applicationFormUrl: text("application_form_url"), // URL to attached application form PDF
		result: text("result").notNull().default(INTERVIEW_RESULT.PENDING),
		candidateResponse: text("candidate_response").notNull().default(CANDIDATE_RESPONSE.PENDING),
		evaluationScore: integer("overall_score"),
		createdAt: text("created_at")
			.default(sql`(datetime('now', '+8 hours'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now', '+8 hours'))`)
			.$onUpdate(() => sql`datetime('now', '+8 hours')`)
			.notNull(),
	},
	(table) => [
		index("interviews_candidateId_idx").on(table.candidateId),
		index("interviews_jobId_idx").on(table.jobId),
		index("interviews_scheduledAt_idx").on(table.scheduledAt),
		index("interviews_result_idx").on(table.result),
	],
);

// ============================================
// Interview Panel Table (Pivot Table)
// ============================================

export const interviewPanel = sqliteTable(
	"interview_panel",
	{
		id: text("id").primaryKey(),
		interviewId: text("interview_id")
			.notNull()
			.references(() => interviews.id, { onDelete: "cascade" }),
		interviewerId: text("interviewer_id")
			.references(() => user.id, { onDelete: "cascade" }),
		memberId: text("member_id")
			.references(() => member.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("panel"),
		createdAt: text("created_at")
			.default(sql`(datetime('now', '+8 hours'))`)
			.notNull(),
	},
	(table) => [
		index("interviewPanel_interviewId_idx").on(table.interviewId),
		index("interviewPanel_interviewerId_idx").on(table.interviewerId),
		index("interviewPanel_memberId_idx").on(table.memberId),
	],
);

// ============================================
// Interview Invitations Table
// ============================================

export const interviewInvitations = sqliteTable(
	"interview_invitations",
	{
		id: text("id").primaryKey(),
		interviewId: text("interview_id")
			.notNull()
			.references(() => interviews.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		invitedBy: text("invited_by").notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: text("status").notNull().default("pending"), // pending / accepted / expired
		jobseekerId: text("jobseeker_id")
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("panel"),
		acceptedAt: text("accepted_at"),
		declinedAt: text("declined_at"),
		createdAt: text("created_at")
			.default(sql`(datetime('now', '+8 hours'))`)
			.notNull(),
	},
	(table) => [
		index("interviewInvitations_interviewId_idx").on(table.interviewId),
		index("interviewInvitations_invitedBy_idx").on(table.invitedBy),
	],
);

// ============================================
// Relations
// ============================================

export const interviewsRelations = relations(interviews, ({ one, many }) => ({
	candidate: one(user, {
		fields: [interviews.candidateId],
		references: [user.id],
		relationName: "candidate",
	}),
	job: one(job, {
		fields: [interviews.jobId],
		references: [job.id],
	}),
	panel: many(interviewPanel),
	// v1 also lists evaluationSubmissions here; v3 adds it back with the
	// evaluation forms (forms.ts).
}));

export const interviewPanelRelations = relations(interviewPanel, ({ one }) => ({
	interview: one(interviews, {
		fields: [interviewPanel.interviewId],
		references: [interviews.id],
	}),
	interviewer: one(user, {
		fields: [interviewPanel.interviewerId],
		references: [user.id],
		relationName: "interviewer",
	}),
	panelMember: one(member, {
		fields: [interviewPanel.memberId],
		references: [member.id],
	}),
}));

