export async function POST() {
  return Response.json({ error: 'Phone scanning has retired. Upload directly from your device or open Logo Studio.' }, { status: 410 });
}
