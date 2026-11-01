import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-taraz-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status, headers: CORS_HEADERS });

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");
}

function normalizeBluSender(value: string): string {
  let digits = normalizeDigits(value).replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = digits.slice(2);
  if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
  return digits;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cleanAmount(value: string): number {
  return Number(value.replace(/[٬,،\s]/g, ""));
}

function parseBluMessage(raw: string) {
  const text = normalizeDigits(raw)
    .replace(/[\u200c\u200e\u200f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.length > 4000) {
    return { ok: false as const, code: "invalid_message", notification: "متن پیام قابل پردازش نیست." };
  }

  // Ignore one-time passwords, login/security alerts and confirmation codes.
  if (/(رمز\s*(پویا|یک.?بار.?مصرف|دوم|عبور)|کد\s*(تأیید|تایید|فعال.?سازی)|رمزساز)/i.test(text)) {
    return { ok: false as const, code: "security_message", ignored: true, notification: "" };
  }

  let direction: "debit" | "credit" | null = null;
  let transactionKind = "bank_transfer";
  const creditMatch = /(واریز|واریزی|دریافت\s+وجه|وصول\s+وجه)/i.exec(text);
  const debitMatch = /(برداشت|خرید|پرداخت|کسر\s+وجه|بسته\s+اینترنت|آنلاین\s+شد|مصرف\s+اینترنت|بسته\s+دیتا)/i.exec(text);
  // Choose the first transaction action in the message, so a later balance phrase cannot flip its direction.
  if (creditMatch && (!debitMatch || creditMatch.index < debitMatch.index)) direction = "credit";
  else if (debitMatch) direction = "debit";
  if (direction === "debit") {
    if (/(بسته\s+اینترنت|آنلاین\s+شد|مصرف\s+اینترنت|بسته\s+دیتا)/i.test(text)) transactionKind = "internet";
    else if (/(خرید)/i.test(text)) transactionKind = "purchase";
  }
  if (!direction) {
    return { ok: false as const, code: "not_transaction", ignored: true, notification: "" };
  }

  // Prefer a number explicitly introduced by "مبلغ". Never use the account balance.
  const amountPatterns = [
    /(?:مبلغ(?:\s*(?:تراکنش|برداشت|واریز|خرید))?|به\s+مبلغ)\s*[:：]?\s*([0-9][0-9٬,،.]*)\s*(ریال|تومان)?/i,
    /(?:برداشت\s+پول|واریز\s+پول|برداشت|واریز|خرید\s+بسته|خرید|پرداخت|هزینه)\D{0,55}?([0-9][0-9٬,،.]*)\s*(ریال|تومان)?/i,
  ];
  let found: RegExpMatchArray | null = null;
  for (const pattern of amountPatterns) {
    found = text.match(pattern);
    if (found) break;
  }
  if (!found) {
    return { ok: false as const, code: "amount_not_found", notification: "پیامک بلو دریافت شد، اما مبلغ تراکنش مشخص نشد؛ چیزی ثبت نشد." };
  }

  const amountOriginal = cleanAmount(found[1]);
  if (!Number.isFinite(amountOriginal) || amountOriginal <= 0 || amountOriginal > 9_000_000_000_000) {
    return { ok: false as const, code: "amount_invalid", notification: "مبلغ پیامک معتبر نیست؛ چیزی ثبت نشد." };
  }

  // In the supplied Blu SMS examples, amounts are in rials. Explicit toman is also honored.
  const explicitUnit = found[2] || "ریال";
  const originalUnit = explicitUnit === "تومان" ? "toman" : "rial";
  const amountToman = originalUnit === "rial" ? amountOriginal / 10 : amountOriginal;
  if (!Number.isFinite(amountToman) || amountToman <= 0) {
    return { ok: false as const, code: "amount_invalid", notification: "مبلغ به تومان قابل محاسبه نیست." };
  }

  // Keep only a short merchant/source label. Do not retain the original SMS body.
  let counterparty = "";
  const partyMatch = text.match(/(?:نام\s*پذیرنده|پذیرنده|فروشگاه|مبدأ|مبدا|مقصد|از\s+طرف|واریزکننده)\s*[:：]?\s*([^،؛.]{2,70})/i);
  if (partyMatch) {
    counterparty = partyMatch[1]
      .replace(/[0-9][0-9٬,،.]*/g, " ")
      .replace(/(مانده|موجودی|شماره\s*کارت|کارت|حساب|پایانه|پیگیری).*/i, "")
      .trim()
      .slice(0, 80);
  }
  if (!counterparty && transactionKind === "internet") counterparty = "بسته اینترنت";

  return {
    ok: true as const,
    direction,
    transactionKind,
    amount_original: amountOriginal,
    original_unit: originalUnit,
    amount_toman: Math.round(amountToman * 100) / 100,
    counterparty,
    normalized_message: text,
  };
}

function iranDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getSecretKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return keys.default || Object.values(keys)[0] as string || "";
  } catch {
    return "";
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json(405, { ok: false, notification: "فقط درخواست POST مجاز است." });

  const suppliedToken = request.headers.get("x-taraz-device-token") || "";
  if (!suppliedToken.startsWith("taraz_") || suppliedToken.length < 40) {
    return json(401, { ok: false, notification: "کلید اتصال آیفون معتبر نیست." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!supabaseUrl || !secretKey) {
    return json(500, { ok: false, notification: "تنظیمات امن سرور کامل نیست." });
  }

  let body: { message?: string; received_at?: string; sender?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, notification: "محتوای درخواست معتبر نیست." });
  }

  // Sender is checked even if the iPhone automation has a sender filter.
  const senderRaw = typeof body.sender === "string" ? body.sender : "";
  const sender = normalizeBluSender(senderRaw);
  if (sender !== "09999987641") {
    return json(403, { ok: false, code: "sender_not_allowed", notification: "فرستنده پیامک، شماره تأییدشده بلو نیست." });
  }

  const rawMessage = typeof body.message === "string" ? body.message : "";
  const receivedAt = body.received_at && !Number.isNaN(Date.parse(body.received_at))
    ? new Date(body.received_at).toISOString()
    : new Date().toISOString();

  const tokenHash = await sha256(suppliedToken);
  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: device, error: deviceError } = await admin.from("bank_sms_devices")
    .select("id,user_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (deviceError || !device) {
    return json(401, { ok: false, notification: "این کلید اتصال وجود ندارد یا لغو شده است. از تنظیمات تراز کلید تازه بساز." });
  }

  const parsed = parseBluMessage(rawMessage);
  if (!parsed.ok) {
    return json(200, { ok: false, ignored: parsed.ignored || false, code: parsed.code, notification: parsed.notification || "" });
  }

  const fingerprint = await sha256(`${device.user_id}|${parsed.normalized_message}|${receivedAt.slice(0, 16)}`);
  const pendingRow = {
    user_id: device.user_id,
    bank_name: "بلو بانک",
    direction: parsed.direction,
    amount_original: parsed.amount_original,
    original_unit: parsed.original_unit,
    amount_toman: parsed.amount_toman,
    counterparty: parsed.counterparty,
    occurred_at: receivedAt,
    transaction_date: iranDate(receivedAt),
    fingerprint,
  };

  const { error: insertError } = await admin.from("bank_sms_pending").insert(pendingRow);
  await admin.from("bank_sms_devices").update({ last_used_at: new Date().toISOString() }).eq("id", device.id);

  if (insertError?.code === "23505") {
    return json(200, { ok: true, duplicate: true, notification: "این پیامک قبلاً دریافت شده است." });
  }
  if (insertError) {
    console.error("Blu SMS insert failed:", insertError.code, insertError.message);
    return json(500, { ok: false, notification: "ذخیره تراکنش در تراز انجام نشد. دیتابیس را بررسی کن." });
  }

  const amount = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Math.round(parsed.amount_toman));
  const action = parsed.direction === "credit" ? "واریزی جدید" : parsed.transactionKind === "internet" ? "هزینه اینترنت جدید" : "برداشت جدید";
  return json(200, {
    ok: true,
    imported: true,
    notification: `${action} بلو: ${amount} تومان. برای تکمیل و تأیید، تراز را باز کن.`,
  });
});
