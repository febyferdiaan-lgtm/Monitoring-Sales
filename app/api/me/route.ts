import { NextRequest, NextResponse } from "next/server";
import { getAppIdentity } from "../../authz";

export async function GET(request: NextRequest) {
  const identity = await getAppIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: identity });
}

