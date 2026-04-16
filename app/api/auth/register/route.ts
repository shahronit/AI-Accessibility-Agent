import { NextResponse } from "next/server";
import { createUser, getUserByEmail } from "@/lib/db";
import {
  hashPassword,
  generateToken,
  validateEmail,
  validatePassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !validateEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const pwError = validatePassword(password ?? "");
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }

    if (getUserByEmail(email)) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hash = await hashPassword(password!);
    const user = createUser(email, hash, name);
    const token = generateToken(user);

    return NextResponse.json(
      {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
