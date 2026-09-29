'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Admin PIN
const ADMIN_PIN = '1234';

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

// Determines if a movie is likely still theatrical / not out on physical or digital yet
function getTheatricalStatus(releaseDateStr, mediaType) {
  if (!releaseDateStr || mediaType === 'tv') return null;
  const release = new Date(releaseDateStr);
  const now = new Date();
  
  if (isNaN(release.getTime())) return null;

  // If release date is in the future
  if (release > now) {
    return 'Upcoming / Not Released';
  }

  // Movies typically take ~60 to 90 days from theater release to hit home digital / Blu-ray
  const diffDays = Math.floor((now - release) / (1000 * 60 * 60 * 24));
  if (diffDays <= 75) {
    return 'In Theaters / Pre-Digital';
  }

  return null;
}

const GENRE_CHIPS = [
  { label: 'Trending', id: 'trending' },
  { label: 'Movies', id: 'movie' },
  { label: 'TV Shows', id: 'tv' },
  { label: 'Action', id: '28' },
  { label: 'Comedy', id: '35' },
  { label: 'Horror', id: '27' },
  { label: 'Sci-Fi', id: '878' },
];

export default function Home() {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [tempName, setTempName] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('trending');
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
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [bannerInput, setBannerInput] = useState('');
  const [bannerToggle, setBannerToggle] = useState(false);

  useEffect(() => {
    const savedName = localStorage.getItem('plex_requester_name');
    const savedEmail = localStorage.getItem('plex_requester_email');
    if (savedName) setUserName(savedName);
    if (savedEmail) setUserEmail(savedEmail);
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

    if (data) setUserRequests(data);
  };

  // Helper matching function
  const findDbMatch = (item) => {
    const title = item.title || item.name;
    const year = cleanYear(item.release_date || item.first_air_date || '');
    const tmdbId = String(item.id);
    const cleanItemTitle = cleanString(title);

    return matchedDbItems.find(r => {
      if (r.tmdb_id && String(r.tmdb_id) === tmdbId) return true;
      const cleanDbTitle = cleanString(r.title);
      const cleanDbYear = cleanYear(r.year);

      const titlesMatch = cleanDbTitle === cleanItemTitle || 
                          (cleanDbTitle.length > 4 && cleanItemTitle.includes(cleanDbTitle)) ||
                          (cleanItemTitle.length > 4 && cleanDbTitle.includes(cleanItemTitle));

      if (titlesMatch) {
        if (cleanDbYear && year) {
          return cleanDbYear === year;
        }
        return true;
      }
      return false;
    });
  };

  // Browse Discovery (Trending / Genre Chips)
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
        const filtered = rawList.filter(item => {
          if (!item.poster_path) return false;
          if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
          if (seenIds.has(item.id)) return false;
          seenIds.add(item.id);
          return true;
        });

        setResults(filtered);
        checkDbMatches(filtered);
      } catch (err) {
        console.error('Search error:', err);
      }
      setLoading(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  // Check Supabase library for matches
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

  // Open Details Modal & attach matched row directly
  const handleOpenDetails = async (item) => {
    const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    let trailerKey = null;

    try {
      const res = await fetch(`https://api.themoviedb.org/3/${type}/${item.id}/videos?api_key=${TMDB_KEY}`);
      const data = await res.json();
      const trailer = (data.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
      if (trailer) trailerKey = trailer.key;
    } catch (e) {
      console.error('Trailer fetch error:', e);
    }

    setSelectedMedia({ ...item, trailerKey, media_type: type });
  };

  const handleRequest = async (item) => {
    const title = item.title || item.name;
    const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const year = cleanYear(item.release_date || item.first_air_date || '');
    const tmdbId = String(item.id);

    // Guard: Prevent requesting if already exists
    const existing = findDbMatch(item);
    if (existing) {
      if (existing.status === 'done') {
        alert(`"${title}" is already on Plex!`);
        return;
      }
      if (existing.status === 'pending') {
        alert(`"${title}" has already been requested!`);
        return;
      }
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

    // Fire Discord Notification
    if (discordWebhook) {
      try {
        await fetch(discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: `🎬 New Plex Request: ${title} (${year})`,
              description: `**Requested by:** ${userName}\n**Email:** ${userEmail || 'None provided'}\n**Type:** ${mediaType.toUpperCase()}\n**Overview:** ${item.overview ? item.overview.slice(0, 180) + '...' : 'N/A'}`,
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
    setMatchedDbItems(prev => [...prev, newRow || { title, year, status: 'pending', tmdb_id: tmdbId, id: Date.now(), requested_by: userName }]);
    setSelectedMedia(null);
  };

  // User Cancel Request
  const handleCancelRequest = async (id, title) => {
    if (!confirm(`Cancel your request for "${title}"?`)) return;
    const { error } = await supabase.from('requests').delete().eq('id', id);
    if (!error) {
      fetchUserRequests();
      setMatchedDbItems(prev => prev.filter(r => r.id !== id));
      if (selectedMedia) setSelectedMedia(null);
    }
  };

  // Admin Actions (Now removes immediately from the pending queue)
  // Admin Actions with automated email notifications
  const updateStatus = async (id, status, note = '') => {
    // 1. Update status in Supabase
    const { error } = await supabase.from('requests').update({ 
      status, 
      admin_note: note 
    }).eq('id', id);
    
    if (!error) {
      // Find the item to see if the user provided an email
      const targetRequest = userRequests.find(r => r.id === id);
      if (targetRequest && targetRequest.user_email) {
        try {
          await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: targetRequest.user_email,
              title: targetRequest.title,
              status,
              note
            })
          });
        } catch (err) {
          console.error('Failed to trigger email notification:', err);
        }
      }

      // Re-fetch so the item updates on screen immediately
      await fetchUserRequests();
      setMatchedDbItems(prev => prev.map(item => item.id === id ? { ...item, status, admin_note: note } : item));
    }
  };

  const handleDeclinePrompt = (id) => {
    const note = prompt('Optional reason for declining (or leave blank and press OK):');
    if (note !== null) {
      updateStatus(id, 'declined', note.trim());
    }
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
      alert('Settings updated successfully!');
    }
  };

  const saveUserProfiles = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    localStorage.setItem('plex_requester_name', tempName.trim());
    localStorage.setItem('plex_requester_email', tempEmail.trim());
    setUserName(tempName.trim());
    setUserEmail(tempEmail.trim());
    setShowSettings(false);
  };

  const visibleRequests = userRequests.filter(r => {
    if (isAdmin) return true;
    return r.requested_by?.toLowerCase().trim() === userName?.toLowerCase().trim();
  });

  if (!userName) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <form onSubmit={saveUserProfiles} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-4 text-center shadow-2xl">
          <h1 className="text-2xl font-bold text-white tracking-tight">Plex Requests</h1>
          <p className="text-slate-400 text-xs">Enter your details to start requesting movies and TV shows.</p>
          <input
            type="text"
            required
            placeholder="Your Name (e.g. Sarah, Dad)"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl text-white outline-none focus:border-amber-500"
          />
          <div className="text-left">
            <input
              type="email"
              placeholder="Email for updates (optional)"
              value={tempEmail}
              onChange={(e) => setTempEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl text-white outline-none focus:border-amber-500 text-sm"
            />
            <p className="text-[11px] text-slate-500 mt-1 px-1">Optional: Provide email to receive updates on your requests.</p>
          </div>
          <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 font-bold py-3 rounded-xl text-slate-950 transition">
            Start Requesting
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen pb-24 p-4 text-slate-100 font-sans">
      {/* Broadcast Announcement Banner */}
      {bannerActive && bannerMessage && (
        <aside aria-label="Announcement" className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-300 p-3 rounded-xl text-xs flex items-center gap-2 shadow-inner">
          <span className="text-base" aria-hidden="true">📢</span>
          <p className="font-medium flex-1">{bannerMessage}</p>
        </aside>
      )}

      {/* Header */}
      <header className="flex justify-between items-center py-3 mb-2">
        <button 
          onClick={() => { setSearch(''); setActiveTab('search'); }} 
          className="text-left group cursor-pointer focus:outline-none"
        >
          <h1 className="text-xl font-black tracking-tight text-amber-400 group-hover:text-amber-300 transition">
            Plex Requests
          </h1>
          <p className="text-xs text-slate-400">Welcome, {userName}</p>
        </button>

        <button 
          onClick={() => { setTempName(userName); setTempEmail(userEmail); setShowSettings(true); }}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition"
          title="Settings"
          aria-label="Settings"
        >
          ⚙️
        </button>
      </header>

      {/* Navigation Tabs */}
      <nav aria-label="Main Navigation" className="flex bg-slate-900/80 backdrop-blur p-1 rounded-xl mb-5 border border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex-1 py-2 rounded-lg transition ${activeTab === 'search' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'}`}
        >
          Search
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-2 rounded-lg transition ${activeTab === 'list' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'}`}
        >
          {isAdmin ? `All Requests (${userRequests.length})` : `My Requests (${visibleRequests.length})`}
        </button>
        <button
          onClick={() => setActiveTab('admin')}
          className={`flex-1 py-2 rounded-lg transition ${activeTab === 'admin' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'}`}
        >
          Admin
        </button>
      </nav>

      {/* Search / Discovery Tab */}
      {activeTab === 'search' && (
        <section className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search movies & TV shows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 focus:border-amber-500 px-4 py-3 rounded-xl text-white outline-none placeholder-slate-500 text-sm shadow-inner"
            />
            {loading && (
              <span className="absolute right-4 top-3 text-xs text-amber-400 animate-pulse">
                Fetching...
              </span>
            )}
          </div>

          {!search.trim() && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none text-xs font-medium">
              {GENRE_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setSelectedGenre(chip.id)}
                  className={`px-3.5 py-1.5 rounded-full border shrink-0 transition ${
                    selectedGenre === chip.id
                      ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
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
                  className="bg-slate-900/70 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col justify-between group hover:border-slate-700 transition"
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
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent opacity-80" />
                    
                    {/* Theatrical / Availability Tag */}
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
                      <p className="font-semibold text-xs line-clamp-1 text-slate-200">{title}</p>
                      <p className="text-[11px] text-slate-500">{year || 'N/A'} • {(item.media_type || (item.first_air_date ? 'tv' : 'movie')).toUpperCase()}</p>
                    </div>

                    {status === 'done' ? (
                      <a
                        href={`https://app.plex.tv/desktop#!/search?query=${encodeURIComponent(title)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800 text-center hover:bg-emerald-900 transition"
                      >
                        ▶ Open in Plex
                      </a>
                    ) : status === 'in_progress' ? (
                      <span className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-blue-950/70 text-blue-400 border border-blue-800 text-center">
                        ⚡ In Progress
                      </span>
                    ) : status === 'declined' ? (
                      <span className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-rose-950/70 text-rose-400 border border-rose-800 text-center">
                        ✕ Unavailable
                      </span>
                    ) : status === 'pending' ? (
                      isUserOwner ? (
                        <button
                          onClick={() => handleCancelRequest(matchingRequest.id, title)}
                          className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 transition"
                        >
                          ✕ Cancel Request
                        </button>
                      ) : (
                        <span className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-slate-800/80 text-slate-500 text-center">
                          Requested
                        </span>
                      )
                    ) : (
                      <button
                        onClick={() => handleRequest(item)}
                        className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
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

      {/* Requests Tab */}
      {activeTab === 'list' && (
        <section className="space-y-3">
          {visibleRequests.length === 0 ? (
            <p className="text-center text-slate-500 py-16 text-xs">No requests to display.</p>
          ) : (
            visibleRequests.map((r) => (
              <div key={r.id} className="flex gap-3 bg-slate-900/80 border border-slate-800/80 p-2.5 rounded-xl items-center">
                {r.poster_path ? (
                  <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-11 h-16 rounded-lg object-cover" />
                ) : (
                  <div className="w-11 h-16 bg-slate-800 rounded-lg flex items-center justify-center text-[10px] text-slate-500">MEDIA</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs truncate text-slate-200">{r.title} {r.year && <span className="text-slate-500 font-normal">({r.year})</span>}</p>
                  <p className="text-[11px] text-slate-400">By: {r.requested_by}</p>
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

                  {r.status === 'pending' && r.requested_by?.toLowerCase() === userName.toLowerCase() && (
                    <button 
                      onClick={() => handleCancelRequest(r.id, r.title)}
                      className="text-[10px] text-rose-400 hover:text-rose-300 underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Admin Tab */}
      {activeTab === 'admin' && (
        <section className="space-y-4">
          {!isAdmin ? (
            <form 
              onSubmit={(e) => { 
                e.preventDefault(); 
                if (adminPass === ADMIN_PIN) setIsAdmin(true); 
                else alert('Incorrect PIN'); 
              }} 
              className="space-y-3 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl"
            >
              <h2 className="text-sm font-bold text-white">Admin Authentication</h2>
              <p className="text-xs text-slate-400">Welcome Alfredo, please enter your PIN:</p>
              <input
                type="password"
                placeholder="Enter Admin PIN"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 px-3 py-2 rounded-lg text-white outline-none focus:border-amber-500 text-sm"
              />
              <button type="submit" className="w-full bg-amber-500 font-bold py-2 rounded-lg text-slate-950 text-xs transition">
                Unlock Dashboard
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Broadcast Announcement */}
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Broadcast Announcement</h3>
                <input
                  type="text"
                  placeholder="e.g. Server down for maintenance tonight"
                  value={bannerInput}
                  onChange={(e) => setBannerInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-white outline-none"
                />
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400 flex items-center gap-2">
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
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-2">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Discord Webhook Notification</h3>
                <input
                  type="text"
                  placeholder="Paste Discord Webhook URL"
                  value={discordWebhook}
                  onChange={(e) => setDiscordWebhook(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-white outline-none"
                />
                <button 
                  onClick={saveAdminSettings} 
                  className="bg-indigo-600 hover:bg-indigo-500 font-bold text-[11px] px-3 py-1.5 rounded-lg text-white"
                >
                  Save Webhook
                </button>
              </div>

              {/* Active Pending Queue Only */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-xs text-slate-300">Active Requests Queue:</h3>
                  <button onClick={() => setIsAdmin(false)} className="text-xs text-slate-400 underline">Lock Admin</button>
                </div>

                {userRequests.filter(r => r.status === 'pending' || r.status === 'in_progress').map((r) => (
                  <div key={r.id} className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex gap-3 items-center">
                    <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-11 h-16 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate text-white">{r.title} ({r.year})</p>
                      <p className="text-[11px] text-amber-400">Requested by: {r.requested_by}</p>
                      {r.user_email && <p className="text-[10px] text-slate-500">{r.user_email}</p>}
                      {r.status === 'in_progress' && <span className="text-[10px] text-blue-400 font-semibold">⚡ Downloading...</span>}
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
                        onClick={() => handleDeclinePrompt(r.id)}
                        className="bg-rose-900/70 hover:bg-rose-800 text-rose-300 font-bold text-[10px] px-2.5 py-1.5 rounded-md"
                      >
                        ✕ Decline
                      </button>
                    </div>
                  </div>
                ))}

                {userRequests.filter(r => r.status === 'pending' || r.status === 'in_progress').length === 0 && (
                  <p className="text-slate-500 text-center py-6 text-xs">All requests have been handled!</p>
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
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedMedia.title || selectedMedia.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-slate-400">
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
                  className="text-slate-400 hover:text-white text-lg font-bold p-1"
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
                <p className="text-xs text-slate-500 italic">No trailer video available for this title.</p>
              )}

              <p className="text-xs text-slate-300 leading-relaxed">{selectedMedia.overview || 'No synopsis available.'}</p>

              {/* Dynamic Contextual Action inside Modal */}
              {modalStatus === 'done' ? (
                <a
                  href={`https://app.plex.tv/desktop#!/search?query=${encodeURIComponent(selectedMedia.title || selectedMedia.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full block py-3 text-xs font-bold rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 text-center hover:bg-emerald-900 transition"
                >
                  ▶ Open in Plex
                </a>
              ) : modalStatus === 'pending' ? (
                isUserOwner ? (
                  <button
                    onClick={() => handleCancelRequest(modalMatch.id, selectedMedia.title || selectedMedia.name)}
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
              ) : modalStatus === 'declined' ? (
                <button
                  disabled
                  className="w-full bg-rose-950/60 text-rose-400 border border-rose-800 font-bold py-3 rounded-xl text-xs cursor-not-allowed"
                >
                  ✕ Marked Unavailable by Admin
                </button>
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

      {/* User Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={saveUserProfiles} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-sm space-y-4">
            <h3 className="text-sm font-bold text-white">User Preferences</h3>
            <div>
              <label className="text-xs text-slate-400">Your Display Name</label>
              <input
                type="text"
                required
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-white text-xs mt-1 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Email for Notifications (Optional)</label>
              <input
                type="email"
                value={tempEmail}
                onChange={(e) => setTempEmail(e.target.value)}
                placeholder="youremail@example.com"
                className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-white text-xs mt-1 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setShowSettings(false)} 
                className="flex-1 bg-slate-800 text-slate-300 py-2 rounded-lg text-xs"
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
  );
}
