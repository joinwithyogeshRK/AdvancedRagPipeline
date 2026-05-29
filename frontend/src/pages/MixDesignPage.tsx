import { useRef, useState } from "react"
import axios from "axios"
import { Show, SignInButton, useAuth, UserButton } from "@clerk/react"
import { Link } from "react-router-dom"
import { Calculator, ChevronDown, Download, Droplets, Loader2, LogIn, MessageSquare, Ruler, TriangleAlert } from "lucide-react"
import { useTheme } from "@/context/theme"
import { getClerkAppearance } from "@/lib/clerk-appearance"

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3009"

type MixDesignStep = {
  step: number
  title: string
  reference: string
  detail: string
  value?: number | string
  unit?: string
}

type MixDesignResult = {
  durability: {
    minCementContent: number
    maxWaterCementRatio: number
    minGrade: number
    source: string
  }
  steps: MixDesignStep[]
  proportions: {
    cement: number
    water: number
    fineAggregate: number
    coarseAggregate: number
    admixture?: number
    waterCementRatio: number
    ratio: string
  }
  perBagOf50kgCement: {
    water: number
    fineAggregate: number
    coarseAggregate: number
    admixture?: number
  }
  warnings: string[]
}

type FormState = {
  grade: string
  cementType: string
  maxAggregateSize: string
  workabilitySlump: string
  exposureCondition: string
  concreteType: string
  aggregateType: string
  fineAggregateZone: string
  useChemicalAdmixture: boolean
  admixtureName: string
  admixtureDosagePercent: string
  waterReductionPercent: string
  standardDeviation: string
  // Advanced — left blank means "use IS-code default"
  cementSpecificGravity: string
  coarseAggregateSpecificGravity: string
  fineAggregateSpecificGravity: string
  admixtureSpecificGravity: string
  coarseAggregateAbsorption: string
  fineAggregateAbsorption: string
  coarseAggregateMoisture: string
  fineAggregateMoisture: string
}

const DEFAULTS: FormState = {
  grade: "30",
  cementType: "OPC 53",
  maxAggregateSize: "20",
  workabilitySlump: "100",
  exposureCondition: "Severe",
  concreteType: "Reinforced",
  aggregateType: "Crushed",
  fineAggregateZone: "II",
  useChemicalAdmixture: true,
  admixtureName: "Superplasticizer (PCE)",
  admixtureDosagePercent: "1.0",
  waterReductionPercent: "23",
  standardDeviation: "",
  cementSpecificGravity: "",
  coarseAggregateSpecificGravity: "",
  fineAggregateSpecificGravity: "",
  admixtureSpecificGravity: "",
  coarseAggregateAbsorption: "",
  fineAggregateAbsorption: "",
  coarseAggregateMoisture: "",
  fineAggregateMoisture: "",
}

const CEMENTS = ["OPC 33", "OPC 43", "OPC 53", "PPC", "PSC", "SRC"]
const EXPOSURES = ["Mild", "Moderate", "Severe", "Very Severe", "Extreme"]
const ZONES = ["I", "II", "III", "IV"]

type Payload = Record<string, string | number | boolean>

const num = (s: string): number | undefined => {
  const t = s.trim()
  if (t === "") return undefined
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

const fieldCls =
  "w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/25"
const labelCls = "mb-1.5 block text-[11px] font-medium tracking-wide text-muted-foreground"

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
)

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3 flex items-center gap-3">
    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/80">{children}</span>
    <span className="h-px flex-1 bg-border" />
  </div>
)

const Metric = ({ label, value, unit }: { label: string; value: number | string; unit?: string }) => (
  <div className="rounded-xl border border-border bg-background/50 px-3 py-2.5">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
      {value}
      {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
    </div>
  </div>
)

// Blueprint / graph-paper background — fine + major grid, accent glow, vignette.
const BlueprintBackground = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
    <div className="absolute inset-0 bg-background" />
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          "linear-gradient(to right, color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    />
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          "linear-gradient(to right, color-mix(in srgb, var(--foreground) 11%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 11%, transparent) 1px, transparent 1px)",
        backgroundSize: "130px 130px",
      }}
    />
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(1100px circle at 50% -15%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 55%)",
      }}
    />
    <div
      className="absolute inset-x-0 bottom-0 h-48"
      style={{ background: "linear-gradient(to bottom, transparent, var(--background))" }}
    />
  </div>
)

