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
  const [showKey, setShowKey] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    loading: boolean;
    result?: { ok: boolean; message: string };
  }>({ loading: false });
  const [saveToast, setSaveToast] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setFormData(settings);
      setHealthStatus({ loading: false });
      setSaveToast(false);
      setShowKey(false);
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
    }, 500);
  };

  const handleReset = () => {
    setFormData(DEFAULT_SETTINGS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-[#171717] border border-[#2e2e2e] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Single Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#262626]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#212121] border border-[#303030] flex items-center justify-center text-[#f4f4f4]">
              <IconKey className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#f4f4f4]">Provider & Model Settings</h2>
              <p className="text-[11px] text-[#8e8e8e]">Configure active LLM provider and credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8e8e8e] hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Single Clean Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Provider Segmented Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[#8e8e8e] uppercase tracking-wider mb-2">
              Choose Provider
            </label>
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#121212] rounded-xl border border-[#262626]">
              {(
                [
                  { id: "mock", label: "Mock" },
                  { id: "anthropic", label: "Claude" },
                  { id: "openai", label: "OpenAI" },
                  { id: "ollama", label: "Ollama" },
                ] as const
              ).map((p) => {
                const isSelected = formData.selectedProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, selectedProvider: p.id as ProviderType })}
                    className={`py-2 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer ${
                      isSelected
                        ? "bg-[#282828] text-white shadow-xs border border-[#3d3d3d]"
                        : "text-[#8e8e8e] hover:text-[#e0e0e0] border border-transparent"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Single Provider Section based on active selection */}
          <div className="p-3.5 rounded-xl bg-[#1e1e1e] border border-[#2b2b2b] min-h-[110px] flex flex-col justify-center">
            {formData.selectedProvider === "mock" && (
              <div className="text-center py-2 space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-400">
                  <IconSparkles className="w-3.5 h-3.5" />
                  <span>Offline Mock Engine</span>
                </div>
                <p className="text-xs text-[#8e8e8e] max-w-sm mx-auto">
                  Generates watertight Replicad 3D CAD assemblies immediately with built-in templates. No API key required.
                </p>
              </div>
            )}

            {formData.selectedProvider === "anthropic" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#8e8e8e]">Anthropic API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="sk-ant-api03-..."
                      value={formData.anthropicApiKey}
                      onChange={(e) => setFormData({ ...formData, anthropicApiKey: e.target.value })}
                      className="w-full px-3 py-1.5 pr-9 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] focus:outline-hidden focus:border-[#555]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#d1d1d1]"
                    >
                      {showKey ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-[#8e8e8e]">Model ID</label>
                  <input
                    type="text"
                    value={formData.anthropicModel}
                    onChange={(e) => setFormData({ ...formData, anthropicModel: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
                  />
                </div>
              </div>
            )}

            {formData.selectedProvider === "openai" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#8e8e8e]">OpenAI API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="sk-proj-..."
                      value={formData.openaiApiKey}
                      onChange={(e) => setFormData({ ...formData, openaiApiKey: e.target.value })}
                      className="w-full px-3 py-1.5 pr-9 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] focus:outline-hidden focus:border-[#555]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#d1d1d1]"
                    >
                      {showKey ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-[#8e8e8e]">Model ID</label>
                  <input
                    type="text"
                    value={formData.openaiModel}
                    onChange={(e) => setFormData({ ...formData, openaiModel: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
                  />
                </div>
              </div>
            )}

            {formData.selectedProvider === "ollama" && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#8e8e8e]">Ollama Host</label>
                  <input
                    type="text"
                    value={formData.ollamaBaseUrl}
                    onChange={(e) => setFormData({ ...formData, ollamaBaseUrl: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#8e8e8e]">Model</label>
                  <input
                    type="text"
                    value={formData.ollamaModel}
                    onChange={(e) => setFormData({ ...formData, ollamaModel: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Backend URL & Test Connection */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] text-[#8e8e8e]">
              <span>Backend Service URL</span>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={healthStatus.loading}
                className="text-[#b4b4b4] hover:text-white underline cursor-pointer"
              >
                {healthStatus.loading ? "Connecting..." : "Test Connection"}
              </button>
            </div>

            <input
              type="text"
              value={formData.backendUrl}
              onChange={(e) => setFormData({ ...formData, backendUrl: e.target.value })}
              className="w-full px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333333] text-xs text-[#f4f4f4] focus:outline-hidden focus:border-[#555]"
            />

            {healthStatus.result && (
              <div
                className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                  healthStatus.result.ok
                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40"
                    : "bg-red-950/40 text-red-300 border border-red-800/40"
                }`}
              >
                {healthStatus.result.ok ? <IconCheck className="w-3.5 h-3.5" /> : <IconClose className="w-3.5 h-3.5" />}
                <span className="truncate">{healthStatus.result.message}</span>
              </div>
            )}
          </div>

          {/* Temperature Slider */}
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-[11px] text-[#8e8e8e]">
              <span>Temperature</span>
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
          </div>

          {/* Single Footer */}
          <div className="pt-3 border-t border-[#262626] flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-[#737373] hover:text-[#a3a3a3] transition-colors cursor-pointer"
            >
              Reset
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#8e8e8e] hover:text-white hover:bg-[#242424] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors shadow-xs cursor-pointer"
              >
                {saveToast ? (
                  <>
                    <IconCheck className="w-3.5 h-3.5 text-black" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
