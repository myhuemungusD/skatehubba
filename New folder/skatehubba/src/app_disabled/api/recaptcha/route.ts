import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ success: false, error: "missing-token" }, { status: 400 });

    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) return NextResponse.json({ success: false, error: "missing-secret" }, { status: 500 });

    const verify = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });

    const data = await verify.json();
    const valid = data.success && (data.score === undefined || data.score >= 0.5);

    return NextResponse.json({ success: valid });
  } catch (err) {
    console.error("reCAPTCHA verify error:", err);
    return NextResponse.json({ success: false, error: "internal" }, { status: 500 });
  }
}