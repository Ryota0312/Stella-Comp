import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const previews = formData.getAll("previews").filter((value) => value instanceof File);

  const uploadedBytes = previews.reduce((total, file) => total + file.size, 0);

  return NextResponse.json({
    uploadedCount: previews.length,
    uploadedBytes,
  });
}

