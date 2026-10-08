/**
 * Mission authoring contract — everything lesson, incident, drill, shift, certification and
 * achievement authors need, re-exported from `./contract/*`:
 *
 *   common.ts       ids (LocationId, PropId, AppId), Templated text, IncidentBinding, SetupSpec,
 *                   ScriptAction, HintDef, GhostAction, WalkthroughCue
 *   conditions.ts   Condition / Probe / EventMatcher data + builders `p`, `c`, `on`;
 *                   DeferredTrigger ("next health check" / "next build"), ConditionContext, ObjectiveDef
 *   lesson.ts       LessonDef, LessonStep union (13 kinds), DialogueChoice, WrongActionDef,
 *                   ACADEMY_HINT_DEFAULTS, ACADEMY_STEP_XP
 *   incident.ts     IncidentDef (GP §3.4), variants, Diagnosis Call, replies, tasks, escalation,
 *                   RoleTag/RigSpec/BindContext, GlobalWrongActionDef, ProcessBonusDef
 *   arcade.ts       ShiftConfig, ShiftStartOptions, HeatRow, PipelineDef, ShiftEventDef,
 *                   DailyChallengeInfo, DrillDef, DrillItem, DrillVerdict, DrillFeedback, DrillComponentProps
 *   progression.ts  CareerRankDef, XpSource, AchievementRule, CertificationDef, PracticalTaskDef
 *
 * Runtime state shapes (tickets, shift, academy run, drills, cert, progress) live in `@/core/state`.
 *
 *   import { c, p, on, type IncidentDef, type LessonDef } from '@/missions/types';
 */
export * from './contract/common';
export * from './contract/conditions';
export * from './contract/lesson';
export * from './contract/incident';
export * from './contract/arcade';
export * from './contract/progression';
