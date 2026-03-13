import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    hashLength: process.env.ADMIN_PASSWORD_HASH?.length,
  });
}
