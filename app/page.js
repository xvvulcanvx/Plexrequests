'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_PIN = '1234'; // Set your admin PIN

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
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [theme, setTheme] = useState('dark');
  
  // Onboarding
  const [tempName, setTempName] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [previewTheme, setPreviewTheme] = useState('dark');
  
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('trending');
  const [showExtendedGenres, setShowExtendedGenres] = useState(false);
  const [results, setResults] = useState([]);
  const [userRequests, setUserRequests] = useState([]);
  const [matchedDbItems, setMatchedDbItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
  
  // Modals & Banners
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerActive, setBannerActive] = useState(false);
  
  // Admin State
  const [adminPass, setAdminPass] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminTab, setShowAdminTab] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [bannerInput, setBannerInput] = useState('');
  const [bannerToggle, setBannerToggle] = useState(false);
  
  // Admin User Directory
  const [profiles, setProfiles] = useState([]);
  const [inspectUser, setInspectUser] = useState(null);
  const [declineNoteInput, setDeclineNoteInput] = useState({});
  const [showNoteBox, setShowNoteBox] = useState({});
  
  // Unread badge tracking
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);

  // Triple-tap tracker for secret admin unlock
  const tapCount = useRef(0);
  const tapTimer = useRef(null);

  useEffect(() => {
    const savedName = localStorage.getItem('plex_requester_name');
    const savedEmail = localStorage.getItem('plex_requester_email');
    const savedAdmin = localStorage.getItem('plex_is_admin');
    const savedTheme = localStorage.getItem('plex_theme') || 'dark';

    if (savedName) setUserName(savedName);
    if (savedEmail) setUserEmail(savedEmail);
    if (savedAdmin === 'true') {
      setIsAdmin(true);
      setShowAdminTab(true);
    }
    setTheme(savedTheme);
    setPreviewTheme(savedTheme);

    fetchUserRequests();
    fetchSiteSettings();
  }, []);

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

    if (data) {
      setUserRequests(data);
      // Check for status updates on personal requests
      const lastChecked = localStorage.getItem('plex_last_seen_req_count') || 0;
      const myItems = data.filter(r => cleanString(r.requested_by) === cleanString(localStorage.getItem('plex_requester_name') || ''));
      const resolvedCount = myItems.filter(r => r.status !== 'pending').length;
      if (resolvedCount > Number(lastChecked)) {
        setHasUnreadUpdates(true);
      }
    }
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setProfiles(data);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchProfiles();
    }
  }, [isAdmin]);

  const handleTitleTripleTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);

    if (tapCount.current >= 3) {
      tapCount.current = 0;
      setShowAdminTab(true);
      setActiveTab('admin');
    } else {
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
      }, 1500);
    }
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

  // Search Multi TMDB with popularity ranking
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
          // Sort by popularity and vote count so major titles appear first
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

    const { data: newRow, error } = await supabase.from('requests').insert([{
      title,
      media_type: mediaType,
      year,
      poster_path: item.poster_path,
      tmdb_id: tmdbId,
      requested_by: userName,
      user_email: userEmail || null,
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
              description: `**Requested by:** ${userName}\n**Email:** ${userEmail}\n**Type:** ${mediaType.toUpperCase()}`,
              thumbnail: { url: `https://image.tmdb.org/t/p/w200${item.poster_path}` },
              color: 16098851
            }]
          })
        });
      } catch (err) {
        console.error('Discord webhook ping failed:', err);
      }
    }

    alert(`Requested "${title}"!`);
    await fetchUserRequests();
    setMatchedDbItems(prev => [...prev.filter(r => r.title !== title), newRow || { title, year, status: 'pending', tmdb_id: tmdbId }]);
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

  // Admin User Profile Management
  const handleEditProfileName = async (profileId, oldName) => {
    const newName = prompt('Enter updated name for user:', oldName);
    if (!newName || newName.trim() === oldName) return;

    const trimmed = newName.trim();
    await supabase.from('profiles').update({ name: trimmed }).eq('id', profileId);
    await supabase.from('requests').update({ requested_by: trimmed }).eq('requested_by', oldName);
    fetchProfiles();
    fetchUserRequests();
  };

  const handleDeleteProfile = async (profileId, profileName) => {
    if (!confirm(`Delete profile for "${profileName}" and all their past requests?`)) return;
    await supabase.from('profiles').delete().eq('id', profileId);
    await supabase.from('requests').delete().eq('requested_by', profileName);
    fetchProfiles();
    fetchUserRequests();
    if (inspectUser?.name === profileName) setInspectUser(null);
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

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPass === ADMIN_PIN) {
      setIsAdmin(true);
      localStorage.setItem('plex_is_admin', 'true');
      fetchProfiles();
    } else {
      alert('Incorrect PIN');
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    setShowAdminTab(false);
    setActiveTab('search');
    localStorage.removeItem('plex_is_admin');
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

  // Complete User Onboarding & Store Profile in Database
  const handleCompleteOnboarding = async (e) => {
    e.preventDefault();
    if (!tempName.trim() || !tempEmail.trim()) {
      alert('Both Name and Email are required.');
      return;
    }

    const trimmedName = tempName.trim();
    const trimmedEmail = tempEmail.trim().toLowerCase();

    // Upsert into Supabase profiles
    await supabase.from('profiles').upsert(
      { name: trimmedName, email: trimmedEmail },
      { onConflict: 'email' }
    );

    localStorage.setItem('plex_requester_name', trimmedName);
    localStorage.setItem('plex_requester_email', trimmedEmail);
    localStorage.setItem('plex_theme', previewTheme);

    setUserName(trimmedName);
    setUserEmail(trimmedEmail);
    setTheme(previewTheme);
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    localStorage.setItem('plex_requester_name', tempName.trim());
    localStorage.setItem('plex_requester_email', tempEmail.trim());
    localStorage.setItem('plex_theme', theme);
    setUserName(tempName.trim());
    setUserEmail(tempEmail.trim());
    setShowSettings(false);
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (tab === 'list') {
      setHasUnreadUpdates(false);
      const myItems = userRequests.filter(r => cleanString(r.requested_by) === cleanString(userName));
      const resolvedCount = myItems.filter(r => r.status !== 'pending').length;
      localStorage.setItem('plex_last_seen_req_count', String(resolvedCount));
    }
  };

  // My Requests strictly filters to the current user
  const visibleRequests = userRequests.filter(r => cleanString(r.requested_by) === cleanString(userName));

  // Native Plex Deep Link: Tapping this opens the native iOS/Android Plex application
  const openPlexNative = (title) => {
    window.location.href = `plex://search?query=${encodeURIComponent(title)}`;
  };

  const isLight = theme === 'light';

  // First-time Onboarding Modal
  if (!userName) {
    return (
      <main className={`min-h-screen ${previewTheme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'} flex items-center justify-center p-4 font-sans transition-colors duration-200`}>
        <form onSubmit={handleCompleteOnboarding} className={`${previewTheme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl`}>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black text-amber-500 tracking-tight">Plex Requests</h1>
            <p className="text-xs opacity-70">Join to request movies and TV shows for our server.</p>
          </div>

          {/* Install to Home Screen Instructions */}
          <div className={`p-3 rounded-xl border ${previewTheme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'} text-[11px] space-y-1`}>
            <p className="font-bold text-amber-500">📲 Add to your phone's Home Screen:</p>
            <p className="opacity-80"><strong>iPhone:</strong> Tap Share <span className="opacity-60">[↑]</span> $\rightarrow$ Add to Home Screen.</p>
            <p className="opacity-80"><strong>Android:</strong> Tap Menu <span className="opacity-60">[⋮]</span> $\rightarrow$ Install App / Add to Home screen.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold">Your Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Sarah, Dad"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className={`w-full mt-1 ${previewTheme === 'light' ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'} border px-3 py-2.5 rounded-xl text-xs outline-none focus:border-amber-500`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold">Your Email *</label>
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={tempEmail}
                onChange={(e) => setTempEmail(e.target.value)}
                className={`w-full mt-1 ${previewTheme === 'light' ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'} border px-3 py-2.5 rounded-xl text-xs outline-none focus:border-amber-500`}
              />
              <p className="text-[10px] opacity-60 mt-1">Used for server notices and announcement updates.</p>
            </div>

            <div>
              <label className="text-xs font-semibold">Select Theme</label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setPreviewTheme('dark')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${previewTheme === 'dark' ? 'bg-amber-500 text-slate-950 border-amber-500' : 'border-slate-700 opacity-60'}`}
                >
                  🌙 Dark Mode
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTheme('light')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${previewTheme === 'light' ? 'bg-amber-500 text-slate-950 border-amber-500' : 'border-slate-300 opacity-60'}`}
                >
                  ☀️ Light Mode
                </button>
              </div>
            </div>
          </div>

          <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 font-bold py-3 rounded-xl text-slate-950 text-xs transition">
            Start Requesting
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className={`min-h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'} font-sans transition-colors duration-200`}>
      <div className="max-w-2xl mx-auto pb-24 p-4">
        {/* Broadcast Banner */}
        {bannerActive && bannerMessage && (
          <aside aria-label="Announcement" className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-500 p-3 rounded-xl text-xs flex items-center gap-2 shadow-inner">
            <span className="text-base" aria-hidden="true">📢</span>
            <p className="font-semibold flex-1">{bannerMessage}</p>
          </aside>
        )}

        {/* Header with Secret Triple Tap */}
        <header className="flex justify-between items-center py-3 mb-2">
          <div 
            onClick={handleTitleTripleTap} 
            className="text-left cursor-pointer select-none group"
            title="Plex Requests"
          >
            <h1 className="text-xl font-black tracking-tight text-amber-500 group-hover:text-amber-400 transition">
              Plex Requests
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {/* Initials Badge */}
              <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] flex items-center justify-center">
                {userName.charAt(0).toUpperCase()}
              </span>
              <p className="text-xs opacity-70">
                Hi, {userName} {isAdmin && <span className="text-amber-500 font-bold">(Admin)</span>}
              </p>
            </div>
          </div>

          <button 
            onClick={() => { setTempName(userName); setTempEmail(userEmail); setShowSettings(true); }}
            className={`p-2 rounded-xl border ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} opacity-75 hover:opacity-100 transition`}
            title="Settings"
            aria-label="Settings"
          >
            ⚙️
          </button>
        </header>

        {/* Navigation Tabs (Admin Tab completely hidden unless triple-tapped or unlocked) */}
        <nav aria-label="Main Navigation" className={`flex ${isLight ? 'bg-white/80' : 'bg-slate-900/80'} backdrop-blur p-1 rounded-xl mb-5 border ${isLight ? 'border-slate-300' : 'border-slate-800'} text-xs font-semibold`}>
          <button
            onClick={() => handleTabClick('search')}
            className={`flex-1 py-2 rounded-lg transition ${activeTab === 'search' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'opacity-60 hover:opacity-100'}`}
          >
            Search
          </button>

          <button
            onClick={() => handleTabClick('list')}
            className={`flex-1 py-2 rounded-lg transition relative ${activeTab === 'list' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'opacity-60 hover:opacity-100'}`}
          >
            My Requests ({visibleRequests.length})
            {hasUnreadUpdates && (
              <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            )}
            {hasUnreadUpdates && (
              <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          {(showAdminTab || isAdmin) && (
            <button
              onClick={() => handleTabClick('admin')}
              className={`flex-1 py-2 rounded-lg transition ${activeTab === 'admin' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'opacity-60 hover:opacity-100'}`}
            >
              Admin {userRequests.filter(r => r.status === 'pending').length > 0 && `(${userRequests.filter(r => r.status === 'pending').length})`}
            </button>
          )}
        </nav>

        {/* Search & Discovery Tab */}
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

            {/* Expandable Genre Chips */}
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

                {/* Extended Genres Drawer */}
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
                const isUserOwner = matchingRequest?.requested_by?.toLowerCase() === userName.toLowerCase();

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
                        isUserOwner ? (
                          <button
                            onClick={() => handleDismissOrCancel(matchingRequest.id)}
                            className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 transition"
                          >
                            ✕ Cancel Request
                          </button>
                        ) : (
                          <span className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-slate-800 text-slate-500 text-center">
                            Requested
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

        {/* My Requests Tab */}
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

        {/* Admin Dashboard */}
        {activeTab === 'admin' && (
          <section className="space-y-4">
            {!isAdmin ? (
              <form 
                onSubmit={handleAdminLogin} 
                className={`space-y-3 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border p-5 rounded-xl shadow-xl`}
              >
                <h2 className="text-sm font-bold">Admin Authentication</h2>
                <p className="text-xs opacity-60">Enter PIN to access server management:</p>
                <input
                  type="password"
                  placeholder="Enter PIN"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  className={`w-full ${isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'} border px-3 py-2 rounded-lg outline-none focus:border-amber-500 text-sm`}
                />
                <button type="submit" className="w-full bg-amber-500 font-bold py-2 rounded-lg text-slate-950 text-xs transition">
                  Unlock Dashboard
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-500">● Admin Unlocked</span>
                  <button onClick={handleAdminLogout} className="text-xs opacity-60 hover:opacity-100 underline">
                    Lock Admin
                  </button>
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

                {/* User Directory & Email Broadcast */}
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
                          <p className="font-bold text-xs truncate hover:text-amber-500">{p.name}</p>
                          <p className="text-[10px] opacity-60 truncate">{p.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEditProfileName(p.id, p.name)} 
                            className="text-[10px] opacity-60 hover:opacity-100"
                          >
                            Rename
                          </button>
                          <button 
                            onClick={() => handleDeleteProfile(p.id, p.name)} 
                            className="text-[10px] text-rose-400 hover:text-rose-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* User History Inspector Modal */}
                {inspectUser && (
                  <div className={`p-4 rounded-xl border space-y-3 ${isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-950 border-slate-800'}`}>
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-xs">Request History for: {inspectUser.name}</h4>
                      <button onClick={() => setInspectUser(null)} className="text-xs opacity-60">✕ Close</button>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {userRequests.filter(r => cleanString(r.requested_by) === cleanString(inspectUser.name)).length === 0 ? (
                        <p className="text-[11px] opacity-60">No requests submitted by this user.</p>
                      ) : (
                        userRequests
                          .filter(r => cleanString(r.requested_by) === cleanString(inspectUser.name))
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

                        {/* Optional Inline Decline Note Box */}
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
              </div>
            )}
          </section>
        )}

        {/* Details & Trailer Modal */}
        {selectedMedia && (() => {
          const modalMatch = findDbMatch(selectedMedia);
          const modalStatus = modalMatch?.status?.toLowerCase().trim();
          const isUserOwner = modalMatch?.requested_by?.toLowerCase() === userName.toLowerCase();
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
                  isUserOwner ? (
                    <button
                      onClick={() => handleDismissOrCancel(modalMatch.id)}
                      className="w-full bg-rose-900/60 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-3 rounded-xl text-xs transition"
                    >
                      ✕ Cancel Request
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full bg-slate-800 text-slate-500 font-bold py-3 rounded-xl text-xs cursor-not-allowed"
                    >
                      Already Requested
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

        {/* User Preferences & Theme Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <form onSubmit={handleSaveSettings} className={`${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'} border p-5 rounded-2xl w-full max-w-sm space-y-4`}>
              <h3 className="text-sm font-bold">User Preferences</h3>
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
                <label className="text-xs opacity-60">Email Address</label>
                <input
                  type="email"
                  required
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
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

              <div className="flex gap-2">
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
                  Save
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
