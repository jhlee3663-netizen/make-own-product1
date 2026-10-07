import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { listMorningWeights } from '../../lib/bodyLogs';
import { loadUserData, saveUserData } from '../../lib/userStore';
import { extractText, generateContent } from '../../lib/aiClient';
import { computeDietTrend, computeMaintenance, computeStrength, computeWeekSummary, computeWeeklyWorkout, computeWeightTrend, weekKey } from '../../lib/analysis';
import AnalysisTabsView from '../analysis/AnalysisTabs';

const STALE_MS = 60 * 1000;

async function loadLogs(uid) {
  const snap = await getDocs(query(collection(db, 'logs'), where('uid', '==', uid), orderBy('timestamp', 'desc'), limit(300)));
  const logs = snap.docs.map(d => d.data()).filter(d => !d.deletedAt);
  return {
    workoutLogs: logs.filter(l => l.type === 'workout'),
    dietLogs: logs.filter(l => l.type === 'diet'),
  };
}

function buildReportPrompt({ profile, trend, maintenance, strength, week }) {
  const round1 = v => (v == null ? null : Math.round(v * 10) / 10);
  const stats = {
    목표: profile?.goal || null,
    목표체중kg: trend.ready ? trend.goal : Number(profile?.goalWeight) || null,
    공복체중: trend.ready ? { '7일평균kg': round1(trend.current), 지난주대비kg: round1(trend.weeklyDelta), 주당변화kg: round1(trend.ratePerWeek) } : null,
    유지칼로리: maintenance.ready ? { 추정kcal: maintenance.tdee, 평균섭취kcal: maintenance.avgIntake } : null,
    이번주: week.thisWeek,
    지난주: week.lastWeek,
    단백질목표g: profile?.weight ? Math.round(Number(profile.weight) * 1.6) : null,
    정체종목: strength.stalled.map(e => `${e.name} ${e.stalledWeeks}주째`),
    신기록: strength.records.map(r => `${r.name} ${round1(r.weight)}kg×${r.reps}회`),
    부위별볼륨비중: strength.parts.map(p => `${p.part} ${Math.round(p.share * 100)}%`),
  };
  return `너는 사용자의 운동·식단·체중 기록을 읽고 한 주를 정리해 주는 코치다.
아래 통계만 근거로 쓴다. 통계에 없는 수치나 사실은 만들지 않는다. null인 항목은 언급하지 않는다.

통계(JSON, workoutDays=운동한 날 수, volume=총 볼륨 kg, dietDays=식단 기록한 날 수, avgKcal/avgProtein=기록한 날의 하루 평균):
${JSON.stringify(stats)}

아래 JSON 객체 하나만 반환한다. 각 값은 한국어 해요체 한 문장, 60자 이내, 구체적인 숫자를 하나 이상 포함한다.
{"headline":"이번 주를 한마디로 요약. 쉼표 하나로 나뉜 짧은 두 구절, 전체 30자 이내 (예: 스쿼트는 신기록, 벤치프레스는 4주째 제자리예요.)","good":"이번 주에 잘한 점","improve":"바꾸면 좋을 점","suggestion":"다음 주에 실천할 구체적인 행동 하나"}`;
}

async function generateReport(input) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const json = await generateContent({ contents: [{ parts: [{ text: buildReportPrompt(input) }] }], signal: ctrl.signal });
    const cleaned = extractText(json).replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('report-json-missing');
    const parsed = JSON.parse(match[0]);
    const pick = key => (typeof parsed[key] === 'string' ? parsed[key].trim().slice(0, 120) : '');
    const report = { headline: pick('headline'), good: pick('good'), improve: pick('improve'), suggestion: pick('suggestion') };
    if (!report.good && !report.improve && !report.suggestion) throw new Error('report-empty');
    return report;
  } finally {
    clearTimeout(timer);
  }
}

