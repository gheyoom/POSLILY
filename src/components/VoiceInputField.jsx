// src/components/VoiceInputField.jsx
import { useEffect, useRef, useState } from "react";

function VoiceInputField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  maxDurationMs = 15000, // ✅ default 15s, can be overridden from props
}) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SR();
    recognition.lang = "ar-AE,en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onChange(transcript);
    };

    recognition.onstart = () => {
      setRecording(true);
      // ✅ stop automatically after maxDurationMs
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        recognition.stop();
      }, maxDurationMs);
    };

    recognition.onend = () => {
      setRecording(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    recognition.onerror = () => {
      setRecording(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    recognitionRef.current = recognition;

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      recognition.stop();
    };
  }, [maxDurationMs, onChange]);

  const handleClick = () => {
    if (!recognitionRef.current) return;
    if (recording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const inputClasses =
    "border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm text-stone-700">{label}</label>
        <button
          type="button"
          onClick={handleClick}
          className={`text-xs px-2 py-1 rounded-full border ${
            recording
              ? "border-rose-400 text-rose-700 bg-rose-50"
              : "border-amber-300 text-amber-800 bg-amber-50"
          }`}
        >
          {recording ? "Stop voice" : "Voice input"}
        </button>
      </div>
      {multiline ? (
        <textarea
          className={inputClasses + " min-h-[80px] resize-y"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className={inputClasses}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

export default VoiceInputField;
