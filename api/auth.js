export default async function handler(req, res) {
  const MIN_LENGTH = 6;

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ ok: false, error: 'Missing user_id' });
  }

  if (user_id.length < MIN_LENGTH) {
    return res.status(403).json({
      ok: false,
      error: `user_id too short (min ${MIN_LENGTH})`
    });
  }

  return res.status(200).json({ ok: true, message: 'Auth success' });
}