export default function AnalysisScreen({ user, profile, active, onAskCoach, onRecord, onBack, onEditGoal }) {
  const uid = user?.uid;
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState('loading'); // loading | ready | empty | error
  const [reloadKey, setReloadKey] = useState(0);
  const [reportTry, setReportTry] = useState(0);
  const loadedRef = useRef({ at: 0, reloadKey: 0 });
  const reportWeekRef = useRef(null);
  const resultRef = useRef(null);
  const forceReportRef = useRef(false);

  useEffect(() => {
    if (!active || !uid) return undefined;
    if (data && Date.now() - loadedRef.current.at < STALE_MS && reloadKey === loadedRef.current.reloadKey) return undefined;
    let cancelled = false;
    if (!data) setStatus('loading');
    Promise.all([loadLogs(uid), listMorningWeights(uid, 120)])
      .then(([logs, weights]) => {
        if (cancelled) return;
        loadedRef.current = { at: Date.now(), reloadKey };
        setData({ ...logs, weights });
        setStatus('ready');
      })
      .catch((error) => {
        console.error('[Analysis load]', error);
        if (!cancelled && !data) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [active, uid, reloadKey]);

  const result = useMemo(() => {
    if (!data) return null;
    return {
      trend: computeWeightTrend(data.weights, profile?.goalWeight),
      maintenance: computeMaintenance(data.dietLogs, data.weights),
      strength: computeStrength(data.workoutLogs, Number(profile?.weight) || 0),
      week: computeWeekSummary(data.workoutLogs, data.dietLogs),
      diet: computeDietTrend(data.dietLogs, Number(profile?.weight) || 0),
      weekly: computeWeeklyWorkout(data.workoutLogs),
    };
  }, [data, profile?.goalWeight, profile?.weight]);
  resultRef.current = result;
  const hasResult = Boolean(result);

  /* AI 리포트는 주 1회만 만들고 사용자 문서에 저장해 둔다. */
  useEffect(() => {
    const current = resultRef.current;
    if (!uid || !current) return undefined;
    const key = weekKey();
    if (reportWeekRef.current === key && !forceReportRef.current) return undefined;
    let cancelled = false;
    reportWeekRef.current = key;
    setReportStatus('loading');

    (async () => {
      const saved = (await loadUserData(uid).catch(() => null))?.analysisReport;
      if (cancelled) return;
      const force = forceReportRef.current;
      forceReportRef.current = false;
      if (!force && saved?.weekKey === key) {
        setReport(saved);
        setReportStatus('ready');
        return;
      }
      const { thisWeek, lastWeek } = current.week;
      const recordDays = thisWeek.workoutDays + thisWeek.dietDays + lastWeek.workoutDays + lastWeek.dietDays;
      if (recordDays < 3 && !current.trend.ready) {
        setReportStatus('empty');
        return;
      }
      const next = { ...(await generateReport({ profile, ...current })), weekKey: key };
      if (cancelled) return;
      setReport(next);
      setReportStatus('ready');
      saveUserData(uid, { analysisReport: next }).catch(() => {});
    })().catch((error) => {
      console.error('[Analysis report]', error);
      if (cancelled) return;
      reportWeekRef.current = null;
      setReportStatus('error');
    });
    return () => { cancelled = true; };
  }, [uid, hasResult, reportTry]);

  function askCoach() {
    if (!report) return;
    onAskCoach?.([
      '이번 주 AI 리포트를 봤어요.',
      report.good && `잘한 점: ${report.good}`,
      report.improve && `바꿀 점: ${report.improve}`,
      report.suggestion && `다음 주 제안: ${report.suggestion}`,
      '이 내용을 바탕으로 다음 주에 실천할 구체적인 목표를 정해줘.',
    ].filter(Boolean).join('\n'));
  }

  return (
    <AnalysisTabsView
      status={status}
      model={result}
      report={report}
      reportStatus={reportStatus}
      onAskCoach={askCoach}
      onRecord={onRecord}
      onRetry={() => setReloadKey(k => k + 1)}
      onRetryReport={() => setReportTry(n => n + 1)}
      onRegenerateReport={() => { forceReportRef.current = true; setReportTry(n => n + 1); }}
      onBack={onBack}
      onEditGoal={onEditGoal}
    />
  );
}
