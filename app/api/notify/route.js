import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { toEmail, title, status, note } = await req.json();

    if (!toEmail) {
      return NextResponse.json({ message: 'No email provided' }, { status: 200 });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return NextResponse.json({ message: 'Resend API key not set' }, { status: 200 });
    }

    let statusText = 'Completed and ready on Plex!';
    if (status === 'in_progress') statusText = 'Currently downloading to Plex!';
    if (status === 'declined') statusText = `Declined. ${note ? `Reason: ${note}` : ''}`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Plex Requests <onboarding@resend.dev>',
        to: [toEmail],
        subject: `Update on your Plex request: "${title}"`,
        html: `<h2>Your request status was updated!</h2><p><strong>Title:</strong> ${title}</p><p><strong>Status:</strong> ${statusText}</p>`,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
