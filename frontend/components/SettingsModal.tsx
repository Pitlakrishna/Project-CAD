import React, { useState } from "react";
import { AppSettings, ProviderType } from "../lib/types";
import { DEFAULT_SETTINGS } from "../lib/storage";
import { checkBackendHealth } from "../lib/api";
import {
  IconClose,
  IconKey,
  IconEye,
  IconEyeOff,
  IconCheck,
  IconSparkles,
} from "./icons";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
}: SettingsModalProps) {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    loading: boolean;
    result?: { ok: boolean; message: string };
  }>({ loading: false });
  const [saveToast, setSaveToast] = useState(false);

  // Sync state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setFormData(settings);
      setHealthStatus({ loading: false });
      setSaveToast(false);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setHealthStatus({ loading: true });
    const res = await checkBackendHealth(formData.backendUrl);
    setHealthStatus({ loading: false, result: res });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSaveToast(true);
    setTimeout(() => {
      setSaveToast(false);
      onClose();
    }, 600);
  };

  const handleReset = () => {
    setFormData(DEFAULT_SETTINGS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-[#171717] border border-[#2e2e2e] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#212121] border border-[#303030] flex items-center justify-center text-[#f4f4f4]">
              <IconKey className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#f4f4f4]">Settings & Provider API Keys</h2>
              <p className="text-xs text-[#8e8e8e]">Configure LLM models, API keys, and backend parameters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8e8e8e] hover:text-white hover:bg-[#262626] transition-colors"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Active Provider Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#d1d1d1] uppercase tracking-wider mb-2.5">
              Active LLM Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: "mock", label: "Mock Mode", desc: "No API Key" },
                  { id: "anthropic", label: "Anthropic", desc: "Claude 3.5" },
                  { id: "openai", label: "OpenAI", desc: "GPT-4o" },
                  { id: "ollama", label: "Ollama", desc: "Local Host" },
                ] as const
              ).map((p) => {
                const isSelected = formData.selectedProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, selectedProvider: p.id as ProviderType })}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#242424] border-[#4a4a4a] text-white shadow-xs"
                        : "bg-[#1c1c1c] border-[#292929] text-[#a3a3a3] hover:border-[#383838] hover:text-[#e5e5e5]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                      <span>{p.label}</span>
                    </div>
                    <span className="text-[11px] text-[#737373] mt-0.5">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Anthropic Section */}
          <div className="p-4 rounded-xl bg-[#1c1c1c] border border-[#292929] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#e5e5e5] flex items-center gap-1.5">
                <IconSparkles className="w-3.5 h-3.5 text-amber-400" />
                Anthropic Claude
              </span>
              <span className="text-[11px] text-[#737373]">Claude 3.5 Sonnet / Haiku</span>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-[#8e8e8e]">Anthropic API Key</label>
              <div className="relative">
                <input
                  type={showAnthropicKey ? "text" : "password"}
                  placeholder="sk-ant-api03-..."
                  value={formData.anthropicApiKey}
                  onChange={(e) => setFormData({ ...formData, anthropicApiKey: e.target.value })}
                  className="w-full px-3 py-2 pr-10 rounded-lg bg-[#242424] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] focus:outline-hidden focus:border-[#555] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#d1d1d1]"
                >
                  {showAnthropicKey ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-[#8e8e8e]">Model ID</label>
              <input
                type="text"
                value={formData.anthropicModel}
                onChange={(e) => setFormData({ ...formData, anthropicModel: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#242424] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
              />
            </div>
          </div>

          {/* OpenAI Section */}
          <div className="p-4 rounded-xl bg-[#1c1c1c] border border-[#292929] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#e5e5e5] flex items-center gap-1.5">
                <IconSparkles className="w-3.5 h-3.5 text-emerald-400" />
                OpenAI
              </span>
              <span className="text-[11px] text-[#737373]">GPT-4o / GPT-4 Turbo</span>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-[#8e8e8e]">OpenAI API Key</label>
              <div className="relative">
                <input
                  type={showOpenAiKey ? "text" : "password"}
                  placeholder="sk-proj-..."
                  value={formData.openaiApiKey}
                  onChange={(e) => setFormData({ ...formData, openaiApiKey: e.target.value })}
                  className="w-full px-3 py-2 pr-10 rounded-lg bg-[#242424] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] focus:outline-hidden focus:border-[#555] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#d1d1d1]"
                >
                  {showOpenAiKey ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-[#8e8e8e]">Model ID</label>
              <input
                type="text"
                value={formData.openaiModel}
                onChange={(e) => setFormData({ ...formData, openaiModel: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#242424] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
              />
            </div>
          </div>

          {/* Ollama Section */}
          <div className="p-4 rounded-xl bg-[#1c1c1c] border border-[#292929] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#e5e5e5]">Ollama (Local LLM)</span>
              <span className="text-[11px] text-[#737373]">Self-hosted open weights</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] text-[#8e8e8e]">Ollama Base URL</label>
                <input
                  type="text"
                  value={formData.ollamaBaseUrl}
                  onChange={(e) => setFormData({ ...formData, ollamaBaseUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#242424] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-[#8e8e8e]">Ollama Model</label>
                <input
                  type="text"
                  value={formData.ollamaModel}
                  onChange={(e) => setFormData({ ...formData, ollamaModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#242424] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
                />
              </div>
            </div>
          </div>

          {/* Backend & Sampling */}
          <div className="p-4 rounded-xl bg-[#1c1c1c] border border-[#292929] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#e5e5e5]">Backend Service & Sampling</span>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={healthStatus.loading}
                className="text-xs text-[#d1d1d1] hover:text-white bg-[#262626] hover:bg-[#303030] px-2.5 py-1 rounded-md transition-colors cursor-pointer"
              >
                {healthStatus.loading ? "Pinging..." : "Test Connection"}
              </button>
            </div>

            {healthStatus.result && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  healthStatus.result.ok
                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/50"
                    : "bg-red-950/40 text-red-300 border border-red-800/50"
                }`}
              >
                {healthStatus.result.ok ? (
                  <IconCheck className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <IconClose className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{healthStatus.result.message}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] text-[#8e8e8e]">Backend Service URL</label>
              <input
                type="text"
                value={formData.backendUrl}
                onChange={(e) => setFormData({ ...formData, backendUrl: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#242424] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-[#8e8e8e]">
                <span>Sampling Temperature</span>
                <span className="font-mono text-[#f4f4f4]">{formData.temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                className="w-full accent-neutral-300 bg-[#242424] h-1.5 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#737373]">
                <span>Deterministic (0.0)</span>
                <span>Creative (1.0)</span>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-[#8e8e8e] hover:text-[#d1d1d1] transition-colors cursor-pointer"
            >
              Reset to defaults
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#8e8e8e] hover:text-white hover:bg-[#242424] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors shadow-xs cursor-pointer"
              >
                {saveToast ? (
                  <>
                    <IconCheck className="w-3.5 h-3.5 text-black" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
