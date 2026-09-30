'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Maximum pending requests allowed per standard user
const MAX_ACTIVE_REQUESTS = 10;

function cleanString(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function cleanYear(yr) {
  if (!yr) return '';
  const match = String(yr).match(/\d{4}/);
  return match ? match[0] : '';
}

function getTheatricalStatus(releaseDateStr, mediaType) {
  if (!releaseDateStr || mediaType === 'tv') return null;
  const release = new Date(releaseDateStr);
  const now = new Date();
  if (isNaN(release.getTime())) return null;

  if (release > now) return 'Upcoming / In Theaters';
  const diffDays = Math.floor((now - release) / (1000 * 60 * 60 * 24));
  if (diffDays <= 75) return 'In Theaters / Pre-Digital';
  return null;
}

const PRIMARY_GENRES = [
  { label: 'Trending', id: 'trending' },
  { label: 'Movies', id: 'movie' },
  { label: 'TV Shows', id: 'tv' },
  { label: 'Action', id: '28' },
  { label: 'Comedy', id: '35' },
  { label: 'Horror', id: '27' },
  { label: 'Sci-Fi', id: '878' },
];

const EXTENDED_GENRES = [
  { label: 'Animation', id: '16' },
  { label: 'Documentary', id: '99' },
  { label: 'Drama', id: '18' },
  { label: 'Family', id: '10751' },
  { label: 'Fantasy', id: '14' },
  { label: 'Mystery', id: '9648' },
  { label: 'Thriller', id: '53' },
  { label: 'Western', id: '37' },
];

export default function Home() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authHint, setAuthHint] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // App Settings & Theme
  const [theme, setTheme] = useState('dark');
  const [tempName, setTempName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [tempHint, setTempHint] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Search & Catalog
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('trending');
  const [showExtendedGenres, setShowExtendedGenres] = useState(false);
  const [results, setResults] = useState([]);
  const [userRequests, setUserRequests] = useState([]);
  const [matchedDbItems, setMatchedDbItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('search');

  // Modals & Feedback
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerActive, setBannerActive] = useState(false);

  // Admin Dashboard State
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [bannerInput, setBannerInput] = useState('');
  const [bannerToggle, setBannerToggle] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [inspectUser, setInspectUser] = useState(null);
  const [declineNoteInput, setDeclineNoteInput] = useState({});
  const [showNoteBox, setShowNoteBox] = useState({});

  useEffect(() => {
    const savedUser = localStorage.getItem('plex_user_session');
    const savedTheme = localStorage.getItem('plex_theme') || 'dark';
    setTheme(savedTheme);

    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setCurrentUser(parsed);
      } catch (e) {
        localStorage.removeItem('plex_user_session');
      }
    }
    fetchUserRequests();
    fetchSiteSettings();
  }, []);

  useEffect(() => {
    if (currentUser?.is_admin) {
      fetchProfiles();
    }
  }, [currentUser]);

  const fetchSiteSettings = async () => {
    const { data } = await supabase.from('site_settings').select('*').eq('id', 'global').single();
    if (data) {
      setBannerMessage(data.banner_message || '');
      setBannerActive(data.banner_active || false);
      setDiscordWebhook(data.discord_webhook_url || '');
      setBannerInput(data.banner_message || '');
      setBannerToggle(data.banner_active || false);
    }
  };

  const fetchUserRequests = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data } = await supabase
      .from('requests')
      .select('*')
      .neq('requested_by', 'Plex Library')
      .or(`status.in.(pending,in_progress),created_at.gte.${thirtyDaysAgo.toISOString()}`)
      .order('created_at', { ascending: false });

    if (data) setUserRequests(data);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setProfiles(data);
  };

  // Auth: Handle Sign In
  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    const email = authEmail.trim().toLowerCase();
    const pass = authPassword.trim();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      setAuthError('Account not found with this email.');
      setAuthLoading(false);
      return;
    }

    if (data.password !== pass) {
      setAuthError('Incorrect password.');
      setAuthLoading(false);
      return;
    }

    setCurrentUser(data);
    localStorage.setItem('plex_user_session', JSON.stringify(data));
    setAuthLoading(false);
  };

  // Auth: Handle Sign Up
  const handleSignUp = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    const name = authName.trim();
    const email = authEmail.trim().toLowerCase();
    const pass = authPassword.trim();
    const hint = authHint.trim();

    if (!name || !email || !pass) {
      setAuthError('Name, email, and password are required.');
      setAuthLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      setAuthError('An account with this email already exists. Sign In instead.');
      setAuthLoading(false);
      return;
    }

    const { data: newUser, error } = await supabase
      .from('profiles')
      .insert([{ 
        name, 
        email, 
        password: pass, 
        password_hint: hint || null, 
        is_admin: false 
      }])
      .select()
      .single();

    if (error) {
      setAuthError(`Sign up failed: ${error.message}`);
      setAuthLoading(false);
      return;
    }

    setCurrentUser(newUser);
    localStorage.setItem('plex_user_session', JSON.stringify(newUser));
    setAuthLoading(false);
  };

  const handleFetchPasswordHint = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    const email = authEmail.trim().toLowerCase();
    if (!email) {
      setAuthError('Enter your email address first.');
      setAuthLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('password_hint')
      .eq('email', email)
      .single();

    if (error || !data) {
      setAuthError('No account found for this email.');
      setAuthLoading(false);
      return;
    }

    if (data.password_hint) {
      setAuthSuccess(`Your password hint: "${data.password_hint}"`);
    } else {
      setAuthError('No hint was saved for this account. Contact the admin to reset your password.');
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('plex_user_session');
    setCurrentUser(null);
    setActiveTab('search');
    setShowSettings(false);
  };

  // Discovery
  useEffect(() => {
    if (search.trim()) return;

    async function loadDiscovery() {
      setLoading(true);
      try {
        let endpoint = `https://api.themoviedb.org/3/trending/all/day?api_key=${TMDB_KEY}`;
        if (selectedGenre === 'movie') {
          endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}`;
        } else if (selectedGenre === 'tv') {
          endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}`;
        } else if (selectedGenre !== 'trending') {
          endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=${selectedGenre}&sort_by=popularity.desc`;
        }

        const res = await fetch(endpoint);
        const data = await res.json();
        const cleaned = (data.results || []).filter(item => item.poster_path);
        setResults(cleaned);
        checkDbMatches(cleaned);
      } catch (err) {
        console.error('Discovery error:', err);
      }
      setLoading(false);
    }

    loadDiscovery();
  }, [selectedGenre, search]);

  // Search Multi TMDB
  useEffect(() => {
    if (!search.trim()) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const query = encodeURIComponent(search);
        const [res1, res2, res3] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&page=1`).then(r => r.json()),
          fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&page=2`).then(r => r.json()),
          fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&page=3`).then(r => r.json()),
        ]);

        const rawList = [...(res1.results || []), ...(res2.results || []), ...(res3.results || [])];
        const seenIds = new Set();
        const filtered = rawList
          .filter(item => {
            if (!item.poster_path) return false;
            if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
            if (seenIds.has(item.id)) return false;
            seenIds.add(item.id);
            return true;
          })
          .sort((a, b) => (b.popularity || 0) * (b.vote_count || 1) - (a.popularity || 0) * (a.vote_count || 1));

        setResults(filtered);
        checkDbMatches(filtered);
      } catch (err) {
        console.error('Search error:', err);
      }
      setLoading(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const checkDbMatches = async (items) => {
    if (!items || items.length === 0) return;
    const titlesToSearch = items.map(item => (item.title || item.name || '').trim()).filter(Boolean);
    const searchParam = search.trim();
    
    let query = supabase.from('requests').select('*');
    if (searchParam) {
      query = query.or(`title.in.(${titlesToSearch.map(t => `"${t.replace(/"/g, '')}"`).join(',')}),title.ilike.%${searchParam}%`);
    } else {
      query = query.in('title', titlesToSearch);
    }

    const { data: dbMatches } = await query;
    if (dbMatches) setMatchedDbItems(dbMatches);
  };

  const findDbMatch = (item) => {
    const title = item.title || item.name;
    const year = cleanYear(item.release_date || item.first_air_date || '');
    const tmdbId = String(item.id);
    const cleanItemTitle = cleanString(title);

    return matchedDbItems.find(r => {
      if (r.status === 'declined') return false;
      if (r.tmdb_id && String(r.tmdb_id) === tmdbId) return true;
      const cleanDbTitle = cleanString(r.title);
      const cleanDbYear = cleanYear(r.year);

      const titlesMatch = cleanDbTitle === cleanItemTitle || 
                          (cleanDbTitle.length > 4 && cleanItemTitle.includes(cleanDbTitle)) ||
                          (cleanItemTitle.length > 4 && cleanDbTitle.includes(cleanItemTitle));

      if (titlesMatch) {
        if (cleanDbYear && year) return cleanDbYear === year;
        return true;
      }
      return false;
    });
  };

  const handleOpenDetails = async (item) => {
    const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    let trailerKey = null;

    try {
      const res = await fetch(`https://api.themoviedb.org/3/${type}/${item.id}/videos?api_key=${TMDB_KEY}`);
      const data = await res.json();
      const trailer = (data.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
      if (trailer) trailerKey = trailer.key;
    } catch (e) {
      console.error('Trailer error:', e);
    }

    setSelectedMedia({ ...item, trailerKey, media_type: type });
  };

  const handleRequest = async (item) => {
    if (!currentUser) return;
    const title = item.title || item.name;
    const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const year = cleanYear(item.release_date || item.first_air_date || '');
    const tmdbId = String(item.id);

    const userPendingCount = userRequests.filter(
      r => r.user_email?.toLowerCase() === currentUser.email?.toLowerCase() && r.status === 'pending'
    ).length;

    if (!currentUser.is_admin && userPendingCount >= MAX_ACTIVE_REQUESTS) {
      alert(`Request limit reached! You already have ${MAX_ACTIVE_REQUESTS} active pending requests.`);
      return;
    }

    const existing = findDbMatch(item);
    if (existing && existing.status === 'done') {
      alert(`"${title}" is already on Plex!`);
      return;
    }
    if (existing && existing.status === 'pending') {
      alert(`"${title}" has already been requested!`);
      return;
    }

    const { data: newRow, error } = await supabase.from('requests').insert([{
      title,
      media_type: mediaType,
      year,
      poster_path: item.poster_path,
      tmdb_id: tmdbId,
      requested_by: currentUser.name,
      user_email: currentUser.email,
      status: 'pending'
    }]).select().single();

    if (error) {
      alert(`Error submitting request: ${error.message}`);
      return;
    }

    if (discordWebhook) {
      try {
        await fetch(discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: `🎬 New Plex Request: ${title} (${year})`,
              description: `**Requested by:** ${currentUser.name}\n**Email:** ${currentUser.email}\n**Type:** ${mediaType.toUpperCase()}`,
              thumbnail: { url: `https://image.tmdb.org/t/p/w200${item.poster_path}` },
              color: 16098851
            }]
          })
        });
      } catch (err) {
        console.error('Discord error:', err);
      }
    }

    alert(`Requested "${title}"!`);
    await fetchUserRequests();
    setMatchedDbItems(prev => [...prev.filter(r => r.title !== title), newRow || { title, year, status: 'pending', tmdb_id: tmdbId, user_email: currentUser.email }]);
    setSelectedMedia(null);
  };

  const handleDismissOrCancel = async (id) => {
    setUserRequests(prev => prev.filter(r => r.id !== id));
    setMatchedDbItems(prev => prev.filter(r => r.id !== id));
    if (selectedMedia) setSelectedMedia(null);

    const { error } = await supabase.from('requests').delete().eq('id', id);
    if (error) {
      console.error('Delete error:', error);
      fetchUserRequests();
    }
  };

  const updateStatus = async (id, status, note = '') => {
    const { error } = await supabase.from('requests').update({ 
      status, 
      admin_note: note 
    }).eq('id', id);
    
    if (!error) {
      await fetchUserRequests();
      setMatchedDbItems(prev => prev.map(item => item.id === id ? { ...item, status, admin_note: note } : item));
    }
  };

  const handlePruneOldRequests = async () => {
    if (!confirm('Permanently delete all Done and Declined requests older than 30 days?')) return;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { error } = await supabase
      .from('requests')
      .delete()
      .in('status', ['done', 'declined'])
      .lte('created_at', thirtyDaysAgo.toISOString());

    if (!error) {
      alert('Pruned resolved requests older than 30 days!');
      fetchUserRequests();
    } else {
      alert(`Error pruning: ${error.message}`);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;

    const updatedName = tempName.trim();
    const updatePayload = { name: updatedName };
    if (tempPassword.trim()) updatePayload.password = tempPassword.trim();
    if (tempHint.trim()) updatePayload.password_hint = tempHint.trim();

    const { error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('email', currentUser.email);

    if (!error) {
      await supabase
        .from('requests')
        .update({ requested_by: updatedName })
        .eq('user_email', currentUser.email);

      const updatedUser = { ...currentUser, ...updatePayload };
      setCurrentUser(updatedUser);
      localStorage.setItem('plex_user_session', JSON.stringify(updatedUser));
      localStorage.setItem('plex_theme', theme);
      setShowSettings(false);
      fetchUserRequests();
      alert('Profile updated successfully!');
    }
  };

  const handleAdminRenameUser = async (profileId, oldName, userEmail) => {
    const newName = prompt('Enter new display name for user:', oldName);
    if (!newName || newName.trim() === oldName) return;

    const trimmed = newName.trim();
    await supabase.from('profiles').update({ name: trimmed }).eq('id', profileId);
    await supabase.from('requests').update({ requested_by: trimmed }).eq('user_email', userEmail);
    fetchProfiles();
    fetchUserRequests();
  };

  const handleAdminResetPassword = async (profileId, userEmail) => {
    const newPass = prompt(`Enter new temporary password for ${userEmail}:`);
    if (!newPass || !newPass.trim()) return;

    const { error } = await supabase
      .from('profiles')
      .update({ password: newPass.trim() })
      .eq('id', profileId);

    if (!error) {
      alert(`Password for ${userEmail} reset to: "${newPass.trim()}"`);
      fetchProfiles();
    }
  };

  const handleAdminDeleteUser = async (profileId, profileEmail) => {
    if (!confirm(`Delete user "${profileEmail}" and all their requests?`)) return;
    await supabase.from('profiles').delete().eq('id', profileId);
    await supabase.from('requests').delete().eq('user_email', profileEmail);
    fetchProfiles();
    fetchUserRequests();
    if (inspectUser?.email === profileEmail) setInspectUser(null);
  };

  const handleCopyAllEmails = () => {
    const emails = profiles.map(p => p.email).filter(Boolean).join(', ');
    if (!emails) {
      alert('No user emails available.');
      return;
    }
    navigator.clipboard.writeText(emails);
    alert('All user emails copied to clipboard!');
  };

  const saveAdminSettings = async () => {
    const { error } = await supabase.from('site_settings').upsert({
      id: 'global',
      banner_message: bannerInput,
      banner_active: bannerToggle,
      discord_webhook_url: discordWebhook
    });

    if (!error) {
      setBannerMessage(bannerInput);
      setBannerActive(bannerToggle);
      alert('Settings saved!');
    }
  };

  const openPlexNative = (title) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(title);
      setToastMessage(`Copied "${title}" to clipboard! Paste it into Plex search.`);
      setTimeout(() => setToastMessage(''), 4000);
    }
    setTimeout(() => {
      window.location.href = `plex://search`;
    }, 250);
  };

  const isLight = theme === 'light';
  const visibleRequests = userRequests.filter(r => r.user_email?.toLowerCase() === currentUser?.email?.toLowerCase());
  const activePendingCount = visibleRequests.filter(r => r.status === 'pending').length;

  // #1 Trending Hero Title
  const heroItem = (!search.trim() && selectedGenre === 'trending' && results.length > 0 && results[0]?.backdrop_path) 
    ? results[0] 
    : null;

  // ==========================================
  // VIEW: AUTHENTICATION / SIGN IN SCREEN
  // ==========================================
  if (!currentUser) {
    return (
      <main className={`min-h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'} flex items-center justify-center p-4 font-sans transition-colors duration-200`}>
        <div className={`${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border p-6 rounded-3xl max-w-sm w-full space-y-5 shadow-2xl`}>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black text-amber-500 tracking-tight">Plex Requests</h1>
            <p className="text-xs opacity-70">
              {authMode === 'signin' && 'Sign in to request media'}
              {authMode === 'signup' && 'Create your server request account'}
              {authMode === 'forgot' && 'Password Hint Recovery'}
            </p>
          </div>

          {authMode !== 'forgot' && (
            <div className="flex bg-slate-950/40 p-1 rounded-2xl border border-slate-800 text-xs font-bold">
              <button
                onClick={() => { setAuthMode('signin'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 py-2 rounded-xl transition ${authMode === 'signin' ? 'bg-amber-500 text-slate-950 shadow-md' : 'opacity-60 hover:opacity-100'}`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 py-2 rounded-xl transition ${authMode === 'signup' ? 'bg-amber-500 text-slate-950 shadow-md' : 'opacity-60 hover:opacity-100'}`}
              >
                Create Account
              </button>
            </div>
          )}

          {authError && (
            <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800 p-2.5 rounded-xl text-center font-medium">
              {authError}
            </p>
          )}

          {authSuccess && (
            <p className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800 p-2.5 rounded-xl text-center font-medium">
              {authSuccess}
            </p>
          )}

          {authMode !== 'forgot' ? (
            <form onSubmit={authMode === 'signin' ? handleSignIn : handleSignUp} className="space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="text-xs font-semibold">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your name"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className={`w-full mt-1 ${isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'} border px-3 py-2.5 rounded-xl text-xs outline-none focus:border-amber-500`}
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className={`w-full mt-1 ${isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'} border px-3 py-2.5 rounded-xl text-xs outline-none focus:border-amber-500`}
                />
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold">Password</label>
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => { setAuthMode('forgot'); setAuthError(''); setAuthSuccess(''); }}
                      className="text-[11px] text-amber-500 hover:underline"
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className={`w-full mt-1 ${isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'} border px-3 py-2.5 rounded-xl text-xs outline-none focus:border-amber-500`}
                />
              </div>

              {authMode === 'signup' && (
                <div>
                  <label className="text-xs font-semibold">Password Hint (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Favorite sports team"
                    value={authHint}
                    onChange={(e) => setAuthHint(e.target.value)}
                    className={`w-full mt-1 ${isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'} border px-3 py-2.5 rounded-xl text-xs outline-none focus:border-amber-500`}
                  />
                  <p className="text-[10px] opacity-60 mt-1">Shown if you ever forget your password.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-amber-500 hover:bg-amber-600 font-bold py-3 rounded-xl text-slate-950 text-xs transition mt-2 disabled:opacity-50 shadow-lg shadow-amber-500/20"
              >
                {authLoading ? 'Please wait...' : authMode === 'signin' ? 'Sign In' : 'Register Account'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleFetchPasswordHint} className="space-y-3">
              <div>
                <label className="text-xs font-semibold">Enter your account email</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className={`w-full mt-1 ${isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'} border px-3 py-2.5 rounded-xl text-xs outline-none focus:border-amber-500`}
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-amber-500 hover:bg-amber-600 font-bold py-3 rounded-xl text-slate-950 text-xs transition disabled:opacity-50"
              >
                {authLoading ? 'Checking...' : 'Show Password Hint'}
              </button>

              <button
                type="button"
                onClick={() => { setAuthMode('signin'); setAuthError(''); setAuthSuccess(''); }}
                className="w-full text-center text-xs opacity-70 hover:opacity-100 underline pt-1"
              >
                ← Back to Sign In
              </button>
            </form>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-slate-800/60 text-xs opacity-70">
            <span>Appearance:</span>
            <button
              onClick={() => {
                const next = isLight ? 'dark' : 'light';
                setTheme(next);
                localStorage.setItem('plex_theme', next);
              }}
              className="font-bold underline"
            >
              {isLight ? '🌙 Dark Mode' : '☀️ Light Mode'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIEW: MAIN APPLICATION
  // ==========================================
  return (
    <div className={`min-h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'} font-sans transition-colors duration-200 pb-32`}>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        {toastMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-slate-950 font-bold px-5 py-2.5 rounded-2xl text-xs shadow-2xl animate-bounce text-center max-w-[90%]">
            {toastMessage}
          </div>
        )}

        {bannerActive && bannerMessage && (
          <aside aria-label="Announcement" className="bg-amber-500/10 border border-amber-500/30 text-amber-500 p-3 rounded-2xl text-xs flex items-center gap-2 shadow-inner">
            <span className="text-base" aria-hidden="true">📢</span>
            <p className="font-semibold flex-1">{bannerMessage}</p>
          </aside>
        )}

        {/* Minimalist Header */}
        <header className="flex justify-between items-center py-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-lg shadow-amber-500/20">
              {currentUser.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none">
                {currentUser.name}
              </h1>
              <p className="text-[11px] opacity-60">
                {currentUser.is_admin ? <span className="text-amber-500 font-bold">Admin Privileges</span> : 'Server Requester'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => { 
                setTempName(currentUser.name); 
                setTempPassword(''); 
                setTempHint(currentUser.password_hint || '');
                setShowSettings(true); 
              }}
              className={`p-2.5 rounded-2xl border ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'} hover:border-amber-500/50 transition`}
              title="Account Settings"
              aria-label="Settings"
            >
              ⚙️
            </button>
            <button 
              onClick={handleLogout}
              className={`text-xs px-3 py-2.5 rounded-2xl border font-bold ${isLight ? 'bg-white border-slate-300 text-rose-600' : 'bg-slate-900/80 border-slate-800 text-rose-400'} hover:border-rose-500/50 transition`}
            >
              Log Out
            </button>
          </div>
        </header>

        {/* Tab 1: Search & Discovery */}
        {activeTab === 'search' && (
          <section className="space-y-5">
            {/* Cinematic Hero Billboard (Featured #1 Trending Title) */}
            {heroItem && (
              <div 
                onClick={() => handleOpenDetails(heroItem)}
                className="relative rounded-3xl overflow-hidden aspect-[16/9] sm:aspect-[21/9] border border-white/10 shadow-2xl cursor-pointer group"
              >
                <img 
                  src={`https://image.tmdb.org/t/p/w1280${heroItem.backdrop_path}`} 
                  alt={heroItem.title || heroItem.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                
                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7 flex flex-col justify-end gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-500 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wider">
                      #1 Featured
                    </span>
                    <span className="text-xs font-semibold text-white/90">
                      ★ {heroItem.vote_average?.toFixed(1)} • {cleanYear(heroItem.release_date || heroItem.first_air_date)}
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight drop-shadow-md line-clamp-1">
                    {heroItem.title || heroItem.name}
                  </h2>

                  <p className="text-xs text-white/80 line-clamp-2 max-w-xl font-normal hidden sm:block">
                    {heroItem.overview}
                  </p>

                  <div className="flex items-center gap-2 pt-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleOpenDetails(heroItem); }}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold text-xs px-4 py-2 rounded-xl transition flex items-center gap-1.5"
                    >
                      ▶ Details & Trailer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search movies & TV shows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full ${isLight ? 'bg-white border-slate-300 placeholder-slate-400' : 'bg-slate-900/90 border-slate-800 placeholder-slate-500'} border focus:border-amber-500 px-5 py-3.5 rounded-2xl outline-none text-sm shadow-inner transition`}
              />
              {loading && (
                <span className="absolute right-4 top-3.5 text-xs text-amber-500 animate-pulse font-medium">
                  Searching...
                </span>
              )}
            </div>

            {/* Request Cap Notice */}
            {!currentUser.is_admin && activePendingCount >= MAX_ACTIVE_REQUESTS && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-400 flex items-center gap-2">
                <span>⚠️ Queue full ({activePendingCount}/{MAX_ACTIVE_REQUESTS} pending). Requesting is paused until items are processed.</span>
              </div>
            )}

            {/* Horizontal Genre Chips */}
            {!search.trim() && (
              <div className="space-y-2">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
                  {PRIMARY_GENRES.map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setSelectedGenre(chip.id)}
                      className={`px-3.5 py-2 rounded-xl border shrink-0 transition ${
                        selectedGenre === chip.id
                          ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : `${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'} opacity-75 hover:opacity-100`
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}

                  <button
                    onClick={() => setShowExtendedGenres(!showExtendedGenres)}
                    className={`px-3.5 py-2 rounded-xl border shrink-0 font-bold transition ${showExtendedGenres ? 'bg-amber-500 text-slate-950 border-amber-500' : `${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'} text-amber-500`}`}
                  >
                    {showExtendedGenres ? '✕ Close' : '+ More'}
                  </button>
                </div>

                {showExtendedGenres && (
                  <div className={`p-3 rounded-2xl border grid grid-cols-4 gap-1.5 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/90 border-slate-800'}`}>
                    {EXTENDED_GENRES.map((chip) => (
                      <button
                        key={chip.id}
                        onClick={() => { setSelectedGenre(chip.id); setShowExtendedGenres(false); }}
                        className={`py-2 px-2 rounded-xl text-[11px] font-medium border text-center truncate ${
                          selectedGenre === chip.id
                            ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold'
                            : `${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'} opacity-75 hover:opacity-100`
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Media Grid with Shimmer Skeletons & Edge-to-Edge Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {loading ? (
                // Shimmer Skeleton Placeholders
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] rounded-3xl bg-slate-800/40 border border-slate-800/60 animate-pulse flex flex-col justify-end p-4 space-y-2">
                    <div className="h-4 bg-slate-700/60 rounded-lg w-3/4"></div>
                    <div className="h-3 bg-slate-700/40 rounded-lg w-1/2"></div>
                    <div className="h-8 bg-slate-700/50 rounded-xl w-full mt-2"></div>
                  </div>
                ))
              ) : (
                results.map((item) => {
                  const title = item.title || item.name;
                  const year = cleanYear(item.release_date || item.first_air_date || '');
                  const theatricalBadge = getTheatricalStatus(item.release_date, item.media_type);
                  
                  const matchingRequest = findDbMatch(item);
                  const status = matchingRequest?.status?.toLowerCase().trim();
                  const isUserOwner = matchingRequest?.user_email?.toLowerCase() === currentUser.email?.toLowerCase();
                  const canCancel = isUserOwner || currentUser.is_admin;
                  const isCapped = !currentUser.is_admin && activePendingCount >= MAX_ACTIVE_REQUESTS;

                  return (
                    <div 
                      key={item.id} 
                      className="group relative aspect-[2/3] rounded-3xl overflow-hidden border border-white/10 hover:border-amber-500/50 hover:shadow-[0_0_25px_rgba(245,158,11,0.2)] transition-all duration-300 flex flex-col justify-end bg-slate-950 shadow-lg cursor-pointer"
                      onClick={() => handleOpenDetails(item)}
                    >
                      {/* Edge-to-Edge Poster Image */}
                      <img 
                        src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} 
                        alt={title} 
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500 ease-out" 
                      />

                      {/* Deep Bottom Gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-start pointer-events-none">
                        {theatricalBadge ? (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-950/90 text-amber-300 border border-amber-700 backdrop-blur shadow">
                            {theatricalBadge}
                          </span>
                        ) : <div />}

                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/70 backdrop-blur text-amber-400 border border-white/10">
                          ★ {item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}
                        </span>
                      </div>

                      {/* Bottom Info & Action Buttons */}
                      <div className="relative p-3 space-y-2 z-10">
                        <div>
                          <p className="font-bold text-xs line-clamp-1 text-white drop-shadow">{title}</p>
                          <p className="text-[10px] text-white/70">{year || 'N/A'} • {(item.media_type || (item.first_air_date ? 'tv' : 'movie')).toUpperCase()}</p>
                        </div>

                        <div onClick={(e) => e.stopPropagation()}>
                          {status === 'done' ? (
                            <button
                              onClick={() => openPlexNative(title)}
                              className="w-full py-2 text-[11px] font-bold rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 text-center hover:bg-emerald-900 transition shadow"
                            >
                              ▶ Open in Plex
                            </button>
                          ) : status === 'in_progress' ? (
                            <div className="w-full py-2 text-[11px] font-bold rounded-xl bg-blue-950 text-blue-400 border border-blue-800 text-center">
                              ⚡ In Progress
                            </div>
                          ) : status === 'pending' ? (
                            canCancel ? (
                              <button
                                onClick={() => handleDismissOrCancel(matchingRequest.id)}
                                className="w-full py-2 text-[11px] font-bold rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition shadow"
                              >
                                ✕ Cancel {currentUser.is_admin && !isUserOwner && '(Admin)'}
                              </button>
                            ) : (
                              <div className="w-full py-2 text-[11px] font-bold rounded-xl bg-slate-900/80 border border-white/10 text-slate-400 text-center truncate">
                                Requested
                              </div>
                            )
                          ) : (
                            <button
                              onClick={() => handleRequest(item)}
                              disabled={isCapped}
                              className={`w-full py-2 text-[11px] font-bold rounded-xl transition shadow-md ${
                                isCapped 
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                              }`}
                            >
                              {isCapped ? 'Limit Reached' : 'Request'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Tab 2: My Requests */}
        {activeTab === 'list' && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold opacity-75">Your Pending & Past Requests ({visibleRequests.length})</h2>

            {visibleRequests.length === 0 ? (
              <p className="text-center opacity-60 py-20 text-xs">You have no active requests.</p>
            ) : (
              visibleRequests.map((r) => (
                <div key={r.id} className={`flex gap-3 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'} border p-3 rounded-2xl items-center shadow`}>
                  {r.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-12 h-16 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-16 bg-slate-800 rounded-xl flex items-center justify-center text-[10px] text-slate-500 shrink-0">MEDIA</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs truncate">{r.title} {r.year && <span className="opacity-60 font-normal">({r.year})</span>}</p>
                    <p className="text-[11px] opacity-60">Status: {r.status.toUpperCase()}</p>
                    {r.admin_note && (
                      <p className="text-[10px] text-rose-400 mt-0.5 italic">Note: {r.admin_note}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      r.status === 'done' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                      r.status === 'in_progress' ? 'bg-blue-950 text-blue-400 border-blue-800' :
                      r.status === 'declined' ? 'bg-rose-950 text-rose-400 border-rose-800' :
                      'bg-amber-950 text-amber-400 border-amber-800'
                    }`}>
                      {r.status === 'done' ? '✓ On Plex' :
                       r.status === 'in_progress' ? '⚡ Downloading' :
                       r.status === 'declined' ? '✕ Declined' : '⏳ Pending'}
                    </span>

                    <button 
                      onClick={() => handleDismissOrCancel(r.id)}
                      className="text-[10px] opacity-60 hover:text-rose-400 underline"
                    >
                      {r.status === 'declined' || r.status === 'done' ? 'Dismiss' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {/* Tab 3: Admin Dashboard */}
        {activeTab === 'admin' && currentUser.is_admin && (
          <section className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-500">● Master Admin Active</span>
              <button 
                onClick={handlePruneOldRequests}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700 font-semibold"
                title="Deletes resolved requests older than 30 days"
              >
                🧹 Prune Resolved (&gt;30d)
              </button>
            </div>

            {/* Broadcast Announcement */}
            <div className={`border p-4 rounded-2xl space-y-3 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'}`}>
              <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Broadcast Announcement</h3>
              <input
                type="text"
                placeholder="e.g. Server down for maintenance tonight"
                value={bannerInput}
                onChange={(e) => setBannerInput(e.target.value)}
                className={`w-full border px-3.5 py-2.5 rounded-xl text-xs outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
              />
              <div className="flex justify-between items-center">
                <label className="text-xs opacity-75 flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={bannerToggle} 
                    onChange={(e) => setBannerToggle(e.target.checked)} 
                  />
                  Display Banner to Users
                </label>
                <button 
                  onClick={saveAdminSettings} 
                  className="bg-amber-500 text-slate-950 font-bold text-[11px] px-3.5 py-2 rounded-xl"
                >
                  Save Banner
                </button>
              </div>
            </div>

            {/* Discord Webhook */}
            <div className={`border p-4 rounded-2xl space-y-2 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'}`}>
              <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Discord Webhook Alert</h3>
              <input
                type="text"
                placeholder="Paste Discord Webhook URL"
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                className={`w-full border px-3.5 py-2.5 rounded-xl text-xs outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
              />
              <button 
                onClick={saveAdminSettings} 
                className="bg-indigo-600 hover:bg-indigo-500 font-bold text-[11px] px-3.5 py-2 rounded-xl text-white"
              >
                Save Webhook
              </button>
            </div>

            {/* User Directory */}
            <div className={`border p-4 rounded-2xl space-y-3 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'}`}>
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">Registered Users ({profiles.length})</h3>
                <button 
                  onClick={handleCopyAllEmails} 
                  className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg"
                >
                  📋 Copy All Emails
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {profiles.map(p => (
                  <div key={p.id} className={`p-3 rounded-xl border flex justify-between items-center ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                    <div 
                      onClick={() => setInspectUser(p)} 
                      className="cursor-pointer flex-1 min-w-0"
                    >
                      <p className="font-bold text-xs truncate hover:text-amber-500">{p.name} {p.is_admin && <span className="text-amber-400 text-[10px] font-normal">(Admin)</span>}</p>
                      <p className="text-[10px] opacity-60 truncate">{p.email}</p>
                      {p.password_hint && <p className="text-[9px] text-amber-400/80 italic">Hint: {p.password_hint}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleAdminResetPassword(p.id, p.email)} 
                        className="text-[10px] text-amber-400 hover:underline"
                        title="Reset Password"
                      >
                        Reset Pass
                      </button>
                      <button 
                        onClick={() => handleAdminRenameUser(p.id, p.name, p.email)} 
                        className="text-[10px] opacity-60 hover:opacity-100"
                      >
                        Rename
                      </button>
                      {!p.is_admin && (
                        <button 
                          onClick={() => handleAdminDeleteUser(p.id, p.email)} 
                          className="text-[10px] text-rose-400 hover:text-rose-300"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* User History Inspector Drawer */}
            {inspectUser && (
              <div className={`p-4 rounded-2xl border space-y-3 ${isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-950 border-slate-800'}`}>
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs">Request History for: {inspectUser.name} ({inspectUser.email})</h4>
                  <button onClick={() => setInspectUser(null)} className="text-xs opacity-60">✕ Close</button>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {userRequests.filter(r => r.user_email?.toLowerCase() === inspectUser.email?.toLowerCase()).length === 0 ? (
                    <p className="text-[11px] opacity-60">No requests submitted by this user.</p>
                  ) : (
                    userRequests
                      .filter(r => r.user_email?.toLowerCase() === inspectUser.email?.toLowerCase())
                      .map(r => (
                        <div key={r.id} className="text-[11px] flex justify-between border-b pb-1 border-slate-700/40">
                          <span className="truncate flex-1">{r.title} ({r.year})</span>
                          <span className={`font-bold ml-2 ${r.status === 'done' ? 'text-emerald-400' : r.status === 'declined' ? 'text-rose-400' : 'text-amber-400'}`}>
                            {r.status}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* Active Requests Queue */}
            <div className="space-y-3">
              <h3 className="font-bold text-xs opacity-75">Active Requests Queue:</h3>

              {userRequests.filter(r => r.status === 'pending' || r.status === 'in_progress').map((r) => {
                const isTv = (r.media_type || '').toLowerCase() === 'tv';

                return (
                  <div key={r.id} className={`border p-3 rounded-2xl flex gap-3 items-center ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'}`}>
                    <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-12 h-16 rounded-xl object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-xs truncate">{r.title} ({r.year})</p>
                        
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                          isTv 
                            ? 'bg-purple-950 text-purple-300 border-purple-800' 
                            : 'bg-sky-950 text-sky-300 border-sky-800'
                        }`}>
                          {isTv ? '📺 TV (Sonarr)' : '🎬 Movie (Radarr)'}
                        </span>
                      </div>

                      <p className="text-[11px] text-amber-500 font-semibold mt-0.5">Requested by: {r.requested_by}</p>
                      {r.user_email && <p className="text-[10px] opacity-60">{r.user_email}</p>}
                      {r.status === 'in_progress' && <span className="text-[10px] text-blue-400 font-semibold">⚡ Downloading...</span>}

                      {showNoteBox[r.id] && (
                        <div className="mt-2 flex gap-1">
                          <input
                            type="text"
                            placeholder="Reason (optional)"
                            value={declineNoteInput[r.id] || ''}
                            onChange={(e) => setDeclineNoteInput({ ...declineNoteInput, [r.id]: e.target.value })}
                            className={`border px-2.5 py-1 text-[10px] rounded-lg flex-1 outline-none ${isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-700'}`}
                          />
                          <button
                            onClick={() => {
                              updateStatus(r.id, 'declined', declineNoteInput[r.id] || '');
                              setShowNoteBox({ ...showNoteBox, [r.id]: false });
                            }}
                            className="bg-rose-800 text-white font-bold text-[10px] px-2.5 rounded-lg"
                          >
                            Confirm
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => updateStatus(r.id, 'done')}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg"
                      >
                        ✓ Done
                      </button>
                      {r.status !== 'in_progress' && (
                        <button
                          onClick={() => updateStatus(r.id, 'in_progress')}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg"
                        >
                          ⚡ In Progress
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus(r.id, 'declined')}
                        className="bg-rose-900/70 hover:bg-rose-800 text-rose-300 font-bold text-[10px] px-3 py-1.5 rounded-lg"
                      >
                        ✕ Decline
                      </button>
                      <button
                        onClick={() => setShowNoteBox({ ...showNoteBox, [r.id]: !showNoteBox[r.id] })}
                        className="text-[9px] opacity-60 hover:opacity-100"
                      >
                        + Note
                      </button>
                      <button
                        onClick={() => handleDismissOrCancel(r.id)}
                        className="text-[9px] text-rose-400 hover:underline text-right"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}

              {userRequests.filter(r => r.status === 'pending' || r.status === 'in_progress').length === 0 && (
                <p className="opacity-60 text-center py-8 text-xs">All requests have been handled!</p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Floating iOS-Style Frosted Bottom Navigation Dock */}
      <nav 
        aria-label="Main Navigation" 
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm backdrop-blur-xl p-1.5 rounded-3xl border shadow-2xl flex items-center justify-between transition-all duration-300 ${
          isLight 
            ? 'bg-white/85 border-slate-300 shadow-slate-400/20' 
            : 'bg-slate-900/85 border-white/10 shadow-black/60'
        }`}
      >
        <button
          onClick={() => setActiveTab('search')}
          className={`flex-1 py-2 px-3 rounded-2xl flex flex-col items-center gap-0.5 transition ${
            activeTab === 'search' 
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md' 
              : 'opacity-60 hover:opacity-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7"/>
            <path strokeLinecap="round" d="m20 20-3.5-3.5"/>
          </svg>
          <span className="text-[10px]">Search</span>
        </button>

        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-2 px-3 rounded-2xl flex flex-col items-center gap-0.5 transition relative ${
            activeTab === 'list' 
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md' 
              : 'opacity-60 hover:opacity-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h9"/>
          </svg>
          <span className="text-[10px]">Requests ({visibleRequests.length})</span>
        </button>

        {currentUser.is_admin && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-2 px-3 rounded-2xl flex flex-col items-center gap-0.5 transition ${
              activeTab === 'admin' 
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md' 
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span className="text-[10px]">
              Admin {userRequests.filter(r => r.status === 'pending').length > 0 && `(${userRequests.filter(r => r.status === 'pending').length})`}
            </span>
          </button>
        )}
      </nav>

      {/* Rich Backdrop Details & Trailer Modal */}
      {selectedMedia && (() => {
        const modalMatch = findDbMatch(selectedMedia);
        const modalStatus = modalMatch?.status?.toLowerCase().trim();
        const isUserOwner = modalMatch?.user_email?.toLowerCase() === currentUser.email?.toLowerCase();
        const canCancel = isUserOwner || currentUser.is_admin;
        const theatricalStatus = getTheatricalStatus(selectedMedia.release_date, selectedMedia.media_type);
        const isCapped = !currentUser.is_admin && activePendingCount >= MAX_ACTIVE_REQUESTS;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
            <div className={`${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl`}>
              {/* Rich Backdrop Header */}
              {selectedMedia.backdrop_path ? (
                <div className="relative -mx-5 -mt-5 sm:-mx-6 sm:-mt-6 aspect-[16/9] overflow-hidden rounded-t-3xl border-b border-white/10">
                  <img 
                    src={`https://image.tmdb.org/t/p/w780${selectedMedia.backdrop_path}`} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-black/30" />
                  <button 
                    onClick={() => setSelectedMedia(null)} 
                    className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 backdrop-blur transition"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button onClick={() => setSelectedMedia(null)} className="opacity-60 hover:opacity-100 text-lg font-bold p-1">✕</button>
                </div>
              )}

              {/* Title & Metadata Pills */}
              <div>
                <h3 className="text-xl font-black">{selectedMedia.title || selectedMedia.name}</h3>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs opacity-60">
                    {cleanYear(selectedMedia.release_date || selectedMedia.first_air_date)} • {selectedMedia.media_type.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                    ★ {selectedMedia.vote_average?.toFixed(1)}
                  </span>
                  {theatricalStatus && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700">
                      {theatricalStatus}
                    </span>
                  )}
                </div>
              </div>

              {/* YouTube Trailer */}
              {selectedMedia.trailerKey ? (
                <div className="aspect-video w-full rounded-2xl overflow-hidden border border-slate-800 bg-black shadow-inner">
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${selectedMedia.trailerKey}?autoplay=0`}
                    title="Trailer"
                    allowFullScreen
                  />
                </div>
              ) : (
                <p className="text-xs opacity-50 italic">No trailer video preview available for this title.</p>
              )}

              <p className="text-xs opacity-80 leading-relaxed font-normal">{selectedMedia.overview || 'No synopsis available.'}</p>

              {modalStatus === 'done' ? (
                <button
                  onClick={() => openPlexNative(selectedMedia.title || selectedMedia.name)}
                  className="w-full py-3.5 text-xs font-bold rounded-2xl bg-emerald-950 text-emerald-400 border border-emerald-800 text-center hover:bg-emerald-900 transition shadow"
                >
                  ▶ Open in Plex
                </button>
              ) : modalStatus === 'pending' ? (
                canCancel ? (
                  <button
                    onClick={() => handleDismissOrCancel(modalMatch.id)}
                    className="w-full bg-rose-900/60 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-3.5 rounded-2xl text-xs transition shadow"
                  >
                    ✕ Cancel Request {currentUser.is_admin && !isUserOwner && '(Admin)'}
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full bg-slate-800 text-slate-500 font-bold py-3.5 rounded-2xl text-xs cursor-not-allowed"
                  >
                    Already Requested by {modalMatch?.requested_by || 'User'}
                  </button>
                )
              ) : (
                <button
                  onClick={() => handleRequest(selectedMedia)}
                  disabled={isCapped}
                  className={`w-full font-bold py-3.5 rounded-2xl text-xs transition shadow-lg ${
                    isCapped 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  }`}
                >
                  {isCapped ? 'Limit Reached (10 Pending)' : 'Confirm Request'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal: Account Settings */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form onSubmit={handleUpdateProfile} className={`${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl`}>
            <h3 className="text-sm font-bold">Account Settings</h3>

            <div>
              <label className="text-xs opacity-60">Registered Email (Locked)</label>
              <input
                type="email"
                disabled
                value={currentUser.email}
                className="w-full border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs mt-1 bg-slate-800/40 opacity-60 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-xs opacity-60">Display Name</label>
              <input
                type="text"
                required
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className={`w-full border px-3.5 py-2.5 rounded-xl text-xs mt-1 outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
              />
            </div>

            <div>
              <label className="text-xs opacity-60">Update Password (optional)</label>
              <input
                type="password"
                placeholder="Leave blank to keep same"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className={`w-full border px-3.5 py-2.5 rounded-xl text-xs mt-1 outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
              />
            </div>

            <div>
              <label className="text-xs opacity-60">Update Password Hint (optional)</label>
              <input
                type="text"
                placeholder="e.g. Favorite sports team"
                value={tempHint}
                onChange={(e) => setTempHint(e.target.value)}
                className={`w-full border px-3.5 py-2.5 rounded-xl text-xs mt-1 outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
              />
            </div>

            <div>
              <label className="text-xs opacity-60">Theme Selection</label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${theme === 'dark' ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md' : 'opacity-60 border-slate-700'}`}
                >
                  🌙 Dark
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${theme === 'light' ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md' : 'opacity-60 border-slate-300'}`}
                >
                  ☀️ Light
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setShowSettings(false)} 
                className={`flex-1 py-2.5 rounded-xl text-xs ${isLight ? 'bg-slate-200' : 'bg-slate-800'} opacity-80 hover:opacity-100 font-semibold`}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="flex-1 bg-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-xs shadow-md shadow-amber-500/20"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
