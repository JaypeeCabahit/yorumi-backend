import { Router, Request, Response } from 'express';

const router = Router();

const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID ?? '';
const MAL_CLIENT_SECRET = process.env.MAL_CLIENT_SECRET ?? '';

/**
 * POST /api/mal/token
 * Exchanges an OAuth authorization code for a MAL access token.
 * Body: { code: string, code_verifier: string, redirect_uri: string }
 */
router.post('/token', async (req: Request, res: Response) => {
    const { code, code_verifier, redirect_uri, grant_type, refresh_token } = req.body;
    if (!MAL_CLIENT_ID || !MAL_CLIENT_SECRET) {
        return res.status(500).json({ error: 'MAL credentials not configured on server' });
    }

    try {
        const isRefresh = grant_type === 'refresh_token';
        if (isRefresh && !refresh_token) {
            return res.status(400).json({ error: 'Missing refresh_token' });
        }
        if (!isRefresh && (!code || !code_verifier || !redirect_uri)) {
            return res.status(400).json({ error: 'Missing code, code_verifier, or redirect_uri' });
        }

        const params = new URLSearchParams({
            client_id: MAL_CLIENT_ID,
            client_secret: MAL_CLIENT_SECRET,
            grant_type: isRefresh ? 'refresh_token' : 'authorization_code',
            ...(isRefresh
                ? { refresh_token }
                : { code, code_verifier, redirect_uri }),
        });

        const tokenRes = await fetch('https://myanimelist.net/v1/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        const data = await tokenRes.json() as any;
        if (!tokenRes.ok) {
            return res.status(tokenRes.status).json({ error: data?.error ?? 'Token exchange failed', detail: data });
        }
        return res.json(data);
    } catch (err) {
        console.error('MAL token error:', err);
        return res.status(500).json({ error: 'Internal error during token operation' });
    }
});

/**
 * GET /api/mal/animelist?limit=1000&offset=0
 * Fetches the authenticated user's anime list from MAL.
 * Requires: Authorization: Bearer <access_token>
 */
router.get('/animelist', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Bearer token' });
    }

    const limit = Math.min(Number(req.query.limit) || 1000, 1000);
    const offset = Number(req.query.offset) || 0;

    try {
        const malRes = await fetch(
            `https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status,num_episodes,main_picture,title,alternative_titles,mean&limit=${limit}&offset=${offset}&nsfw=true`,
            { headers: { Authorization: auth } }
        );

        const data = await malRes.json() as any;
        if (!malRes.ok) {
            return res.status(malRes.status).json({ error: 'MAL API error', detail: data });
        }
        return res.json(data);
    } catch (err) {
        console.error('MAL animelist error:', err);
        return res.status(500).json({ error: 'Internal error fetching animelist' });
    }
});

/**
 * GET /api/mal/me
 * Returns the authenticated MAL user's profile.
 */
router.get('/me', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Bearer token' });
    }
    try {
        const malRes = await fetch('https://api.myanimelist.net/v2/users/@me', {
            headers: { Authorization: auth },
        });
        const data = await malRes.json() as any;
        return res.status(malRes.ok ? 200 : malRes.status).json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Internal error' });
    }
});

export default router;
