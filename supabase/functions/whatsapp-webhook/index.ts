// supabase/functions/whatsapp-webhook/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


// نقرأ البيانات السرّية من بيئة التشغيل
const supabaseUrl = Deno.env.get("PROJECT_URL")!;
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;

// مهم: هذا الكلاينت يستخدم service role key (فقط داخل الفنكشن)
const supabase = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  // 👇 هذا الجزء خاص بالتحقق من Webhook من فيسبوك
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("VERIFY_TOKEN") ?? "";

    if (mode === "subscribe" && token === verifyToken) {
      // نرجع challenge كما يطلب فيسبوك
      return new Response(challenge ?? "", { status: 200 });
    }

    return new Response("Forbidden", { status: 403 });
  }

  // 👈 باقي الكود كما هو (POST لمعالجة رسالة الواتساب)
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    console.log("Incoming WhatsApp webhook:", JSON.stringify(body));

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return new Response("No messages", { status: 200 });
    }

    const msg = messages[0];

    const wa_message_id = msg.id;
    const wa_from = msg.from;
    const wa_text =
      msg.text?.body ??
      msg.button?.text ??
      msg.interactive?.button_reply?.title ??
      "";

    const wa_name =
      value?.contacts?.[0]?.profile?.name ?? null;

    const { error } = await supabase
      .from("whatsapp_orders")
      .insert([
        {
          wa_message_id,
          wa_from,
          wa_name,
          wa_text,
          status: "new",
        },
      ]);

    if (error) {
      console.error("Error inserting whatsapp_orders:", error);
      return new Response("DB error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
});

