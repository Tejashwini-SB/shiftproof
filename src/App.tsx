import React, { useState, useEffect } from 'react';
import {
  Zap,
  LayoutDashboard,
  CalendarCheck,
  ShieldCheck,
  FlaskConical,
  Sun,
  ShieldAlert,
  Play,
  Pause,
  Code2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Lock,
  BatteryCharging,
  Activity,
  SlidersHorizontal,
  Clock,
  Layers,
  Check,
  Search,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import { defaultShiftProofData } from './data/defaultData';
import { ShiftProofData, Scenario, RewardCalculationResult } from './types';
import {
  calculateReward,
  formatKwh,
  formatHour,
  STEPS,
  getFailStepIndex,
  getFailureExplanation,
  getScenarioHeadline,
  computeSolidityHash
} from './utils/contractLogic';

export default function App() {
  const [data, setData] = useState<ShiftProofData>(defaultShiftProofData);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [showContractModal, setShowContractModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch results.json if updated at runtime
  useEffect(() => {
    fetch('/results.json')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not found');
      })
      .then((d: ShiftProofData) => {
        if (d && d.results && d.results.length > 0) {
          setData(d);
        }
      })
      .catch(() => {});
  }, []);

  const scenario: Scenario = data.results[selectedIndex] || data.results[0];
  const sim = data.sim;
  const outcome = scenario.outcome;
  const isRewarded = outcome.status === 'rewarded';
  const calc: RewardCalculationResult = calculateReward(
    scenario.claimedBaseline,
    scenario.actual,
    sim.eligibleHours,
    sim.capWh
  );

  const failIndex = getFailStepIndex(outcome, sim.eventDay);
  const whyText = getFailureExplanation(outcome, sim.eventDay);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setSelectedIndex((prev) => (prev + 1) % data.results.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isPlaying, data.results.length]);

  // Chart coordinate calculations
  const chartW = 760;
  const chartH = 260;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const slotW = (chartW - padL - padR) / 24;
  const getX = (h: number) => padL + (h + 0.5) * slotW;

  const maxVal = Math.max(
    ...scenario.anchoredBaseline,
    ...scenario.actual,
    ...scenario.claimedBaseline,
    ...sim.forecastWh,
    5000
  );
  const topY = Math.ceil(maxVal / 1000) * 1000;
  const getY = (val: number) => padT + (chartH - padT - padB) * (1 - Math.max(0, val) / topY);

  const smoothCurve = (points: [number, number][]) => {
    if (points.length === 0) return '';
    let d = `M ${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return d;
  };

  const ptsSolar: [number, number][] = sim.forecastWh.map((v, h) => [getX(h), getY(v)]);
  const ptsBaseline: [number, number][] = scenario.anchoredBaseline.map((v, h) => [getX(h), getY(v)]);
  const ptsActual: [number, number][] = scenario.actual.map((v, h) => [getX(h), getY(v)]);
  const ptsClaimed: [number, number][] = scenario.claimedBaseline.map((v, h) => [getX(h), getY(v)]);

  const hasClaimDiff = scenario.claimedBaseline.some(
    (v, h) => Math.abs(v - scenario.anchoredBaseline[h]) > 1
  );

  // Transfer arc from evening to solar hours
  const arcX1 = getX(19.5);
  const arcY1 = getY(scenario.anchoredBaseline[19]) - 8;
  const arcX2 = getX(12.5);
  const arcY2 = getY(scenario.actual[12]) - 8;
  const midX = (arcX1 + arcX2) / 2;
  const peakArcY = Math.min(arcY1, arcY2) - 44;
  const transferPath = `M ${arcX1},${arcY1} C ${arcX1 - 65},${peakArcY} ${arcX2 + 65},${peakArcY} ${arcX2},${arcY2}`;

  // Efficiency percentage (capped shift vs capWh)
  const efficiencyPercent = Math.min(100, Math.round((calc.c / sim.capWh) * 100));

  return (
    <div className="min-h-screen bg-[#edf1ee] p-2 sm:p-4 md:p-6 flex items-center justify-center font-sans antialiased text-[#111827]">
      {/* Outer Shell inspired by EcoSync / Solarcargo reference */}
      <div className="ecosync-shell w-full max-w-[1360px] flex flex-col md:flex-row overflow-hidden bg-white">
        
        {/* Left Sidebar */}
        <aside className="w-full md:w-60 bg-white border-r border-[#e5e9e6] p-4 sm:p-5 flex flex-col justify-between shrink-0">
          <div>
            {/* Brand Logo */}
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-full bg-[#064e3b] flex items-center justify-center text-white shadow-xs">
                <Zap className="w-4 h-4 fill-white" />
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-[#111827]">ShiftProof</span>
                <span className="block text-[10.5px] text-[#6b7280]">Demand-Response</span>
              </div>
            </div>

            {/* Menu Label */}
            <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-2 px-2">
              Menu
            </div>

            {/* Nav Items */}
            <nav className="space-y-1">
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#e8f3ee] text-[#064e3b] transition-all">
                <LayoutDashboard className="w-4 h-4 text-[#064e3b]" />
                <span>Energy Overview</span>
              </button>

              <button
                onClick={() => setShowContractModal(true)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[#4b5563] hover:bg-[#f4f6f4] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <CalendarCheck className="w-4 h-4 text-[#6b7280]" />
                  <span>Energy Events</span>
                </div>
                <span className="text-[10px] font-mono bg-[#f0f3f1] text-[#4b5563] px-1.5 py-0.5 rounded">
                  Day 100
                </span>
              </button>

              <button
                onClick={() => setShowContractModal(true)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[#4b5563] hover:bg-[#f4f6f4] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#6b7280]" />
                  <span>Verification</span>
                </div>
                <span className="text-[10px] font-mono bg-[#e8f3ee] text-[#064e3b] px-1.5 py-0.5 rounded font-semibold">
                  7 Rules
                </span>
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[#4b5563] hover:bg-[#f4f6f4] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <FlaskConical className="w-4 h-4 text-[#6b7280]" />
                  <span>Scenario Lab</span>
                </div>
                <span className="text-[10px] font-mono bg-[#f0f3f1] text-[#4b5563] px-1.5 py-0.5 rounded">
                  8 Cases
                </span>
              </button>
            </nav>
          </div>

          {/* Bottom Card - EcoSync Dark Card style */}
          <div className="mt-6 bg-[#064e3b] text-white p-4 rounded-2xl shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ShiftProof Engine</span>
            </div>
            <p className="text-[11px] text-emerald-100/80 leading-relaxed mb-3">
              Fixed on-chain rules enforce baseline settlement with zero oracle trust for math.
            </p>
            <button
              onClick={() => setShowContractModal(true)}
              className="w-full bg-white text-[#064e3b] font-semibold text-xs py-2 rounded-xl hover:bg-emerald-50 transition-colors shadow-xs"
            >
              View Contract Rules
            </button>
          </div>
        </aside>

        {/* Main Dashboard Area */}
        <div className="flex-1 bg-[#f9faf9] flex flex-col min-w-0">
          
          {/* Top Header Bar */}
          <header className="px-6 py-4 bg-white border-b border-[#e5e9e6] flex flex-wrap items-center justify-between gap-3">
            {/* Search / Context bar */}
            <div className="relative w-full max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                type="text"
                placeholder="Search event rules, meters, or scenarios..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f4f6f4] border border-transparent rounded-full pl-9 pr-4 py-1.5 text-xs text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:border-[#064e3b] transition-all"
              />
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono bg-[#f0f3f1] text-[#4b5563] px-2.5 py-1 rounded-full font-medium">
                SIMULATION LAB
              </span>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shadow-xs ${
                  isPlaying
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-[#064e3b] text-white hover:bg-[#0d4734]'
                }`}
              >
                {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                <span>{isPlaying ? 'Pause Auto-Play' : 'Auto-Play Attacks'}</span>
              </button>

              <div className="flex items-center gap-2 pl-2 border-l border-[#e5e9e6]">
                <div className="w-7 h-7 rounded-full bg-[#e8f3ee] text-[#064e3b] font-bold text-xs flex items-center justify-center">
                  M1
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-[#111827] leading-none">Meter Oracle</div>
                  <div className="text-[10px] text-[#6b7280] font-mono leading-tight mt-0.5">METER-1</div>
                </div>
              </div>
            </div>
          </header>

          {/* Body Content */}
          <main className="p-4 sm:p-6 space-y-4 overflow-y-auto">
            
            {/* Page Title & Scenario Narrative */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
                  Energy Demand-Response Dashboard
                </h1>
                <p className="text-xs text-[#6b7280] mt-0.5">
                  Monitor and verify renewable energy load shifting in real-time.
                </p>
              </div>

              {/* Status Badge */}
              <div
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                  isRewarded
                    ? 'bg-[#e8f3ee] text-[#064e3b] border border-[#a7f3d0]'
                    : 'bg-[#fff1f2] text-[#be123c] border border-[#fecdd3]'
                }`}
              >
                {isRewarded ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Contract Settled (Simulated)</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Blocked: {outcome.error}</span>
                  </>
                )}
              </div>
            </div>

            {/* Segmented Scenario Selector Row */}
            <div className="bg-white border border-[#e5e9e6] rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto shadow-2xs">
              {data.results.map((sc, idx) => {
                const active = idx === selectedIndex;
                const ok = sc.outcome.status === 'rewarded';
                return (
                  <button
                    key={sc.id}
                    onClick={() => {
                      setIsPlaying(false);
                      setSelectedIndex(idx);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      active
                        ? 'bg-[#064e3b] text-white shadow-xs font-semibold'
                        : 'text-[#4b5563] hover:bg-[#f4f6f4]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        ok ? (active ? 'bg-emerald-300' : 'bg-emerald-500') : (active ? 'bg-rose-300' : 'bg-rose-500')
                      }`}
                    ></span>
                    <span>{sc.title}</span>
                    {sc.attack && (
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                          active ? 'bg-rose-950/60 text-rose-200' : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        Attack
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 4 Top KPI Cards (matching reference layout) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              
              {/* Card 1: Primary Dark Forest Green Card */}
              <div className="ecosync-card-dark p-4 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-xs text-emerald-200">
                  <span className="font-medium">Total Energy Shifted</span>
                  <div className="w-5 h-5 rounded-full bg-emerald-800/80 flex items-center justify-center">
                    <TrendingUp className="w-3 h-3 text-emerald-300" />
                  </div>
                </div>
                <div className="my-2">
                  <div className="text-2xl font-bold tracking-tight text-white font-mono">
                    {formatKwh(calc.c)} <span className="text-xs font-normal text-emerald-200">kWh</span>
                  </div>
                </div>
                <div className="text-[11px] text-emerald-200/80 truncate">
                  Evening drop: {formatKwh(calc.d)} | Solar rise: {formatKwh(calc.r)}
                </div>
              </div>

              {/* Card 2: Calculated Reward */}
              <div className="ecosync-card p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#6b7280]">
                  <span className="font-medium">Calculated Reward</span>
                  <Zap className="w-4 h-4 text-[#064e3b]" />
                </div>
                <div className="my-2">
                  <div
                    className={`text-2xl font-bold tracking-tight font-mono ${
                      isRewarded ? 'text-[#064e3b]' : 'text-[#e11d48]'
                    }`}
                  >
                    {isRewarded ? formatKwh(outcome.rewardWh ?? calc.reward) : '0.00'}{' '}
                    <span className="text-xs font-normal text-[#6b7280]">kWh</span>
                  </div>
                </div>
                <div className="text-[11px] text-[#6b7280] truncate">
                  {isRewarded ? 'Simulated credit granted' : `Blocked: ${outcome.error}`}
                </div>
              </div>

              {/* Card 3: Event Cap */}
              <div className="ecosync-card p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#6b7280]">
                  <span className="font-medium">Event Cap (Ceiling)</span>
                  <Lock className="w-4 h-4 text-[#6b7280]" />
                </div>
                <div className="my-2">
                  <div className="text-2xl font-bold tracking-tight text-[#111827] font-mono">
                    {formatKwh(sim.capWh)}{' '}
                    <span className="text-xs font-normal text-[#6b7280]">kWh</span>
                  </div>
                </div>
                <div className="text-[11px] text-[#6b7280] truncate">
                  Max claim per participant
                </div>
              </div>

              {/* Card 4: Rebound Penalty */}
              <div className="ecosync-card p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#6b7280]">
                  <span className="font-medium">Rebound Penalty</span>
                  <AlertTriangle
                    className={`w-4 h-4 ${calc.rb > 0 ? 'text-[#e11d48]' : 'text-[#9ca3af]'}`}
                  />
                </div>
                <div className="my-2">
                  <div
                    className={`text-2xl font-bold tracking-tight font-mono ${
                      calc.rb > 0 ? 'text-[#e11d48]' : 'text-[#111827]'
                    }`}
                  >
                    {calc.rb > 0 ? `-${formatKwh(calc.rb)}` : '0.00'}{' '}
                    <span className="text-xs font-normal text-[#6b7280]">kWh</span>
                  </div>
                </div>
                <div className="text-[11px] text-[#6b7280] truncate">
                  {calc.rb > 0 ? '1:1 net surge deduction' : 'Zero net daily excess'}
                </div>
              </div>
            </div>

            {/* Middle Grid: 24-Hour Energy Chart + Savings Ring Progress */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Large 24-Hour Chart Card (8 cols) */}
              <div className="ecosync-card p-4 sm:p-5 lg:col-span-8 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h2 className="text-sm font-bold text-[#111827]">
                        24-Hour Energy Profile
                      </h2>
                      <p className="text-xs text-[#6b7280]">
                        Comparing solar forecast, historical baseline, and actual load
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium bg-[#fef3c7] text-[#92400e] border border-[#fde68a] px-2.5 py-0.5 rounded-full">
                        Eligible Solar Hours: 11:00 - 15:00
                      </span>
                    </div>
                  </div>

                  {/* SVG Chart */}
                  <div className="relative overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${chartW} ${chartH}`}
                      className="w-full min-w-[620px] h-auto block select-none"
                      onPointerLeave={() => setHoveredHour(null)}
                    >
                      <defs>
                        <marker
                          id="arc-arrow"
                          viewBox="0 0 10 10"
                          refX="8"
                          refY="5"
                          markerWidth="6"
                          markerHeight="6"
                          orient="auto"
                        >
                          <path
                            d="M1 1L9 5L1 9"
                            fill="none"
                            stroke={isRewarded ? '#064e3b' : '#e11d48'}
                            strokeWidth="1.6"
                          />
                        </marker>

                        <linearGradient id="solarGradEco" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#d97706" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#d97706" stopOpacity="0.01" />
                        </linearGradient>

                        <linearGradient id="actualGradEco" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#064e3b" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#064e3b" stopOpacity="0.01" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines */}
                      {[0, 1, 2, 3, 4].map((step) => {
                        const val = (topY * step) / 4;
                        const y = getY(val);
                        return (
                          <g key={step}>
                            <line
                              x1={padL}
                              x2={chartW - padR}
                              y1={y}
                              y2={y}
                              stroke="#edf1ee"
                              strokeDasharray="2 3"
                            />
                            <text x={padL - 6} y={y + 3.5} fill="#9ca3af" fontSize="10" textAnchor="end">
                              {(val / 1000).toFixed(0)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Highlighted Solar Hours Window */}
                      {sim.eligibleHours.map((h) => (
                        <rect
                          key={h}
                          x={padL + h * slotW}
                          y={padT}
                          width={slotW}
                          height={chartH - padT - padB}
                          fill="#fef3c7"
                          opacity="0.4"
                        />
                      ))}

                      {/* Solar Forecast Area */}
                      <path
                        d={`${smoothCurve(ptsSolar)} L ${getX(23)},${getY(0)} L ${getX(0)},${getY(0)} Z`}
                        fill="url(#solarGradEco)"
                      />

                      {/* Actual Consumption Area */}
                      <path
                        d={`${smoothCurve(ptsActual)} L ${getX(23)},${getY(0)} L ${getX(0)},${getY(0)} Z`}
                        fill="url(#actualGradEco)"
                      />

                      {/* Solar Forecast Line */}
                      <path
                        d={smoothCurve(ptsSolar)}
                        fill="none"
                        stroke="#d97706"
                        strokeWidth="1.8"
                      />

                      {/* 4-Week Baseline Line (dashed) */}
                      <path
                        d={smoothCurve(ptsBaseline)}
                        fill="none"
                        stroke="#6b7280"
                        strokeWidth="1.8"
                        strokeDasharray="4 3"
                      />

                      {/* Actual Load Line */}
                      <path
                        d={smoothCurve(ptsActual)}
                        fill="none"
                        stroke="#064e3b"
                        strokeWidth="2.4"
                      />

                      {/* Claimed Baseline Line if Attack */}
                      {hasClaimDiff && (
                        <path
                          d={smoothCurve(ptsClaimed)}
                          fill="none"
                          stroke="#e11d48"
                          strokeWidth="2"
                          strokeDasharray="2 3"
                        />
                      )}

                      {/* Load Transfer Indicator Arc */}
                      {calc.d > 0 && calc.r > 0 && (
                        <g>
                          <path
                            d={transferPath}
                            fill="none"
                            stroke={isRewarded ? '#064e3b' : '#e11d48'}
                            strokeWidth="1.8"
                            markerEnd="url(#arc-arrow)"
                            strokeDasharray={isRewarded ? undefined : '3 3'}
                          />
                          <rect
                            x={midX - 70}
                            y={peakArcY - 18}
                            width="140"
                            height="18"
                            rx="4"
                            fill="#ffffff"
                            stroke={isRewarded ? '#064e3b' : '#e11d48'}
                            strokeWidth="1"
                          />
                          <text
                            x={midX}
                            y={peakArcY - 5}
                            textAnchor="middle"
                            fontSize="10.5"
                            fontWeight="600"
                            fill={isRewarded ? '#064e3b' : '#e11d48'}
                          >
                            {formatKwh(calc.c)} kWh shifted
                          </text>
                        </g>
                      )}

                      {/* X-Axis Hour Labels */}
                      {Array.from({ length: 24 }).map((_, h) => {
                        if (h % 3 === 0 || h === 23) {
                          return (
                            <text
                              key={h}
                              x={getX(h)}
                              y={chartH - 8}
                              fill="#6b7280"
                              fontSize="10"
                              textAnchor="middle"
                            >
                              {formatHour(h)}
                            </text>
                          );
                        }
                        return null;
                      })}

                      {/* Hover Crosshair */}
                      {hoveredHour !== null && (
                        <g pointerEvents="none">
                          <line
                            x1={getX(hoveredHour)}
                            x2={getX(hoveredHour)}
                            y1={padT}
                            y2={chartH - padB}
                            stroke="#111827"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                            opacity="0.4"
                          />
                          <circle
                            cx={getX(hoveredHour)}
                            cy={getY(scenario.actual[hoveredHour])}
                            r="4"
                            fill="#064e3b"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                          <circle
                            cx={getX(hoveredHour)}
                            cy={getY(scenario.anchoredBaseline[hoveredHour])}
                            r="3.5"
                            fill="#6b7280"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                        </g>
                      )}

                      {/* Interactive Hit Rect */}
                      <rect
                        x={padL}
                        y={padT}
                        width={chartW - padL - padR}
                        height={chartH - padT - padB}
                        fill="transparent"
                        className="cursor-crosshair"
                        onPointerMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const px = ((e.clientX - rect.left) / rect.width) * (chartW - padL - padR);
                          const h = Math.max(0, Math.min(23, Math.floor(px / slotW)));
                          setHoveredHour(h);
                        }}
                      />
                    </svg>

                    {/* Tooltip Card */}
                    {hoveredHour !== null && (
                      <div
                        className="absolute pointer-events-none rounded-xl p-2.5 text-xs bg-white border border-[#e5e9e6] shadow-md text-[#111827] z-10 font-mono"
                        style={{
                          left: Math.min(
                            Math.max(6, ((getX(hoveredHour) - padL) / (chartW - padL - padR)) * 100),
                            78
                          ) + '%',
                          top: '12px'
                        }}
                      >
                        <div className="font-semibold text-xs border-b border-[#f0f3f1] pb-1 mb-1 flex items-center justify-between gap-3">
                          <span>{formatHour(hoveredHour)}</span>
                          {sim.eligibleHours.includes(hoveredHour) && (
                            <span className="text-[10px] text-[#d97706] font-sans font-medium">
                              Eligible Solar
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[11px]">
                          <span className="text-[#6b7280]">Actual:</span>
                          <span className="font-semibold text-[#064e3b]">
                            {formatKwh(scenario.actual[hoveredHour])} kWh
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[11px]">
                          <span className="text-[#6b7280]">Baseline:</span>
                          <span>{formatKwh(scenario.anchoredBaseline[hoveredHour])} kWh</span>
                        </div>
                        {hasClaimDiff && (
                          <div className="flex items-center justify-between gap-3 text-[11px] text-[#e11d48]">
                            <span>Claimed:</span>
                            <span className="font-semibold">
                              {formatKwh(scenario.claimedBaseline[hoveredHour])} kWh
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 text-[11px] text-[#d97706]">
                          <span className="text-[#6b7280]">Solar:</span>
                          <span>{formatKwh(sim.forecastWh[hoveredHour])} kWh</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Legend */}
                <div className="pt-2.5 border-t border-[#f0f3f1] flex flex-wrap items-center gap-4 text-xs text-[#6b7280] mt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#d97706] inline-block"></span>
                    Solar Forecast (Simulated)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#6b7280] border-t border-dashed border-[#6b7280] inline-block"></span>
                    4-Week Baseline
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#064e3b] inline-block"></span>
                    Actual Consumption
                  </span>
                  {hasClaimDiff && (
                    <span className="flex items-center gap-1.5 text-[#e11d48] font-medium">
                      <span className="w-3 h-0.5 bg-[#e11d48] border-t border-dotted border-[#e11d48] inline-block"></span>
                      Claimed Baseline (Attack)
                    </span>
                  )}
                </div>
              </div>

              {/* Right: Circular Progress & Settlement Math Card (4 cols) */}
              <div className="ecosync-card p-4 sm:p-5 lg:col-span-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-[#f0f3f1] pb-2.5 mb-3">
                    <span className="font-bold text-sm text-[#111827]">Shift Progress</span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                        isRewarded
                          ? 'bg-[#e8f3ee] text-[#064e3b]'
                          : 'bg-[#fff1f2] text-[#be123c]'
                      }`}
                    >
                      {isRewarded ? 'Settled' : 'Reverted'}
                    </span>
                  </div>

                  {/* Circular Progress Gauge inspired by EcoSync reference */}
                  <div className="flex flex-col items-center justify-center my-3">
                    <div className="relative w-28 h-28 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        {/* Background Ring */}
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#e5e9e6"
                          strokeWidth="3.5"
                        />
                        {/* Foreground Progress */}
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={isRewarded ? '#064e3b' : '#e11d48'}
                          strokeWidth="3.5"
                          strokeDasharray={`${isRewarded ? efficiencyPercent : 0}, 100`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-xl font-bold font-mono text-[#111827]">
                          {isRewarded ? `${efficiencyPercent}%` : '0%'}
                        </span>
                        <span className="text-[10px] text-[#6b7280]">CAP REACHED</span>
                      </div>
                    </div>
                  </div>

                  {/* Mathematical Settlement Table */}
                  <div className="bg-[#f9faf9] border border-[#e5e9e6] rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[#6b7280]">
                      <span>Evening Load Reduction</span>
                      <span className="font-mono font-medium text-[#111827]">
                        {formatKwh(calc.d)} kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[#6b7280]">
                      <span>Solar Midday Rise</span>
                      <span className="font-mono font-medium text-[#111827]">
                        {formatKwh(calc.r)} kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[#6b7280]">
                      <span>Applied Event Cap</span>
                      <span className="font-mono font-medium text-[#111827]">
                        {formatKwh(sim.capWh)} kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[#6b7280]">
                      <span>Rebound Penalty</span>
                      <span
                        className={`font-mono font-medium ${
                          calc.rb > 0 ? 'text-[#e11d48]' : 'text-[#6b7280]'
                        }`}
                      >
                        {calc.rb > 0 ? `-${formatKwh(calc.rb)}` : '0.00'} kWh
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#e5e9e6] flex items-center justify-between font-semibold">
                      <span className="text-[#111827]">Settled Credit</span>
                      <span
                        className={`font-mono text-sm ${
                          isRewarded ? 'text-[#064e3b]' : 'text-[#e11d48] line-through'
                        }`}
                      >
                        {formatKwh(calc.reward)} kWh
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 text-[11px] text-[#6b7280] border-t border-[#f0f3f1]">
                  Formula: <code>max(0, min(drop, rise, cap) - rebound)</code>
                </div>
              </div>
            </div>

            {/* Bottom Grid: Verification Checklist & Activity Log */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Left: Verification Checklist (7 cols) */}
              <div className="ecosync-card p-4 sm:p-5 lg:col-span-7">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#f0f3f1]">
                  <div>
                    <h3 className="text-sm font-bold text-[#111827]">
                      Smart Contract Verification Checks
                    </h3>
                    <p className="text-xs text-[#6b7280]">
                      Sequential requirements enforced by <code>ShiftProof.sol:settle()</code>
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-[#064e3b] bg-[#e8f3ee] px-2.5 py-0.5 rounded-full font-semibold">
                    {isRewarded ? '7 / 7 PASSED' : `REVERTED AT CHECK #${failIndex + 1}`}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {STEPS.map((stepName, idx) => {
                    const isPassed = failIndex < 0 || idx < failIndex;
                    const isFailed = idx === failIndex;

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-colors ${
                          isFailed
                            ? 'bg-[#fff1f2] border-[#fecdd3] text-[#9f1239]'
                            : isPassed
                            ? 'bg-white border-[#e5e9e6] text-[#111827]'
                            : 'bg-[#f9faf9] border-[#f0f3f1] text-[#9ca3af]'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isFailed ? (
                            <XCircle className="w-4 h-4 text-[#e11d48]" />
                          ) : isPassed ? (
                            <CheckCircle2 className="w-4 h-4 text-[#064e3b]" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-[#cbd5e1] text-[10px] flex items-center justify-center text-[#9ca3af]">
                              {idx + 1}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${isFailed ? 'font-semibold' : ''}`}>
                              {idx + 1}. {stepName}
                            </span>
                            <span
                              className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full ${
                                isFailed
                                  ? 'bg-rose-100 text-rose-800'
                                  : isPassed
                                  ? 'bg-[#e8f3ee] text-[#064e3b]'
                                  : 'text-[#9ca3af]'
                              }`}
                            >
                              {isFailed ? 'FAILED' : isPassed ? 'PASSED' : 'SKIPPED'}
                            </span>
                          </div>

                          {isFailed && (
                            <div className="mt-1 text-xs text-[#9f1239] bg-white/80 p-1.5 rounded-lg border border-rose-100">
                              <strong>Revert Reason:</strong> {whyText}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Security & Attestation Card (5 cols, dark card like Carbon Offset Tracker) */}
              <div className="ecosync-card-dark p-5 lg:col-span-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                      On-Chain Attestation
                    </span>
                    <span className="text-[10px] font-mono bg-emerald-800/70 text-emerald-200 px-2 py-0.5 rounded-full">
                      LOCAL TESTNET
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/40">
                      <div className="text-[10px] text-emerald-300 font-medium">SECURITY AUDIT</div>
                      <div className="text-xl font-bold font-mono text-white mt-0.5">
                        {isRewarded ? '7 / 7' : 'BLOCKED'}
                      </div>
                      <div className="text-[10px] text-emerald-200/70 mt-0.5">
                        {isRewarded ? 'All checks verified' : outcome.error}
                      </div>
                    </div>

                    <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/40">
                      <div className="text-[10px] text-emerald-300 font-medium">ATTACKS TRAPPED</div>
                      <div className="text-xl font-bold font-mono text-white mt-0.5">
                        6 of 6
                      </div>
                      <div className="text-[10px] text-emerald-200/70 mt-0.5">
                        100% testnet catch
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-emerald-100/90 leading-relaxed mb-4">
                    Oracle anchored keccak256 hashes for lookback history (Days 93, 86, 79, 72) and event day 100.
                  </div>
                </div>

                <button
                  onClick={() => setShowContractModal(true)}
                  className="w-full bg-white text-[#064e3b] font-semibold text-xs py-2 rounded-xl hover:bg-emerald-50 transition-colors shadow-xs"
                >
                  Inspect Solidity Hash Details
                </button>
              </div>
            </div>

            {/* Restrained Simulation Disclaimer */}
            <div className="bg-white border border-[#e5e9e6] rounded-xl p-3 text-[11px] text-[#6b7280] flex items-center justify-between gap-3">
              <span>
                <strong>Prototype Lab:</strong> Meter readings and solar forecasts are simulated. No actual payments or monetary tokens are disbursed.
              </span>
              <span className="font-mono text-[10px] text-[#9ca3af] shrink-0">
                ShiftProof v0.8.20
              </span>
            </div>
          </main>
        </div>
      </div>

      {/* Contract Rules & Hash Inspection Modal */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-[#e5e9e6] rounded-2xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#f0f3f1]">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#064e3b]" />
                <h3 className="font-bold text-sm text-[#111827]">
                  ShiftProof Solidity Specifications
                </h3>
              </div>
              <button
                onClick={() => setShowContractModal(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6b7280] hover:bg-[#f4f6f4]"
              >
                ✕
              </button>
            </div>

            <div className="my-3 space-y-3 text-xs text-[#374151]">
              <div>
                <span className="font-semibold text-[#111827] block mb-1">
                  1. Canonical Reading Hash
                </span>
                <p className="text-[#6b7280] mb-1.5">
                  Oracle and participant settle claims using packed keccak-256 encoding:
                </p>
                <div className="bg-[#f9faf9] border border-[#e5e9e6] p-2.5 rounded-lg font-mono text-[11px] overflow-x-auto">
                  keccak256(abi.encodePacked(bytes32 meterId, uint32 dayId, uint32[24] readingsWh))
                </div>
              </div>

              <div>
                <span className="font-semibold text-[#111827] block mb-1">
                  2. Deterministic Calculation Rules
                </span>
                <div className="bg-[#f9faf9] border border-[#e5e9e6] p-2.5 rounded-lg font-mono text-[11px] space-y-0.5">
                  <div>drop = sum(max(0, baseline[h] - actual[h])) [non-solar hours]</div>
                  <div>rise = sum(max(0, actual[h] - baseline[h])) [solar hours]</div>
                  <div>shifted = min(drop, rise)</div>
                  <div>rebound = max(0, actualTotal - baselineTotal)</div>
                  <div className="text-[#064e3b] font-semibold">
                    reward = max(0, min(shifted, capWh) - rebound)
                  </div>
                </div>
              </div>

              <div>
                <span className="font-semibold text-[#111827] block mb-1">
                  3. Anti-Gaming Protections
                </span>
                <ul className="list-disc pl-4 space-y-1 text-[#6b7280]">
                  <li>Contract selects history days (t-7, t-14, t-21, t-28) to stop day cherry-picking.</li>
                  <li>History must be anchored before the event is announced.</li>
                  <li>Rebound deductions prevent net energy surge.</li>
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-[#f0f3f1] flex justify-end">
              <button
                onClick={() => setShowContractModal(false)}
                className="px-4 py-1.5 rounded-xl bg-[#064e3b] text-white text-xs font-semibold hover:bg-[#0d4734] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
