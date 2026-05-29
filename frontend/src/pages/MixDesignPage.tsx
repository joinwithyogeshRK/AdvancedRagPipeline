import { useState } from "react"
import axios from "axios"
import { useAuth } from "@clerk/react"
import { Link } from "react-router-dom"
import { ArrowLeft, Calculator, Loader2, TriangleAlert } from "lucide-react"

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
  admixtureDosagePercent: string
  waterReductionPercent: string
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
  admixtureDosagePercent: "1.0",
  waterReductionPercent: "23",
}

const CEMENTS = ["OPC 33", "OPC 43", "OPC 53", "PPC", "PSC", "SRC"]
const EXPOSURES = ["Mild", "Moderate", "Severe", "Very Severe", "Extreme"]
const ZONES = ["I", "II", "III", "IV"]

const fieldCls =
  "w-full rounded-lg border border-border bg-card/60 px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/30"
const labelCls = "mb-1 block text-xs font-medium tracking-wide text-muted-foreground"

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
)

export default function MixDesignPage() {
  const { getToken, isSignedIn } = useAuth()
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const [result, setResult] = useState<MixDesignResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const token = await getToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const payload = {
        grade: Number(form.grade),
        cementType: form.cementType,
        maxAggregateSize: Number(form.maxAggregateSize),
        workabilitySlump: Number(form.workabilitySlump),
        exposureCondition: form.exposureCondition,
        concreteType: form.concreteType,
        aggregateType: form.aggregateType,
        fineAggregateZone: form.fineAggregateZone,
        useChemicalAdmixture: form.useChemicalAdmixture,
        ...(form.useChemicalAdmixture
          ? {
              admixtureDosagePercent: Number(form.admixtureDosagePercent),
              waterReductionPercent: Number(form.waterReductionPercent),
            }
          : {}),
      }
      const res = await axios.post<MixDesignResult>(`${API}/civil/mix-design`, payload, {
        headers: { ...headers, "Content-Type": "application/json" },
      })
      setResult(res.data)
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
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/80 text-muted-foreground transition-colors hover:text-accent"
              aria-label="Back to chat"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight sm:text-xl">
                <Calculator className="h-5 w-5 text-accent" />
                Concrete Mix Design
              </h1>
              <p className="text-xs text-muted-foreground">
                IS 10262:2019 procedure · durability limits per IS 456:2000 Table 5
              </p>
            </div>
          </div>
        </div>

        {!isSignedIn && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
            Sign in on the main page to run a mix design.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          {/* ---------- Input form ---------- */}
          <form
            onSubmit={submit}
            className="h-fit rounded-2xl border border-border bg-card/50 p-5 shadow-sm"
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Grade (M__)">
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={form.grade}
                  onChange={(e) => set("grade", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field label="Cement type">
                <select
                  value={form.cementType}
                  onChange={(e) => set("cementType", e.target.value)}
                  className={fieldCls}
                >
                  {CEMENTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Max aggregate (mm)">
                <select
                  value={form.maxAggregateSize}
                  onChange={(e) => set("maxAggregateSize", e.target.value)}
                  className={fieldCls}
                >
                  {["10", "20", "40"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Slump (mm)">
                <input
                  type="number"
                  min={0}
                  max={250}
                  value={form.workabilitySlump}
                  onChange={(e) => set("workabilitySlump", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field label="Exposure">
                <select
                  value={form.exposureCondition}
                  onChange={(e) => set("exposureCondition", e.target.value)}
                  className={fieldCls}
                >
                  {EXPOSURES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Concrete type">
                <select
                  value={form.concreteType}
                  onChange={(e) => set("concreteType", e.target.value)}
                  className={fieldCls}
                >
                  {["Plain", "Reinforced"].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Aggregate shape">
                <select
                  value={form.aggregateType}
                  onChange={(e) => set("aggregateType", e.target.value)}
                  className={fieldCls}
                >
                  {["Crushed", "Natural (Uncrushed)"].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fine agg. zone">
                <select
                  value={form.fineAggregateZone}
                  onChange={(e) => set("fineAggregateZone", e.target.value)}
                  className={fieldCls}
                >
                  {ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.useChemicalAdmixture}
                onChange={(e) => set("useChemicalAdmixture", e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Use chemical admixture (superplasticizer)
            </label>

            {form.useChemicalAdmixture && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <Field label="Dosage (% of cement)">
                  <input
                    type="number"
                    step="0.1"
                    value={form.admixtureDosagePercent}
                    onChange={(e) => set("admixtureDosagePercent", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
                <Field label="Water reduction (%)">
                  <input
                    type="number"
                    step="1"
                    value={form.waterReductionPercent}
                    onChange={(e) => set("waterReductionPercent", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isSignedIn}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4" /> Calculate Mix Design
                </>
              )}
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
              <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
                Enter mix parameters and calculate to see the IS 10262:2019 breakdown.
              </div>
            )}

            {result && (
              <div className="space-y-5">
                {/* Final proportions */}
                <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold tracking-wide text-accent">
                    FINAL MIX PROPORTIONS (per m³)
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { k: "Cement", v: result.proportions.cement, u: "kg" },
                      { k: "Water", v: result.proportions.water, u: "kg" },
                      { k: "Fine agg.", v: result.proportions.fineAggregate, u: "kg" },
                      { k: "Coarse agg.", v: result.proportions.coarseAggregate, u: "kg" },
                    ].map((c) => (
                      <div key={c.k} className="rounded-lg border border-border bg-card/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {c.k}
                        </div>
                        <div className="text-base font-bold text-foreground">
                          {c.v}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">{c.u}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {result.proportions.admixture !== undefined && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Admixture: <span className="font-semibold text-foreground">{result.proportions.admixture} kg/m³</span>
                    </div>
                  )}
                  <div className="mt-3 rounded-lg bg-card/70 px-3 py-2 font-mono text-sm text-foreground">
                    C : FA : CA : W = {result.proportions.ratio}
                  </div>
                </div>

                {/* Per bag */}
                <div className="rounded-2xl border border-border bg-card/50 p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground">
                    PER 50 kg CEMENT BAG (site batching)
                  </h2>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span>Water: <b>{result.perBagOf50kgCement.water} kg</b></span>
                    <span>Fine agg.: <b>{result.perBagOf50kgCement.fineAggregate} kg</b></span>
                    <span>Coarse agg.: <b>{result.perBagOf50kgCement.coarseAggregate} kg</b></span>
                    {result.perBagOf50kgCement.admixture !== undefined && (
                      <span>Admixture: <b>{result.perBagOf50kgCement.admixture} kg</b></span>
                    )}
                  </div>
                </div>

                {/* Durability */}
                <div className="rounded-2xl border border-border bg-card/50 p-5 shadow-sm">
                  <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground">
                    DURABILITY LIMITS — {result.durability.source}
                  </h2>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-foreground">
                    <span>Min cement: <b>{result.durability.minCementContent} kg/m³</b></span>
                    <span>Max w/c: <b>{result.durability.maxWaterCementRatio}</b></span>
                    <span>Min grade: <b>M{result.durability.minGrade}</b></span>
                  </div>
                </div>

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
                    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="h-4 w-4" /> Warnings
                    </h2>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
                      {result.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Step-by-step */}
                <div className="rounded-2xl border border-border bg-card/50 p-5 shadow-sm">
                  <h2 className="mb-4 text-sm font-semibold tracking-wide text-muted-foreground">
                    STEP-BY-STEP DERIVATION
                  </h2>
                  <ol className="space-y-4">
                    {result.steps.map((s, i) => (
                      <li key={i} className="border-l-2 border-accent/30 pl-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {s.step}. {s.title}
                          </span>
                          <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {s.reference}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
                        {s.value !== undefined && (
                          <div className="mt-1 text-sm font-semibold text-accent">
                            = {s.value} {s.unit ?? ""}
                          </div>
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
