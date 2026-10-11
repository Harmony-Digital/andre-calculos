import { NextResponse } from "next/server";
import { version } from "../../../../package.json";
export function GET() {
  return NextResponse.json({
    status: "ok",
    version,
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    region: process.env.VERCEL_REGION ?? "local",
  });
}
