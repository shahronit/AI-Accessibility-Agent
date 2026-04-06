"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, Loader2, Ticket } from "lucide-react";
import { useScanSession } from "@/components/ScanSessionProvider";
import { TestingHero } from "@/components/TestingHero";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ManualTestCase } from "@/lib/manualTestScenario";
import type { ScanIssue } from "@/lib/axeScanner";

type TestTool = "generic" | "xray" | "zephyr";

const TEST_MANAGEMENT_OPTIONS: {
  value: TestTool;
  label: string;
  description: string;
}[] = [
  {
    value: "generic",
    label: "Generic Jira",
    description: "Standard sections—works in any Jira project without Xray or Zephyr.",
  },
  {
    value: "xray",
    label: "Xray",
    description: "Manual test wording (definitions, procedure, expected result) suited to Xray-style Test issues.",
  },
  {
    value: "zephyr",
    label: "Zephyr Squad",
    description: "Objective, test script, and expected outcome blocks aligned with Zephyr Squad habits.",
  },
];

export function TestingScenariosClient() {
  const { scannedUrl, issues } = useScanSession();
  const [testCases, setTestCases] = useState<ManualTestCase[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [testTool, setTestTool] = useState<TestTool>("generic");
  const [model, setModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraMessage, setJiraMessage] = useState<string | null>(null);

  useEffect(() => {
    if (testCases.length === 0) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(testCases.map((_, i) => i)));
  }, [testCases]);

  const allSelected = testCases.length > 0 && selected.size === testCases.length;
  const someSelected = selected.size > 0 && selected.size < testCases.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected]);

  const toggleRow = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (testCases.length === 0) return prev;
      if (prev.size === testCases.length) return new Set();
      return new Set(testCases.map((_, i) => i));
    });
  }, [testCases]);

  const generate = useCallback(async () => {
    if (!scannedUrl?.trim()) return;
    setLoading(true);
    setError(null);
    setJiraMessage(null);
    setModel(null);
    try {
      const res = await fetch("/api/testing-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scannedUrl: scannedUrl.trim(),
          issues: issues as ScanIssue[],
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        testCases?: ManualTestCase[];
        model?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }
      if (!data.testCases?.length) {
        throw new Error("No test cases returned.");
      }
      setTestCases(data.testCases);
      setModel(typeof data.model === "string" ? data.model : null);
    } catch (e) {
      setTestCases([]);
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [scannedUrl, issues]);

  const selectedCount = selected.size;

  const sendToJira = useCallback(async () => {
    if (!scannedUrl?.trim() || selected.size === 0) return;
    const cases = testCases.filter((_, i) => selected.has(i));
    if (cases.length === 0) return;
    setJiraLoading(true);
    setJiraMessage(null);
    try {
      const res = await fetch("/api/jira-test-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scannedUrl: scannedUrl.trim(),
          testCases: cases,
          testTool,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        url?: string;
        key?: string;
        mock?: boolean;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Jira request failed");
      }
      setJiraMessage(
        data.url
          ? `${data.mock ? "Logged (mock): " : "Created "}${data.key ?? ""} — ${data.url}`
          : (data.message ?? "Submitted."),
      );
    } catch (e) {
      setJiraMessage(e instanceof Error ? e.message : "Jira failed");
    } finally {
      setJiraLoading(false);
    }
  }, [scannedUrl, testCases, selected, testTool]);

  const canGenerate = Boolean(scannedUrl?.trim());

  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="clipboardCheck"
        title="Testing Scenarios"
        accentClass="from-emerald-600/22 via-card/95 to-slate-950/40"
        subtitle="Generate manual cases from your last scan, choose which ones to include, then create one Jira Test issue that bundles them—formatted for generic Jira, Xray, or Zephyr Squad-style fields."
      />

      {!canGenerate ? (
        <Alert>
          <AlertTitle className="text-sm">No scanned URL in this session</AlertTitle>
          <AlertDescription className="text-sm">
            Run a scan from{" "}
            <Link href="/scan" className="text-primary font-medium underline-offset-2 hover:underline">
              New scan
            </Link>{" "}
            first. This page uses the current session URL and findings to build scenarios.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-emerald-500/25 bg-emerald-950/15">
          <AlertTitle className="text-sm">Using session scan</AlertTitle>
          <AlertDescription className="text-sm break-all font-mono text-zinc-300">
            {scannedUrl} · {issues.length} axe finding{issues.length === 1 ? "" : "s"}
          </AlertDescription>
        </Alert>
      )}

      {canGenerate ? (
        <fieldset
          disabled={jiraLoading || loading}
          className="border-border/60 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:p-5"
        >
          <legend className="text-foreground px-1 text-sm font-semibold tracking-tight">
            Test management tool
          </legend>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Choose how the Jira issue description is structured when you add cases. You can change this anytime before
            sending to Jira.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {TEST_MANAGEMENT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 transition-colors",
                  testTool === opt.value
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-white/10 bg-black/25 hover:border-white/20",
                )}
              >
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="test-management-tool"
                    value={opt.value}
                    checked={testTool === opt.value}
                    onChange={() => setTestTool(opt.value)}
                    className="accent-emerald-500 mt-0.5 size-4 shrink-0"
                  />
                  <span className="text-foreground text-sm font-medium">{opt.label}</span>
                </span>
                <span className="text-muted-foreground pl-6 text-xs leading-snug">{opt.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          disabled={!canGenerate || loading}
          onClick={() => void generate()}
        >
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ClipboardList className="size-4" aria-hidden />}
          Generate test cases
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2 border-white/10 bg-black/25"
          disabled={selectedCount === 0 || jiraLoading}
          onClick={() => void sendToJira()}
          title={
            selectedCount === 0
              ? "Select at least one test case"
              : `Create one Jira Test issue with ${selectedCount} case(s) using ${TEST_MANAGEMENT_OPTIONS.find((o) => o.value === testTool)?.label ?? testTool}`
          }
        >
          {jiraLoading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Ticket className="size-4" aria-hidden />
          )}
          Add selected to Jira ({selectedCount} in 1 Test issue)
        </Button>
      </div>

      {testCases.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Use the checkboxes to choose cases. Jira receives <strong className="text-foreground">one</strong> issue of type{" "}
          <code className="text-foreground/90">Test</code> (or <code className="text-foreground/90">JIRA_TEST_ISSUE_TYPE</code> in
          .env) containing every selected case. Optional custom fields: <code className="text-foreground/90">JIRA_TEST_PLAN_EXTRA_FIELDS</code>.
        </p>
      ) : null}

      {loading ? (
        <div
          className="border-border/50 flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="text-primary size-5 shrink-0 animate-spin" aria-hidden />
          <span>Generating test cases from your scan…</span>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle className="text-sm">Could not generate</AlertTitle>
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      ) : null}

      {model ? (
        <p className="text-muted-foreground text-xs">Model · {model}</p>
      ) : null}

      {jiraMessage ? (
        <Alert className="border-emerald-500/30 bg-emerald-950/20">
          <AlertTitle className="text-sm">Jira</AlertTitle>
          <AlertDescription className="text-sm">{jiraMessage}</AlertDescription>
        </Alert>
      ) : null}

      {testCases.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-zinc-950/40">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] tracking-wide text-zinc-500 uppercase">
                <th className="w-10 px-2 py-3 font-semibold" scope="col">
                  <span className="sr-only">Include in Jira</span>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="accent-emerald-500 size-4 rounded border-white/20"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label={allSelected ? "Deselect all test cases" : "Select all test cases"}
                  />
                </th>
                <th className="px-2 py-3 font-semibold">#</th>
                <th className="px-3 py-3 font-semibold">Test scenario</th>
                <th className="px-3 py-3 font-semibold">Test case title</th>
                <th className="px-3 py-3 font-semibold">Steps</th>
                <th className="px-3 py-3 font-semibold">Actual result</th>
                <th className="px-3 py-3 font-semibold">Expected result</th>
              </tr>
            </thead>
            <tbody>
              {testCases.map((row, i) => (
                <tr key={i} className="border-b border-white/[0.06] align-top">
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      className="accent-emerald-500 size-4 rounded border-white/20"
                      checked={selected.has(i)}
                      onChange={() => toggleRow(i)}
                      aria-label={`Include in Jira: ${row.testCaseTitle}`}
                    />
                  </td>
                  <td className="text-muted-foreground px-2 py-3 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-3 text-zinc-200">{row.testScenario}</td>
                  <td className="px-3 py-3 font-medium text-zinc-100">{row.testCaseTitle}</td>
                  <td className="text-muted-foreground max-w-[220px] px-3 py-3 whitespace-pre-wrap">{row.steps}</td>
                  <td className="text-muted-foreground max-w-[220px] px-3 py-3 whitespace-pre-wrap">{row.actualResult}</td>
                  <td className="max-w-[220px] px-3 py-3 whitespace-pre-wrap text-zinc-300">{row.expectedResult}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}
