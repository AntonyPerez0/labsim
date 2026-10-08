/**
 * Built-in executable practicals (Cur §5.3) for CERT-R1…R5. Content texts live in `EXAMS_BY_ID`; these are
 * the playable halves keyed by the same ids. R4/R5 run certification shifts (GP §2.3.12). Authored
 * practicals registered through `registerPracticals` (content team) replace these.
 */
import { pick } from "@/core/rng";
import type { CertPracticalDef, PracticalTaskDef } from "../../types";
import { c, on, p } from "../../types";

const TOUCH_P1 = ["wall-e", "eve", "bumblebee"] as const;

/** Practical task plus the runtime-only extension: an incident ticket opened for the task (escalation tasks). */
export type BuiltInTask = PracticalTaskDef & { spawnIncident?: string };

const playerPressed = (allowed: string) =>
  on(
    "rig.command",
    {},
    (pl) => pl.actor === "player" && pl.command !== allowed,
  );

const P2_1: BuiltInTask = {
  id: "P2-1",
  examId: "CERT-R2",
  spawnIncident: "INC01",
  setup: {},
  pass: c.eq(p.ticket.status, "resolved"),
  failIf: c.happened(on("gw.triggered", { gwId: "GW24" })),
  timeLimitGameMin: 8,
};

export const BUILT_IN_PRACTICALS: readonly CertPracticalDef[] = [
  {
    examId: "CERT-R1",
    kind: "tasks",
    maxStrikes: 0,
    tasks: [
      {
        id: "P1-1",
        examId: "CERT-R1",
        setup: {
          run: (sim, ctx) => {
            const rig = pick(ctx.rng, TOUCH_P1);
            sim.rig.pushHead(rig, 40, 25, "system");
          },
        },
        pass: c.forAll(TOUCH_P1, (r) => c.eq(p.rig(r).banner, "GREEN")),
        failIf: c.happened(playerPressed("park.all")),
        objectives: [
          {
            id: "P1-1.o1",
            text: "Find the rig with the yellow banner and Park All",
            done: c.forAll(TOUCH_P1, (r) => c.eq(p.rig(r).banner, "GREEN")),
          },
        ],
        timeLimitGameMin: 3,
      } satisfies BuiltInTask,
      {
        id: "P1-2",
        examId: "CERT-R1",
        setup: {
          scenario: [{ faultId: "fuse.blown", params: { fuse: "F-RACKB-5V" } }],
        },
        pass: c.all(
          c.eq(p.fuse("F-RACKB-5V").state, "OK"),
          c.forAll(["pi-johnny-5", "pi-baymax", "pi-seti", "pi-rosie"], (h) =>
            c.eq(p.pi(h).power, "ON"),
          ),
          c.never(
            c.happened(
              on(
                "gw.triggered",
                {},
                (pl) => pl.gwId === "GW01" || pl.gwId === "GW02",
              ),
            ),
          ),
        ),
        failIf: c.happened(
          on(
            "gw.triggered",
            {},
            (pl) => pl.gwId === "GW01" || pl.gwId === "GW02",
          ),
        ),
        timeLimitGameMin: 8,
      } satisfies BuiltInTask,
      {
        id: "P1-3",
        examId: "CERT-R1",
        setup: {},
        pass: c.all(
          c.eq(p.v("answer:P1-3"), "200"),
          c.happened(
            on(
              "terminal.command",
              {},
              (pl) => /curl/.test(pl.line) && /:8000\/health/.test(pl.line),
            ),
          ),
        ),
        answerForm: {
          prompt: "HTTP status code returned by the health endpoint",
          accepted: ["200"],
        },
        timeLimitGameMin: 5,
      } satisfies BuiltInTask,
    ],
  },
  {
    examId: "CERT-R2",
    kind: "tasks",
    maxStrikes: 0,
    tasks: [
      P2_1,
      {
        id: "P2-2",
        examId: "CERT-R2",
        setup: {
          scenario: [
            { op: "device.swap", params: { rig: "johnny-5", type: "FLEX_2" } },
          ],
        },
        pass: c.all(
          c.eq(p.device("johnny-5-flex1").exists, true),
          c.neq(p.robot("johnny-5").deviceId, "johnny-5-flex1"),
          c.eq(p.robot("johnny-5").hrn, "JOHNNY-5"),
        ),
        failIf: c.happened(
          on(
            "gw.triggered",
            {},
            (pl) =>
              pl.gwId === "GW09" || pl.gwId === "GW10" || pl.gwId === "GW22",
          ),
        ),
        timeLimitGameMin: 6,
      } satisfies BuiltInTask,
      {
        id: "P2-3",
        examId: "CERT-R2",
        setup: { flags: { receiptQrFeature: true } },
        pass: c.all(
          c.eq(p.pr("gort").state, "MERGED"),
          c.happened(
            on("orca.screenLocationsSynced", {}, (pl) =>
              /RECEIPT_OPTIONS_5/i.test(pl.screen),
            ),
          ),
        ),
        failIf: c.happened(on("gw.triggered", { gwId: "GW18" })),
        timeLimitGameMin: 8,
      } satisfies BuiltInTask,
      {
        id: "P2-4",
        examId: "CERT-R2",
        setup: {},
        pass: c.nextBuild({
          robots: ["seti"],
          params: { CARD_PROFILE: "INTERAC_CA_DIP" },
        }),
        timeLimitGameMin: 6,
      } satisfies BuiltInTask,
    ],
  },
  {
    examId: "CERT-R3",
    kind: "tasks",
    maxStrikes: 0,
    tasks: [
      {
        id: "P3-1",
        examId: "CERT-R3",
        setup: {},
        pass: c.all(
          c.eq(p.prop("config", "portNumber"), "5444"),
          c.eq(p.prop("config", "theme"), "avocado"),
          c.eq(p.prop("config", "kernelType"), "CPA"),
          c.eq(p.localRun("TaxTest").result, "PASS"),
          c.eq(p.localRun("TaxTest").overlappedJenkins, false),
          c.always(c.eq(p.coworkerIdle(), true)),
        ),
        failIf: c.happened(
          on(
            "gw.triggered",
            {},
            (pl) => pl.gwId === "GW08" || pl.gwId === "GW23",
          ),
        ),
        timeLimitGameMin: 10,
      } satisfies BuiltInTask,
      {
        id: "P3-2",
        examId: "CERT-R3",
        setup: {},
        pass: c.all(
          c.eq(p.job("Java/pigeon-android-sale-swipe").lastResult, "SUCCESS"),
          c.eq(p.pr("gort").verdict, "APPROVE"),
        ),
        timeLimitGameMin: 9,
      } satisfies BuiltInTask,
      {
        id: "P3-3",
        examId: "CERT-R3",
        setup: { flags: { cfdLayoutV2Toggle: true } },
        pass: c.all(
          c.eq(p.localRun("TaxTestDuo").result, "PASS"),
          c.eq(p.codeFact("displayId", "TaxTestDuo"), true),
        ),
        timeLimitGameMin: 8,
      } satisfies BuiltInTask,
      {
        id: "P3-4",
        examId: "CERT-R3",
        setup: {},
        pass: c.all(
          c.gte(p.localRun("ReceiptScreenTest").streak, 3),
          c.eq(p.codeFact("waitForScreen", "ReceiptScreen"), true),
        ),
        timeLimitGameMin: 8,
      } satisfies BuiltInTask,
    ],
  },
  {
    examId: "CERT-R4",
    kind: "shift",
    shiftConfigId: "cert-r4",
    incidents: 5,
    gameMinutes: 20,
    maxStrikes: 1,
    hudObjectives: true,
    requireCategories: ["hardware", "orca", "code-config"],
  },
  {
    examId: "CERT-R5",
    kind: "shift",
    shiftConfigId: "cert-r5",
    incidents: 8,
    gameMinutes: 30,
    maxStrikes: 0,
    simultaneousAtGameMin: 10,
    hudObjectives: false,
  },
];
