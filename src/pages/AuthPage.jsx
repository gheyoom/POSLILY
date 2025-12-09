// src/pages/AuthPage.jsx
import { useState } from "react";
import { supabase } from "../supabaseClient";

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success"); // or "error"

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async (e) => {
  e.preventDefault();
  setLoading(true);
  setMessage("");

  try {
    if (!form.fullName || !form.username || !form.password) {
      throw new Error("Please fill all fields.");
    }

    const { data, error } = await supabase
      .from("florists")
      .insert([
        {
          full_name: form.fullName,
          name: form.fullName || form.username, // 👈 مهم جداً للعمود name
          username: form.username,
          password: form.password, // تنبيه: فقط للاستخدام الداخلي
          is_active: true,         // اختياري لو عندك هذا العمود
        },
      ])
      .select("id, full_name, username")
      .single();

    if (error) throw error;

    setMessageType("success");
    setMessage("Account created, you are now logged in.");
    onLogin(data);
  } catch (err) {
    console.error(err);
    setMessageType("error");
    setMessage(err.message || "Failed to register.");
  } finally {
    setLoading(false);
  }
};

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (!form.username || !form.password) {
        throw new Error("Please enter username and password.");
      }

      const { data, error } = await supabase
        .from("florists")
        .select("id, full_name, username")
        .eq("username", form.username)
        .eq("password", form.password)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("Wrong username or password.");
      }

      setMessageType("success");
      setMessage("Logged in successfully.");
      onLogin(data);
    } catch (err) {
      console.error(err);
      setMessageType("error");
      setMessage(err.message || "Failed to login.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = mode === "login" ? handleLogin : handleRegister;

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100">
      <div className="w-full max-w-md bg-white border border-amber-100 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold text-stone-800">
            Flower Shop POS
          </h1>
          <p className="text-xs text-stone-500">
            {mode === "login"
              ? "Sign in to manage your orders."
              : "Create a florist account to start using the system."}
          </p>
        </div>

        <div className="flex justify-center gap-2 text-sm bg-stone-100 rounded-full p-1">
          <button
            type="button"
            className={`flex-1 py-1 rounded-full ${
              mode === "login"
                ? "bg-amber-700 text-amber-50"
                : "text-stone-700"
            }`}
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={`flex-1 py-1 rounded-full ${
              mode === "register"
                ? "bg-amber-700 text-amber-50"
                : "text-stone-700"
            }`}
            onClick={() => {
              setMode("register");
              setMessage("");
            }}
          >
            Register
          </button>
        </div>

        {message && (
          <div
            className={`text-xs px-3 py-2 rounded-lg border ${
              messageType === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {message}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Full name
              </label>
              <input
                type="text"
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.fullName}
                onChange={(e) =>
                  updateField("fullName", e.target.value)
                }
                placeholder="e.g. Ahmed Ali"
              />
            </div>
          )}

          <div className="flex flex-col">
            <label className="text-sm text-stone-700 mb-1">
              Username
            </label>
            <input
              type="text"
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={form.username}
              onChange={(e) =>
                updateField("username", e.target.value)
              }
              placeholder="Choose a username"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-stone-700 mb-1">
              Password
            </label>
            <input
              type="password"
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={form.password}
              onChange={(e) =>
                updateField("password", e.target.value)
              }
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2 rounded-lg bg-amber-700 text-amber-50 text-sm font-semibold shadow-sm hover:bg-amber-800 disabled:opacity-60 transition"
          >
            {loading
              ? mode === "login"
                ? "Logging in..."
                : "Creating account..."
              : mode === "login"
              ? "Login"
              : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthPage;
