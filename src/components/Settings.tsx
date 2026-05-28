import { useEffect, useState, type ReactNode } from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import { useReader } from "../state/reader";
import { useSettings, DEFAULT_MODELS, type ProviderId } from "../state/settings";
import { tts } from "../lib/tts/speech";
import { Panel } from "./common/ui";

const PROVIDERS: { id: ProviderId | ""; label: string }[] = [
  { id: "", label: "None" },
  { id: "claude", label: "Claude" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama (local)" },
];

export function Settings() {
  const { panel, setPanel } = useReader();
  const open = panel === "settings";
  const s = useSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (open) tts.ready().then(setVoices);
  }, [open]);

  return (
    <Panel open={open} onClose={() => setPanel(null)} title="Settings">
      <Section title="Reading">
        <Row label="Theme">
          <Segmented
            value={s.theme}
            options={[["system", "Auto"], ["light", "Light"], ["dark", "Dark"]]}
            onChange={(v) => s.update({ theme: v as typeof s.theme })}
          />
        </Row>
        <Row label={`Text size (${s.fontScale.toFixed(2)}×)`}>
          <input type="range" min={0.8} max={1.8} step={0.05} value={s.fontScale} onChange={(e) => s.update({ fontScale: Number(e.target.value) })} className="w-40" />
        </Row>
        <Row label="Show pinyin">
          <Toggle checked={s.showPinyin} onChange={(v) => s.update({ showPinyin: v })} />
        </Row>
        <Row label="Show translation on hover">
          <Toggle checked={s.hoverTranslate} onChange={(v) => s.update({ hoverTranslate: v })} />
        </Row>
      </Section>

      <Section title="Read aloud (free, in-browser)">
        <Row label={`Speed (${s.ttsRate.toFixed(2)}×)`}>
          <input type="range" min={0.5} max={1.6} step={0.05} value={s.ttsRate} onChange={(e) => s.update({ ttsRate: Number(e.target.value) })} className="w-40" />
        </Row>
        <Row label="Voice">
          <select
            value={s.ttsVoiceURI ?? ""}
            onChange={(e) => s.update({ ttsVoiceURI: e.target.value || null })}
            className="max-w-[12rem] rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">Auto (match book)</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </Row>
        {voices.length === 0 && <p className="text-xs text-slate-400">No voices detected yet. On some systems they load after first use.</p>}
      </Section>

      <Section title="AI assistant">
        <Row label="Provider">
          <select
            value={s.provider}
            onChange={(e) => s.update({ provider: e.target.value as ProviderId | "" })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Row>

        {s.provider === "claude" && (
          <>
            <Field label="Anthropic API key" type="password" value={s.providerConfig.claude.apiKey} onChange={(v) => s.setProviderConfig("claude", { apiKey: v })} placeholder="sk-ant-…" />
            <Field label="Model" value={s.providerConfig.claude.model} onChange={(v) => s.setProviderConfig("claude", { model: v })} placeholder={DEFAULT_MODELS.claude} />
          </>
        )}
        {s.provider === "openai" && (
          <>
            <Field label="OpenAI API key" type="password" value={s.providerConfig.openai.apiKey} onChange={(v) => s.setProviderConfig("openai", { apiKey: v })} placeholder="sk-…" />
            <Field label="Model" value={s.providerConfig.openai.model} onChange={(v) => s.setProviderConfig("openai", { model: v })} placeholder={DEFAULT_MODELS.openai} />
            <Field label="Base URL" value={s.providerConfig.openai.baseUrl} onChange={(v) => s.setProviderConfig("openai", { baseUrl: v })} />
          </>
        )}
        {s.provider === "ollama" && (
          <>
            <Field label="Server URL" value={s.providerConfig.ollama.baseUrl} onChange={(v) => s.setProviderConfig("ollama", { baseUrl: v })} />
            <Field label="Model" value={s.providerConfig.ollama.model} onChange={(v) => s.setProviderConfig("ollama", { model: v })} placeholder={DEFAULT_MODELS.ollama} />
          </>
        )}
        {s.provider === "claude" || s.provider === "openai" ? (
          <p className="text-xs text-slate-400">Your key is stored only in this browser and sent directly to the provider.</p>
        ) : null}

        <Row label="Explain in">
          <Segmented
            value={s.explainIn}
            options={[["user", "My language"], ["book", "Book language"]]}
            onChange={(v) => s.update({ explainIn: v as typeof s.explainIn })}
          />
        </Row>
        <Row label="Avoid spoilers">
          <Toggle checked={s.spoilerFree} onChange={(v) => s.update({ spoilerFree: v })} />
        </Row>
        <Field label="Tone / level (optional)" value={s.tone} onChange={(v) => s.update({ tone: v })} placeholder="e.g. patient, beginner-friendly" />

        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">System prompt</label>
            <button onClick={s.resetPrompt} className="text-xs text-sky-600 hover:underline">Reset</button>
          </div>
          <textarea
            value={s.systemTemplate}
            onChange={(e) => s.update({ systemTemplate: e.target.value })}
            rows={7}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs leading-relaxed text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
          <p className="mt-1 text-xs text-slate-400">Placeholders: {"{book} {author} {language}"}. The explain-language and spoiler rules are added automatically.</p>
        </div>
      </Section>
    </Panel>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-slate-300 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 data-[state=checked]:bg-sky-600 dark:bg-slate-600 dark:focus-visible:ring-offset-slate-900"
    >
      <RadixSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[1.375rem]" />
    </RadixSwitch.Root>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`rounded-md px-2.5 py-1 text-xs ${value === id ? "bg-white text-slate-800 shadow-sm dark:bg-slate-600 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
