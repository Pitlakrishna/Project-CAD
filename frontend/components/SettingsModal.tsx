import React, { useState } from "react";
import { AppSettings, ProviderType } from "../lib/types";
import { DEFAULT_SETTINGS } from "../lib/storage";
import { verifyProviderCredentials } from "../lib/api";
import {
  IconClose,
  IconKey,
  IconEye,
  IconEyeOff,
  IconCheck,
  IconGear,
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
  const initialProvider: ProviderType =
    settings.selectedProvider === "anthropic" ||
      settings.selectedProvider === "gemini" ||
      settings.selectedProvider === "openai"
      ? settings.selectedProvider
      : "gemini";

  const [formData, setFormData] = useState<AppSettings>({
    ...settings,
    selectedProvider: initialProvider,
  });
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    loading: boolean;
    result?: { ok: boolean; message: string };
  }>({ loading: false });
  const [saveIndicator, setSaveIndicator] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      const activeP: ProviderType =
        settings.selectedProvider === "anthropic" ||
          settings.selectedProvider === "gemini" ||
          settings.selectedProvider === "openai"
          ? settings.selectedProvider
          : "gemini";

      setFormData({ ...settings, selectedProvider: activeP });
      setVerifyStatus({ loading: false });
      setShowKey(false);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const updateSettingsDynamically = (updates: Partial<AppSettings>) => {
    const updated: AppSettings = {
      ...formData,
      ...updates,
    };
    setFormData(updated);
    onSave(updated);
    setSaveIndicator(true);
    setTimeout(() => setSaveIndicator(false), 1500);
  };

  const handleVerifyProvider = async () => {
    setVerifyStatus({ loading: true });
    const res = await verifyProviderCredentials(formData, formData.selectedProvider);
    setVerifyStatus({ loading: false, result: res });
  };

  const handleReset = () => {
    const reset = {
      ...DEFAULT_SETTINGS,
      selectedProvider: DEFAULT_SETTINGS.selectedProvider,
    };
    setFormData(reset);
    onSave(reset);
    setVerifyStatus({ loading: false });
  };

  const currentApiKey =
    formData.selectedProvider === "openai"
      ? formData.openaiApiKey
      : formData.selectedProvider === "anthropic"
        ? formData.anthropicApiKey
        : formData.geminiApiKey;

  const hasApiKey = Boolean(currentApiKey && currentApiKey.trim().length > 0);

  // Check if user has an active manual model override
  const currentModelOverride =
    formData.selectedProvider === "openai"
      ? formData.openaiModel
      : formData.selectedProvider === "anthropic"
        ? formData.anthropicModel
        : formData.geminiModel;

  const hasManualOverride = Boolean(
    currentModelOverride &&
    currentModelOverride !== "auto" &&
    currentModelOverride !== "default" &&
    currentModelOverride.trim().length > 0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-[#171717] border border-[#2e2e2e] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#262626]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#212121] border border-[#303030] flex items-center justify-center text-[#f4f4f4]">
              <IconKey className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#f4f4f4]">AI Provider Settings</h2>
              <p className="text-[11px] text-[#8e8e8e]">
                Select your AI provider and enter your API key
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8e8e8e] hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Provider Segmented Selector (OpenAI, Claude, Gemini) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-[#8e8e8e] uppercase tracking-wider">
                Select LLM Provider
              </label>
              {saveIndicator && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium animate-pulse">
                  <IconCheck className="w-3 h-3" /> Saved dynamically
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#121212] rounded-xl border border-[#262626]">
              {(
                [
                  { id: "gemini", label: "Gemini" },
                  { id: "anthropic", label: "Claude" },
                  { id: "openai", label: "OpenAI" },
                ] as const
              ).map((p) => {
                const isSelected = formData.selectedProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      updateSettingsDynamically({ selectedProvider: p.id });
                      setVerifyStatus({ loading: false });
                    }}
                    className={`py-2.5 px-2 rounded-lg text-xs font-semibold transition-all text-center cursor-pointer ${isSelected
                      ? "bg-[#2a2a2a] text-white shadow-xs border border-[#404040]"
                      : "text-[#8e8e8e] hover:text-[#e0e0e0] border border-transparent hover:bg-[#1a1a1a]"
                      }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Provider Configuration Box */}
          <div className="p-4 rounded-xl bg-[#1e1e1e] border border-[#2e2e2e] flex flex-col space-y-4">
            {/* OPENAI */}
            {formData.selectedProvider === "openai" && (
              <div className="space-y-3">
                {/* API Key */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-[#a3a3a3] font-medium">OpenAI API Key</label>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${hasApiKey
                        ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/50"
                        : "bg-neutral-800 text-neutral-400"
                        }`}
                    >
                      {hasApiKey ? "✓ Dynamic Key Active" : "Paste API Key"}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="sk-proj-..."
                      value={formData.openaiApiKey}
                      onChange={(e) => updateSettingsDynamically({ openaiApiKey: e.target.value.trim() })}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text").trim();
                        if (pasted) {
                          e.preventDefault();
                          updateSettingsDynamically({ openaiApiKey: pasted });
                        }
                      }}
                      className="w-full px-3 py-2 pr-9 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] focus:outline-hidden focus:border-[#555] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#d1d1d1] cursor-pointer"
                    >
                      {showKey ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ANTHROPIC (CLAUDE) */}
            {formData.selectedProvider === "anthropic" && (
              <div className="space-y-3">
                {/* API Key */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-[#a3a3a3] font-medium">Anthropic API Key</label>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${hasApiKey
                        ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/50"
                        : "bg-neutral-800 text-neutral-400"
                        }`}
                    >
                      {hasApiKey ? "✓ Dynamic Key Active" : "Paste API Key"}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="sk-ant-api03-..."
                      value={formData.anthropicApiKey}
                      onChange={(e) => updateSettingsDynamically({ anthropicApiKey: e.target.value.trim() })}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text").trim();
                        if (pasted) {
                          e.preventDefault();
                          updateSettingsDynamically({ anthropicApiKey: pasted });
                        }
                      }}
                      className="w-full px-3 py-2 pr-9 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] focus:outline-hidden focus:border-[#555] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#d1d1d1] cursor-pointer"
                    >
                      {showKey ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* GOOGLE GEMINI */}
            {formData.selectedProvider === "gemini" && (
              <div className="space-y-3">
                {/* API Key */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-[#a3a3a3] font-medium">Google Gemini API Key</label>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${hasApiKey
                        ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/50"
                        : "bg-neutral-800 text-neutral-400"
                        }`}
                    >
                      {hasApiKey ? "✓ Dynamic Key Active" : "Paste API Key"}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="AIzaSy..."
                      value={formData.geminiApiKey}
                      onChange={(e) => updateSettingsDynamically({ geminiApiKey: e.target.value.trim() })}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text").trim();
                        if (pasted) {
                          e.preventDefault();
                          updateSettingsDynamically({ geminiApiKey: pasted });
                        }
                      }}
                      className="w-full px-3 py-2 pr-9 rounded-lg bg-[#141414] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] focus:outline-hidden focus:border-[#555] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#d1d1d1] cursor-pointer"
                    >
                      {showKey ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Collapsible Advanced Settings (Model Override & Custom Endpoint) */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-[11px] text-[#737373] hover:text-[#b3b3b3] transition-colors cursor-pointer"
              >
                <IconGear className="w-3 h-3" />
                <span>{showAdvanced ? "Hide Advanced Settings" : "Advanced: Custom Model Override"}</span>
                {hasManualOverride && (
                  <span className="text-[10px] text-amber-400">(custom override active)</span>
                )}
              </button>

              {showAdvanced && (
                <div className="mt-2.5 p-3 rounded-xl bg-[#141414] border border-[#2a2a2a] space-y-3 text-xs animate-in fade-in duration-100">
                  {/* Model Override */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="text-[#a3a3a3]">Custom Model Override (Optional)</label>
                      <button
                        type="button"
                        onClick={() => {
                          if (formData.selectedProvider === "openai") updateSettingsDynamically({ openaiModel: "auto" });
                          if (formData.selectedProvider === "anthropic") updateSettingsDynamically({ anthropicModel: "auto" });
                          if (formData.selectedProvider === "gemini") updateSettingsDynamically({ geminiModel: "auto" });
                        }}
                        className="text-[10px] text-blue-400 hover:underline cursor-pointer"
                      >
                        Reset to Auto
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Leave empty or 'auto' for smart routing"
                      value={
                        formData.selectedProvider === "openai"
                          ? (formData.openaiModel === "auto" ? "" : formData.openaiModel)
                          : formData.selectedProvider === "anthropic"
                            ? (formData.anthropicModel === "auto" ? "" : formData.anthropicModel)
                            : (formData.geminiModel === "auto" ? "" : formData.geminiModel)
                      }
                      onChange={(e) => {
                        const val = e.target.value.trim() || "auto";
                        if (formData.selectedProvider === "openai") updateSettingsDynamically({ openaiModel: val });
                        if (formData.selectedProvider === "anthropic") updateSettingsDynamically({ anthropicModel: val });
                        if (formData.selectedProvider === "gemini") updateSettingsDynamically({ geminiModel: val });
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-[#1b1b1b] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] font-mono focus:outline-hidden"
                    />
                  </div>

                  {/* Custom Base URL (for OpenAI compatible like DeepSeek / OpenRouter / Groq) */}
                  {formData.selectedProvider === "openai" && (
                    <div className="space-y-1">
                      <label className="block text-[11px] text-[#a3a3a3]">
                        Custom Base URL <span className="text-[#666]">(e.g. https://api.deepseek.com/v1)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="https://api.openai.com/v1"
                        value={formData.openaiBaseUrl}
                        onChange={(e) => updateSettingsDynamically({ openaiBaseUrl: e.target.value.trim() })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[#1b1b1b] border border-[#333333] text-xs text-[#f4f4f4] placeholder-[#555] font-mono focus:outline-hidden"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Test Credentials Action Button */}
            <div className="pt-2 border-t border-[#2d2d2d] flex items-center justify-between">
              <span className="text-[11px] text-[#8e8e8e]">Test Active Credentials:</span>
              <button
                type="button"
                onClick={handleVerifyProvider}
                disabled={verifyStatus.loading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2a2a2a] hover:bg-[#363636] text-[#f4f4f4] border border-[#3d3d3d] hover:border-[#505050] transition-colors cursor-pointer"
              >
                {verifyStatus.loading ? "Verifying..." : "Verify Credentials"}
              </button>
            </div>

            {/* Verification Result Banner */}
            {verifyStatus.result && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${verifyStatus.result.ok
                  ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/50"
                  : "bg-red-950/50 text-red-300 border border-red-800/50"
                  }`}
              >
                {verifyStatus.result.ok ? (
                  <IconCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <IconClose className="w-4 h-4 shrink-0 text-red-400" />
                )}
                <span className="truncate">{verifyStatus.result.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#262626] bg-[#141414] flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-[#737373] hover:text-[#a3a3a3] transition-colors cursor-pointer"
          >
            Reset Defaults
          </button>

          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-[#737373] hidden sm:inline">
              Changes apply dynamically
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors shadow-xs cursor-pointer"
            >
              <IconCheck className="w-3.5 h-3.5 text-black" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