const Spec = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col justify-center border-l border-border px-4 py-2">
    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
    <span className="font-mono text-xs font-semibold text-foreground">{value}</span>
  </div>
)

// Decorative L-shaped corner ticks, like dimension marks on a drawing.
const CornerTicks = () => (
  <>
    <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-accent/50" />
    <span className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-accent/50" />
    <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-accent/50" />
    <span className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-accent/50" />
  </>
)

export default function MixDesignPage() {
  const { getToken, isSignedIn } = useAuth()
  const { theme } = useTheme()
  const clerkAppearance = getClerkAppearance(theme)
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const [result, setResult] = useState<MixDesignResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [recalcing, setRecalcing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [wcOverride, setWcOverride] = useState<number | null>(null)

  // The last fully-submitted payload (without a w/c override), reused by the
  // interactive slider so changing w/c re-runs the same mix with a new ratio.
  const lastPayloadRef = useRef<Payload | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const buildPayload = (): Payload => {
    const p: Payload = {
      grade: Number(form.grade),
      cementType: form.cementType,
      maxAggregateSize: Number(form.maxAggregateSize),
      workabilitySlump: Number(form.workabilitySlump),
      exposureCondition: form.exposureCondition,
      concreteType: form.concreteType,
      aggregateType: form.aggregateType,
      fineAggregateZone: form.fineAggregateZone,
      useChemicalAdmixture: form.useChemicalAdmixture,
    }
    const sd = num(form.standardDeviation)
    if (sd !== undefined) p.standardDeviation = sd
    if (form.useChemicalAdmixture) {
      if (form.admixtureName.trim() !== "") p.admixtureName = form.admixtureName.trim()
      const dose = num(form.admixtureDosagePercent)
      const wr = num(form.waterReductionPercent)
      if (dose !== undefined) p.admixtureDosagePercent = dose
      if (wr !== undefined) p.waterReductionPercent = wr
      const asg = num(form.admixtureSpecificGravity)
      if (asg !== undefined) p.admixtureSpecificGravity = asg
    }
    const advanced: [keyof FormState, string][] = [
      ["cementSpecificGravity", "cementSpecificGravity"],
      ["coarseAggregateSpecificGravity", "coarseAggregateSpecificGravity"],
      ["fineAggregateSpecificGravity", "fineAggregateSpecificGravity"],
      ["coarseAggregateAbsorption", "coarseAggregateAbsorption"],
      ["fineAggregateAbsorption", "fineAggregateAbsorption"],
      ["coarseAggregateMoisture", "coarseAggregateMoisture"],
      ["fineAggregateMoisture", "fineAggregateMoisture"],
    ]
    for (const [k, key] of advanced) {
      const v = num(form[k] as string)
      if (v !== undefined) p[key] = v
    }
    return p
  }

  const runCalc = async (payload: Payload, isRecalc: boolean) => {
    if (isRecalc) setRecalcing(true)
    else setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await axios.post<MixDesignResult>(`${API}/civil/mix-design`, payload, {
        headers: { ...headers, "Content-Type": "application/json" },
      })
      setResult(res.data)
      if (!isRecalc) setWcOverride(res.data.proportions.waterCementRatio)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string; details?: string[] } | undefined
        setError(
          data?.details?.join(" ") ??
            data?.error ??
            (err.response?.status === 401
              ? "Sign in required to run a mix design."
              : "Calculation failed. Please try again."),
        )
      } else {
        setError("Calculation failed. Please try again.")
      }
    } finally {
      if (isRecalc) setRecalcing(false)
      else setLoading(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    const payload = buildPayload()
    lastPayloadRef.current = payload
    await runCalc(payload, false)
  }

  // Slider: update the displayed value immediately, debounce the recompute.
  const onWcChange = (value: number) => {
    setWcOverride(value)
    if (!lastPayloadRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const base = lastPayloadRef.current
    debounceRef.current = setTimeout(() => {
      void runCalc({ ...base, waterCementRatio: value }, true)
    }, 250)
  }

  const wcNow = wcOverride ?? result?.proportions.waterCementRatio ?? 0.5
  const wcOverMax = result ? wcNow > result.durability.maxWaterCementRatio + 1e-9 : false

  const exportPdf = () => {
    if (!result) return
    const esc = (s: string | number) =>
      String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string)
    const p = result.proportions
    const inputRows: [string, string][] = [
      ["Grade", `M${form.grade}`],
      ["Cement type", form.cementType],
      ["Max aggregate size", `${form.maxAggregateSize} mm`],
      ["Workability (slump)", `${form.workabilitySlump} mm`],
      ["Exposure condition", form.exposureCondition],
      ["Concrete type", form.concreteType],
      ["Aggregate shape", form.aggregateType],
      ["Fine aggregate zone", `Zone ${form.fineAggregateZone}`],
      ["Chemical admixture", form.useChemicalAdmixture ? form.admixtureName || "Yes" : "None"],
    ]
    const win = window.open("", "_blank", "width=900,height=1000")
    if (!win) {
      setError("Could not open the export window — check your browser's pop-up settings.")
      return
    }
    const date = new Date().toLocaleString()
    const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>Mix Design — M${esc(form.grade)} ${esc(form.exposureCondition)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 40px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #0f766e; border-bottom: 1px solid #e2e2e2; padding-bottom: 6px; margin: 26px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { color: #666; font-weight: 600; width: 40%; }
  .metrics { display: flex; gap: 12px; flex-wrap: wrap; }
  .metric { flex: 1 1 120px; border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; }
  .metric .k { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
  .metric .v { font-size: 18px; font-weight: 700; }
  .ratio { font-family: ui-monospace, Menlo, monospace; background: #f5f5f4; border-radius: 6px; padding: 10px 12px; margin-top: 12px; font-size: 14px; }
  .warn { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 8px; padding: 10px 14px; font-size: 13px; }
  .warn ul { margin: 4px 0 0; padding-left: 18px; }
  ol.steps { padding-left: 0; list-style: none; margin: 0; }
  ol.steps li { border-left: 2px solid #99f6e4; padding: 0 0 14px 14px; }
  .step-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .step-title { font-weight: 600; font-size: 13px; }
  .step-ref { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #888; }
  .step-detail { font-size: 12px; color: #444; margin: 3px 0; line-height: 1.5; }
  .step-val { font-size: 13px; font-weight: 600; color: #0f766e; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e2e2; font-size: 10px; color: #999; }
  @media print { body { padding: 24px; } @page { margin: 16mm; } }
</style></head><body>
<h1>Concrete Mix Design Report</h1>
<div class="sub">IS 10262:2019 procedure · durability limits per IS 456:2000 Table 5 · generated ${esc(date)}</div>

<h2>Design Inputs</h2>
<table><tbody>
${inputRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
<tr><th>Free water-cement ratio</th><td>${esc(p.waterCementRatio)}</td></tr>
</tbody></table>

<h2>Final Mix Proportions (per m³)</h2>
<div class="metrics">
  <div class="metric"><div class="k">Cement</div><div class="v">${esc(p.cement)} kg</div></div>
  <div class="metric"><div class="k">Water</div><div class="v">${esc(p.water)} kg</div></div>
  <div class="metric"><div class="k">Fine agg.</div><div class="v">${esc(p.fineAggregate)} kg</div></div>
  <div class="metric"><div class="k">Coarse agg.</div><div class="v">${esc(p.coarseAggregate)} kg</div></div>
  ${p.admixture !== undefined ? `<div class="metric"><div class="k">Admixture</div><div class="v">${esc(p.admixture)} kg</div></div>` : ""}
</div>
<div class="ratio">C : FA : CA : W = ${esc(p.ratio)}</div>

<h2>Per 50 kg Cement Bag</h2>
<table><tbody>
<tr><th>Water</th><td>${esc(result.perBagOf50kgCement.water)} kg</td></tr>
<tr><th>Fine aggregate</th><td>${esc(result.perBagOf50kgCement.fineAggregate)} kg</td></tr>
<tr><th>Coarse aggregate</th><td>${esc(result.perBagOf50kgCement.coarseAggregate)} kg</td></tr>
${result.perBagOf50kgCement.admixture !== undefined ? `<tr><th>Admixture</th><td>${esc(result.perBagOf50kgCement.admixture)} kg</td></tr>` : ""}
</tbody></table>

<h2>Durability Limits — ${esc(result.durability.source)}</h2>
<table><tbody>
<tr><th>Minimum cement content</th><td>${esc(result.durability.minCementContent)} kg/m³</td></tr>
<tr><th>Maximum w/c ratio</th><td>${esc(result.durability.maxWaterCementRatio)}</td></tr>
<tr><th>Minimum grade</th><td>M${esc(result.durability.minGrade)}</td></tr>
</tbody></table>

${result.warnings.length > 0 ? `<h2>Warnings</h2><div class="warn"><ul>${result.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}

<h2>Step-by-Step Derivation</h2>
<ol class="steps">
${result.steps
  .map(
    (s) => `<li>
  <div class="step-head"><span class="step-title">${esc(s.step)}. ${esc(s.title)}</span><span class="step-ref">${esc(s.reference)}</span></div>
  <div class="step-detail">${esc(s.detail)}</div>
  ${s.value !== undefined ? `<div class="step-val">= ${esc(s.value)} ${esc(s.unit ?? "")}</div>` : ""}
</li>`,
  )
  .join("")}
</ol>

<div class="footer">Computed deterministically per IS 10262:2019. Values are for preliminary proportioning; final mix proportions must be confirmed by trial batches.</div>
</body></html>`
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <BlueprintBackground />
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Engineering title block */}
        <header className="mb-6 overflow-hidden rounded-2xl border border-border bg-card/60 shadow-sm backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-stretch">
            <div className="flex flex-1 items-center gap-3 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent">
                <Calculator className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent/80">
                  Structural · Concrete
                </div>
                <h1 className="text-lg font-bold leading-tight tracking-tight sm:text-2xl">
                  Concrete Mix Design
                </h1>
              </div>
            </div>

            <div className="hidden border-t border-border sm:flex sm:border-t-0">
              <Spec label="Code" value="IS 10262:2019" />
              <Spec label="Basis" value="IS 456:2000 T5" />
              <Spec label="Units" value="kg/m³" />
            </div>

            <Link
              to="/chat"
              className="group flex items-center justify-center gap-2 border-t border-border px-5 py-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent sm:border-l sm:border-t-0"
            >
              <MessageSquare className="h-4 w-4" />
              RAG Assistant
              <span className="font-mono text-accent transition-transform group-hover:translate-x-0.5">→</span>
            </Link>

            <div className="flex items-center justify-center gap-2 border-t border-border px-5 py-4 sm:border-l sm:border-t-0">
              <Show when="signed-in">
                <UserButton
                  appearance={{
                    ...clerkAppearance,
                    elements: {
                      ...clerkAppearance.elements,
                      userButtonAvatarBox: { width: 30, height: 30 },
                    },
                  }}
                />
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal" appearance={clerkAppearance}>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                  >
                    <LogIn className="h-4 w-4" /> Sign in
                  </button>
                </SignInButton>
              </Show>
            </div>
          </div>
        </header>

        {!isSignedIn && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 backdrop-blur-sm dark:text-amber-400">
            <Ruler className="h-4 w-4 shrink-0" />
            Sign in (top-right) to run a mix design.
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ---------- Input form ---------- */}
          <form
            onSubmit={submit}
            className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm backdrop-blur-md lg:sticky lg:top-6"
          >
            <SectionLabel>Concrete</SectionLabel>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Grade (M__)">
                <input type="number" min={10} max={100} value={form.grade}
                  onChange={(e) => set("grade", e.target.value)} className={fieldCls} />
              </Field>
              <Field label="Cement type">
                <select value={form.cementType} onChange={(e) => set("cementType", e.target.value)} className={fieldCls}>
                  {CEMENTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Max aggregate (mm)">
                <select value={form.maxAggregateSize} onChange={(e) => set("maxAggregateSize", e.target.value)} className={fieldCls}>
                  {["10", "20", "40"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Slump (mm)">
                <input type="number" min={0} max={250} value={form.workabilitySlump}
                  onChange={(e) => set("workabilitySlump", e.target.value)} className={fieldCls} />
              </Field>
              <Field label="Exposure">
                <select value={form.exposureCondition} onChange={(e) => set("exposureCondition", e.target.value)} className={fieldCls}>
                  {EXPOSURES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Concrete type">
                <select value={form.concreteType} onChange={(e) => set("concreteType", e.target.value)} className={fieldCls}>
                  {["Plain", "Reinforced"].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Aggregate shape">
                <select value={form.aggregateType} onChange={(e) => set("aggregateType", e.target.value)} className={fieldCls}>
                  {["Crushed", "Natural (Uncrushed)"].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Fine agg. zone">
                <select value={form.fineAggregateZone} onChange={(e) => set("fineAggregateZone", e.target.value)} className={fieldCls}>
                  {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="Std. deviation (optional)">
                  <input type="number" step="0.1" placeholder="Table 2 assumed" value={form.standardDeviation}
                    onChange={(e) => set("standardDeviation", e.target.value)} className={fieldCls} />
                </Field>
              </div>
            </div>

            <div className="mt-5">
              <SectionLabel>Admixture</SectionLabel>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.useChemicalAdmixture}
                  onChange={(e) => set("useChemicalAdmixture", e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]" />
                Use chemical admixture
              </label>

              {form.useChemicalAdmixture && (
                <div className="mt-3 space-y-3">
                  <Field label="Admixture name / type">
                    <input type="text" placeholder="e.g. Fosroc Conplast SP430" value={form.admixtureName}
                      onChange={(e) => set("admixtureName", e.target.value)} className={fieldCls} />
                  </Field>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Dosage (% of cement)">
                      <input type="number" step="0.1" value={form.admixtureDosagePercent}
                        onChange={(e) => set("admixtureDosagePercent", e.target.value)} className={fieldCls} />
                    </Field>
                    <Field label="Water reduction (%)">
                      <input type="number" step="1" value={form.waterReductionPercent}
                        onChange={(e) => set("waterReductionPercent", e.target.value)} className={fieldCls} />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* Advanced material properties */}
            <button type="button" onClick={() => setShowAdvanced((s) => !s)}
              className="mt-5 flex w-full items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <span>Advanced — specific gravities & site corrections</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>

            {showAdvanced && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Cement SG">
                  <input type="number" step="0.01" placeholder="3.15" value={form.cementSpecificGravity}
                    onChange={(e) => set("cementSpecificGravity", e.target.value)} className={fieldCls} />
                </Field>
                {form.useChemicalAdmixture && (
                  <Field label="Admixture SG">
                    <input type="number" step="0.001" placeholder="1.145" value={form.admixtureSpecificGravity}
                      onChange={(e) => set("admixtureSpecificGravity", e.target.value)} className={fieldCls} />
                  </Field>
                )}
                <Field label="Coarse agg. SG">
                  <input type="number" step="0.01" placeholder="2.74" value={form.coarseAggregateSpecificGravity}
                    onChange={(e) => set("coarseAggregateSpecificGravity", e.target.value)} className={fieldCls} />
                </Field>
                <Field label="Fine agg. SG">
                  <input type="number" step="0.01" placeholder="2.65" value={form.fineAggregateSpecificGravity}
                    onChange={(e) => set("fineAggregateSpecificGravity", e.target.value)} className={fieldCls} />
                </Field>
                <Field label="Coarse abs. (%)">
                  <input type="number" step="0.1" placeholder="0.5" value={form.coarseAggregateAbsorption}
                    onChange={(e) => set("coarseAggregateAbsorption", e.target.value)} className={fieldCls} />
                </Field>
                <Field label="Fine abs. (%)">
                  <input type="number" step="0.1" placeholder="1.0" value={form.fineAggregateAbsorption}
                    onChange={(e) => set("fineAggregateAbsorption", e.target.value)} className={fieldCls} />
                </Field>
                <Field label="Coarse moist. (%)">
                  <input type="number" step="0.1" placeholder="0" value={form.coarseAggregateMoisture}
                    onChange={(e) => set("coarseAggregateMoisture", e.target.value)} className={fieldCls} />
                </Field>
                <Field label="Fine moist. (%)">
                  <input type="number" step="0.1" placeholder="0" value={form.fineAggregateMoisture}
                    onChange={(e) => set("fineAggregateMoisture", e.target.value)} className={fieldCls} />
                </Field>
              </div>
            )}

            <button type="submit" disabled={loading || !isSignedIn}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculating…</>
                : <><Calculator className="h-4 w-4" /> Calculate Mix Design</>}
            </button>

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </form>

          {/* ---------- Results ---------- */}
          <div className="min-w-0">
            {!result && !loading && (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/20 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card/60 text-accent">
                  <Calculator className="h-5 w-5" />
                </div>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Set your mix parameters and calculate to see the full IS 10262:2019 breakdown.
                </p>
              </div>
            )}

            {loading && !result && (
              <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border bg-card/30 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Results toolbar */}
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    Mix design results
                  </h2>
                  <button
                    type="button"
                    onClick={exportPdf}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    <Download className="h-3.5 w-3.5" /> Export PDF
                  </button>
                </div>

                {/* Interactive w/c control */}
                <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-5 shadow-sm backdrop-blur-md">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      <Droplets className="h-4 w-4 text-accent" /> Free Water-Cement Ratio
                    </h2>
                    <span className="flex items-center gap-2 font-mono text-2xl font-bold tabular-nums text-accent">
                      {recalcing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      {wcNow.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={0.7}
                    step={0.01}
                    value={wcNow}
                    onChange={(e) => onWcChange(Number(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                    aria-label="Water-cement ratio"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>0.30</span>
                    <span>Drag to recompute the entire mix</span>
                    <span>0.70</span>
                  </div>
                  <p className={`mt-2 text-[11px] ${wcOverMax ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    Durability cap for this exposure: max w/c {result.durability.maxWaterCementRatio}
                    {wcOverMax && " — current value exceeds it (see warnings)"}
                  </p>
                </div>

                {/* Final proportions */}
                <div className="relative rounded-2xl border border-accent/25 bg-card/60 p-5 shadow-sm backdrop-blur-md">
                  <CornerTicks />
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-accent/80">
                    Final mix proportions
                    <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">per m³</span>
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Cement" value={result.proportions.cement} unit="kg" />
                    <Metric label="Water" value={result.proportions.water} unit="kg" />
                    <Metric label="Fine agg." value={result.proportions.fineAggregate} unit="kg" />
                    <Metric label="Coarse agg." value={result.proportions.coarseAggregate} unit="kg" />
                  </div>
                  {result.proportions.admixture !== undefined && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Admixture: <span className="font-semibold text-foreground">{result.proportions.admixture} kg/m³</span>
                    </div>
                  )}
                  <div className="mt-3 rounded-lg bg-background/50 px-3 py-2 font-mono text-sm tabular-nums text-foreground">
                    C : FA : CA : W = {result.proportions.ratio}
                  </div>
                </div>

                {/* Per bag + durability side by side */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm backdrop-blur-md">
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Per 50 kg cement bag
                    </h2>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Water</span><b className="tabular-nums">{result.perBagOf50kgCement.water} kg</b></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Fine agg.</span><b className="tabular-nums">{result.perBagOf50kgCement.fineAggregate} kg</b></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Coarse agg.</span><b className="tabular-nums">{result.perBagOf50kgCement.coarseAggregate} kg</b></div>
                      {result.perBagOf50kgCement.admixture !== undefined && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Admixture</span><b className="tabular-nums">{result.perBagOf50kgCement.admixture} kg</b></div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm backdrop-blur-md">
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Durability limits
                    </h2>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Min cement</span><b className="tabular-nums">{result.durability.minCementContent} kg/m³</b></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Max w/c</span><b className="tabular-nums">{result.durability.maxWaterCementRatio}</b></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Min grade</span><b className="tabular-nums">M{result.durability.minGrade}</b></div>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">{result.durability.source}</p>
                  </div>
                </div>

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
                    <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="h-4 w-4" /> Warnings
                    </h2>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
                      {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}

                {/* Step-by-step */}
                <div className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm backdrop-blur-md">
                  <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Step-by-step derivation
                  </h2>
                  <ol className="space-y-4">
                    {result.steps.map((s, i) => (
                      <li key={i} className="relative border-l border-border pl-4">
                        <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-accent/70 ring-2 ring-background" />
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">{s.step}. {s.title}</span>
                          <span className="rounded-full border border-border bg-background/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {s.reference}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
                        {s.value !== undefined && (
                          <div className="mt-1 text-sm font-semibold tabular-nums text-accent">= {s.value} {s.unit ?? ""}</div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
