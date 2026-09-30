'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

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
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // App Settings & Theme
  const [theme, setTheme] = useState('dark');
  const [tempName, setTempName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
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

  // 1. Restore User Session on Load
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

  // Fetch admin settings & profiles if admin
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
    const { data } = await supabase
      .from('requests')
      .select('*')
      .neq('requested_by', 'Plex Library')
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
    setAuthLoading(true);

    const name = authName.trim();
    const email = authEmail.trim().toLowerCase();
    const pass = authPassword.trim();

    if (!name || !email || !pass) {
      setAuthError('All fields are required.');
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
      .insert([{ name, email, password: pass, is_admin: false }])
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

  // Auth: Logout (returns anyone to the Welcome screen)
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

    const existing = findDbMatch(item);
    if (existing && existing.status === 'done') {
      alert(`"${title}" is already on Plex!`);
      return;
    }
    if (existing && existing.status === 'pending') {
      alert(`"${title}" has already been requested!`);
      return;
    }

    // Permanently bind request to user_email and current name
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

    // Discord Alert
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

  // Profile Management (User changing their name or password)
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;

    const updatedName = tempName.trim();
    const updatePayload = { name: updatedName };
    if (tempPassword.trim()) {
      updatePayload.password = tempPassword.trim();
    }

    const { error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('email', currentUser.email);

    if (!error) {
      // Also update requested_by on active requests so the cards reflect the new name
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

  // "My Requests" strictly filters to the user's permanent email
  const visibleRequests = userRequests.filter(r => r.user_email?.toLowerCase() === currentUser?.email?.toLowerCase());

  // ==========================================
  // VIEW: WELCOME & AUTHENTICATION SCREEN
  // ==========================================
  if (!currentUser) {
    return (
      <main className={`min-h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'} flex items-center justify-center p-4 font-sans transition-colors duration-200`}>
        <div className={`${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border p-6 rounded-2xl max-w-sm w-full space-y-5 shadow-2xl`}>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black text-amber-500 tracking-tight">Plex Requests</h1>
            <p className="text-xs opacity-70">Log in or create an account to request media.</p>
          </div>

          {/* Sign In vs Sign Up Tabs */}
          <div className="flex bg-slate-950/40 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => { setAuthMode('signin'); setAuthError(''); }}
              className={`flex-1 py-2 rounded-lg transition ${authMode === 'signin' ? 'bg-amber-500 text-slate-950' : 'opacity-60 hover:opacity-100'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setAuthError(''); }}
              className={`flex-1 py-2 rounded-lg transition ${authMode === 'signup' ? 'bg-amber-500 text-slate-950' : 'opacity-60 hover:opacity-100'}`}
            >
              Create Account
            </button>
          </div>

          {authError && (
            <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800 p-2.5 rounded-lg text-center font-medium">
              {authError}
            </p>
          )}

          <form onSubmit={authMode === 'signin' ? handleSignIn : handleSignUp} className="space-y-3">
            {authMode === 'signup' && (
              <div>
                <label className="text-xs font-semibold">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alfredo, Sarah"
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
              <label className="text-xs font-semibold">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className={`w-full mt-1 ${isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'} border px-3 py-2.5 rounded-xl text-xs outline-none focus:border-amber-500`}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-amber-500 hover:bg-amber-600 font-bold py-3 rounded-xl text-slate-950 text-xs transition mt-2 disabled:opacity-50"
            >
              {authLoading ? 'Please wait...' : authMode === 'signin' ? 'Sign In' : 'Register Account'}
            </button>
          </form>

          {/* Theme preview switch on login screen */}
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
    <div className={`min-h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'} font-sans transition-colors duration-200`}>
      <div className="max-w-2xl mx-auto pb-24 p-4">
        {toastMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs shadow-2xl animate-bounce text-center max-w-[90%]">
            {toastMessage}
          </div>
        )}

        {bannerActive && bannerMessage && (
          <aside aria-label="Announcement" className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-500 p-3 rounded-xl text-xs flex items-center gap-2 shadow-inner">
            <span className="text-base" aria-hidden="true">📢</span>
            <p className="font-semibold flex-1">{bannerMessage}</p>
          </aside>
        )}

        {/* Header with User Info and Settings Button */}
        <header className="flex justify-between items-center py-3 mb-2">
          <div className="text-left">
            <h1 className="text-xl font-black tracking-tight text-amber-500">
              Plex Requests
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] flex items-center justify-center">
                {currentUser.name.charAt(0).toUpperCase()}
              </span>
              <p className="text-xs opacity-70">
                {currentUser.name} {currentUser.is_admin && <span className="text-amber-500 font-bold">(Admin)</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => { setTempName(currentUser.name); setTempPassword(''); setShowSettings(true); }}
              className={`p-2 rounded-xl border ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} opacity-75 hover:opacity-100 transition`}
              title="Account Settings"
              aria-label="Settings"
            >
              ⚙️
            </button>
            <button 
              onClick={handleLogout}
              className={`text-xs px-2.5 py-2 rounded-xl border font-bold ${isLight ? 'bg-white border-slate-300 text-rose-600' : 'bg-slate-900 border-slate-800 text-rose-400'} hover:opacity-100`}
            >
              Log Out
            </button>
          </div>
        </header>

        {/* Navigation Tabs (Admin tab ONLY shown to accounts with is_admin === true) */}
        <nav aria-label="Main Navigation" className={`flex ${isLight ? 'bg-white/80' : 'bg-slate-900/80'} backdrop-blur p-1 rounded-xl mb-5 border ${isLight ? 'border-slate-300' : 'border-slate-800'} text-xs font-semibold`}>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2 rounded-lg transition ${activeTab === 'search' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'opacity-60 hover:opacity-100'}`}
          >
            Search
          </button>

          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-2 rounded-lg transition ${activeTab === 'list' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'opacity-60 hover:opacity-100'}`}
          >
            My Requests ({visibleRequests.length})
          </button>

          {currentUser.is_admin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex-1 py-2 rounded-lg transition ${activeTab === 'admin' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'opacity-60 hover:opacity-100'}`}
            >
              Admin {userRequests.filter(r => r.status === 'pending').length > 0 && `(${userRequests.filter(r => r.status === 'pending').length})`}
            </button>
          )}
        </nav>

        {/* Tab 1: Search & Discovery */}
        {activeTab === 'search' && (
          <section className="space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search movies & TV shows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full ${isLight ? 'bg-white border-slate-300 placeholder-slate-400' : 'bg-slate-900/90 border-slate-800 placeholder-slate-500'} border focus:border-amber-500 px-4 py-3 rounded-xl outline-none text-sm shadow-inner`}
              />
              {loading && (
                <span className="absolute right-4 top-3 text-xs text-amber-500 animate-pulse font-medium">
                  Searching...
                </span>
              )}
            </div>

            {!search.trim() && (
              <div className="space-y-2">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none text-xs font-medium">
                  {PRIMARY_GENRES.map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setSelectedGenre(chip.id)}
                      className={`px-3 py-1.5 rounded-full border shrink-0 transition ${
                        selectedGenre === chip.id
                          ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold'
                          : `${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/60 border-slate-800'} opacity-70 hover:opacity-100`
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}

                  <button
                    onClick={() => setShowExtendedGenres(!showExtendedGenres)}
                    className={`px-3 py-1.5 rounded-full border shrink-0 font-bold transition ${showExtendedGenres ? 'bg-amber-500 text-slate-950 border-amber-500' : `${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/60 border-slate-800'} text-amber-500`}`}
                  >
                    {showExtendedGenres ? '✕ Close' : '+ More'}
                  </button>
                </div>

                {showExtendedGenres && (
                  <div className={`p-2.5 rounded-xl border grid grid-cols-4 gap-1.5 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/90 border-slate-800'}`}>
                    {EXTENDED_GENRES.map((chip) => (
                      <button
                        key={chip.id}
                        onClick={() => { setSelectedGenre(chip.id); setShowExtendedGenres(false); }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center truncate ${
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

            {/* Media Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {results.map((item) => {
                const title = item.title || item.name;
                const year = cleanYear(item.release_date || item.first_air_date || '');
                const theatricalBadge = getTheatricalStatus(item.release_date, item.media_type);
                
                const matchingRequest = findDbMatch(item);
                const status = matchingRequest?.status?.toLowerCase().trim();
                const isUserOwner = matchingRequest?.user_email?.toLowerCase() === currentUser.email?.toLowerCase();
                const canCancel = isUserOwner || currentUser.is_admin;

                return (
                  <div 
                    key={item.id} 
                    className={`${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/70 border-slate-800/80'} border rounded-xl overflow-hidden flex flex-col justify-between group transition`}
                  >
                    <div 
                      onClick={() => handleOpenDetails(item)} 
                      className="relative aspect-[2/3] cursor-pointer overflow-hidden bg-slate-950"
                    >
                      <img 
                        src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} 
                        alt={title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-80" />
                      
                      {theatricalBadge && (
                        <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-700 backdrop-blur shadow">
                          {theatricalBadge}
                        </span>
                      )}

                      <span className="absolute bottom-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 backdrop-blur text-amber-400">
                        ★ {item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 flex flex-col flex-1 justify-between gap-2">
                      <div>
                        <p className="font-semibold text-xs line-clamp-1">{title}</p>
                        <p className="text-[11px] opacity-60">{year || 'N/A'} • {(item.media_type || (item.first_air_date ? 'tv' : 'movie')).toUpperCase()}</p>
                      </div>

                      {status === 'done' ? (
                        <button
                          onClick={() => openPlexNative(title)}
                          className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 text-center hover:bg-emerald-900 transition"
                        >
                          ▶ Open in Plex
                        </button>
                      ) : status === 'in_progress' ? (
                        <span className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-blue-950 text-blue-400 border border-blue-800 text-center">
                          ⚡ In Progress
                        </span>
                      ) : status === 'pending' ? (
                        canCancel ? (
                          <button
                            onClick={() => handleDismissOrCancel(matchingRequest.id)}
                            className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 transition"
                          >
                            ✕ Cancel Request {currentUser.is_admin && !isUserOwner && '(Admin)'}
                          </button>
                        ) : (
                          <span className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-slate-800 text-slate-500 text-center truncate">
                            Requested by {matchingRequest.requested_by || 'User'}
                          </span>
                        )
                      ) : (
                        <button
                          onClick={() => handleRequest(item)}
                          className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black transition"
                        >
                          Request
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Tab 2: My Requests (Linked strictly by email) */}
        {activeTab === 'list' && (
          <section className="space-y-3">
            {visibleRequests.length === 0 ? (
              <p className="text-center opacity-60 py-16 text-xs">You have no active requests.</p>
            ) : (
              visibleRequests.map((r) => (
                <div key={r.id} className={`flex gap-3 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'} border p-2.5 rounded-xl items-center`}>
                  {r.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-11 h-16 rounded-lg object-cover" />
                  ) : (
                    <div className="w-11 h-16 bg-slate-800 rounded-lg flex items-center justify-center text-[10px] text-slate-500">MEDIA</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs truncate">{r.title} {r.year && <span className="opacity-60 font-normal">({r.year})</span>}</p>
                    <p className="text-[11px] opacity-60">Status: {r.status.toUpperCase()}</p>
                    {r.admin_note && (
                      <p className="text-[10px] text-rose-400 mt-0.5 italic">Note: {r.admin_note}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
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

        {/* Tab 3: Admin Dashboard (Only renders if currentUser.is_admin is true) */}
        {activeTab === 'admin' && currentUser.is_admin && (
          <section className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-500">● Master Admin Active</span>
              <p className="text-xs opacity-60">Admin: {currentUser.email}</p>
            </div>

            {/* Broadcast Announcement */}
            <div className={`border p-4 rounded-xl space-y-3 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'}`}>
              <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Broadcast Announcement</h3>
              <input
                type="text"
                placeholder="e.g. Server down for maintenance tonight"
                value={bannerInput}
                onChange={(e) => setBannerInput(e.target.value)}
                className={`w-full border px-3 py-2 rounded-lg text-xs outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
              />
              <div className="flex justify-between items-center">
                <label className="text-xs opacity-75 flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    checked={bannerToggle} 
                    onChange={(e) => setBannerToggle(e.target.checked)} 
                  />
                  Display Banner to Users
                </label>
                <button 
                  onClick={saveAdminSettings} 
                  className="bg-amber-500 text-slate-950 font-bold text-[11px] px-3 py-1.5 rounded-lg"
                >
                  Save Banner
                </button>
              </div>
            </div>

            {/* Discord Webhook */}
            <div className={`border p-4 rounded-xl space-y-2 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'}`}>
              <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Discord Webhook Alert</h3>
              <input
                type="text"
                placeholder="Paste Discord Webhook URL"
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                className={`w-full border px-3 py-2 rounded-lg text-xs outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
              />
              <button 
                onClick={saveAdminSettings} 
                className="bg-indigo-600 hover:bg-indigo-500 font-bold text-[11px] px-3 py-1.5 rounded-lg text-white"
              >
                Save Webhook
              </button>
            </div>

            {/* User Directory */}
            <div className={`border p-4 rounded-xl space-y-3 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'}`}>
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">Registered Users ({profiles.length})</h3>
                <button 
                  onClick={handleCopyAllEmails} 
                  className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2 py-1 rounded-md"
                >
                  📋 Copy All Emails
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {profiles.map(p => (
                  <div key={p.id} className={`p-2.5 rounded-lg border flex justify-between items-center ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                    <div 
                      onClick={() => setInspectUser(p)} 
                      className="cursor-pointer flex-1 min-w-0"
                    >
                      <p className="font-bold text-xs truncate hover:text-amber-500">{p.name} {p.is_admin && <span className="text-amber-400 text-[10px] font-normal">(Admin)</span>}</p>
                      <p className="text-[10px] opacity-60 truncate">{p.email}</p>
                    </div>
                    <div className="flex gap-2">
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
              <div className={`p-4 rounded-xl border space-y-3 ${isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-950 border-slate-800'}`}>
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

              {userRequests.filter(r => r.status === 'pending' || r.status === 'in_progress').map((r) => (
                <div key={r.id} className={`border p-3 rounded-xl flex gap-3 items-center ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900/80 border-slate-800'}`}>
                  <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-11 h-16 rounded object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs truncate">{r.title} ({r.year})</p>
                    <p className="text-[11px] text-amber-500 font-semibold">Requested by: {r.requested_by}</p>
                    {r.user_email && <p className="text-[10px] opacity-60">{r.user_email}</p>}
                    {r.status === 'in_progress' && <span className="text-[10px] text-blue-400 font-semibold">⚡ Downloading...</span>}

                    {showNoteBox[r.id] && (
                      <div className="mt-2 flex gap-1">
                        <input
                          type="text"
                          placeholder="Reason (optional)"
                          value={declineNoteInput[r.id] || ''}
                          onChange={(e) => setDeclineNoteInput({ ...declineNoteInput, [r.id]: e.target.value })}
                          className={`border px-2 py-1 text-[10px] rounded flex-1 outline-none ${isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-700'}`}
                        />
                        <button
                          onClick={() => {
                            updateStatus(r.id, 'declined', declineNoteInput[r.id] || '');
                            setShowNoteBox({ ...showNoteBox, [r.id]: false });
                          }}
                          className="bg-rose-800 text-white font-bold text-[10px] px-2 rounded"
                        >
                          Confirm
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => updateStatus(r.id, 'done')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-md"
                    >
                      ✓ Done
                    </button>
                    {r.status !== 'in_progress' && (
                      <button
                        onClick={() => updateStatus(r.id, 'in_progress')}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-md"
                      >
                        ⚡ In Progress
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(r.id, 'declined')}
                      className="bg-rose-900/70 hover:bg-rose-800 text-rose-300 font-bold text-[10px] px-2.5 py-1.5 rounded-md"
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
              ))}

              {userRequests.filter(r => r.status === 'pending' || r.status === 'in_progress').length === 0 && (
                <p className="opacity-60 text-center py-6 text-xs">All requests have been handled!</p>
              )}
            </div>
          </section>
        )}

        {/* Modal: Media Details & Trailer */}
        {selectedMedia && (() => {
          const modalMatch = findDbMatch(selectedMedia);
          const modalStatus = modalMatch?.status?.toLowerCase().trim();
          const isUserOwner = modalMatch?.user_email?.toLowerCase() === currentUser.email?.toLowerCase();
          const canCancel = isUserOwner || currentUser.is_admin;
          const theatricalStatus = getTheatricalStatus(selectedMedia.release_date, selectedMedia.media_type);

          return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className={`${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold">{selectedMedia.title || selectedMedia.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs opacity-60">
                        {cleanYear(selectedMedia.release_date || selectedMedia.first_air_date)} • {selectedMedia.media_type.toUpperCase()} • ★ {selectedMedia.vote_average?.toFixed(1)}
                      </p>
                      {theatricalStatus && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700">
                          {theatricalStatus}
                        </span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedMedia(null)} 
                    className="opacity-60 hover:opacity-100 text-lg font-bold p-1"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                {selectedMedia.trailerKey ? (
                  <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-800 bg-black">
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${selectedMedia.trailerKey}?autoplay=0`}
                      title="Trailer"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <p className="text-xs opacity-50 italic">No trailer video available for this title.</p>
                )}

                <p className="text-xs opacity-80 leading-relaxed">{selectedMedia.overview || 'No synopsis available.'}</p>

                {modalStatus === 'done' ? (
                  <button
                    onClick={() => openPlexNative(selectedMedia.title || selectedMedia.name)}
                    className="w-full py-3 text-xs font-bold rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 text-center hover:bg-emerald-900 transition"
                  >
                    ▶ Open in Plex
                  </button>
                ) : modalStatus === 'pending' ? (
                  canCancel ? (
                    <button
                      onClick={() => handleDismissOrCancel(modalMatch.id)}
                      className="w-full bg-rose-900/60 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-3 rounded-xl text-xs transition"
                    >
                      ✕ Cancel Request {currentUser.is_admin && !isUserOwner && '(Admin)'}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full bg-slate-800 text-slate-500 font-bold py-3 rounded-xl text-xs cursor-not-allowed"
                    >
                      Already Requested by {modalMatch?.requested_by || 'User'}
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => handleRequest(selectedMedia)}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl text-xs transition"
                  >
                    Confirm Request
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Modal: Account Settings */}
        {showSettings && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <form onSubmit={handleUpdateProfile} className={`${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border p-5 rounded-2xl w-full max-w-sm space-y-4`}>
              <h3 className="text-sm font-bold">Account Settings</h3>

              <div>
                <label className="text-xs opacity-60">Registered Email (Locked)</label>
                <input
                  type="email"
                  disabled
                  value={currentUser.email}
                  className="w-full border border-slate-800 px-3 py-2 rounded-lg text-xs mt-1 bg-slate-800/50 opacity-60 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-xs opacity-60">Display Name</label>
                <input
                  type="text"
                  required
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className={`w-full border px-3 py-2 rounded-lg text-xs mt-1 outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
                />
              </div>

              <div>
                <label className="text-xs opacity-60">Update Password (optional)</label>
                <input
                  type="password"
                  placeholder="Leave blank to keep same"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  className={`w-full border px-3 py-2 rounded-lg text-xs mt-1 outline-none ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800 text-white'}`}
                />
              </div>

              <div>
                <label className="text-xs opacity-60">Theme Selection</label>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${theme === 'dark' ? 'bg-amber-500 text-slate-950 border-amber-500' : 'opacity-60 border-slate-700'}`}
                  >
                    🌙 Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${theme === 'light' ? 'bg-amber-500 text-slate-950 border-amber-500' : 'opacity-60 border-slate-300'}`}
                  >
                    ☀️ Light
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowSettings(false)} 
                  className={`flex-1 py-2 rounded-lg text-xs ${isLight ? 'bg-slate-200' : 'bg-slate-800'} opacity-80 hover:opacity-100`}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-amber-500 text-slate-950 font-bold py-2 rounded-lg text-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
