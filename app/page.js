'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// CHANGE YOUR ADMIN PIN HERE:
const ADMIN_PIN = '1234'; 

function cleanString(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD') // Splits accented characters like é into e + accent
    .replace(/[\u0300-\u036f]/g, '') // Strips the accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Strips all symbols, spaces, quotes
    .trim();
}
function cleanYear(yr) {
  if (!yr) return '';
  const match = String(yr).match(/\d{4}/);
  return match ? match[0] : '';
}

export default function Home() {
  const [userName, setUserName] = useState('');
  const [tempName, setTempName] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [userRequests, setUserRequests] = useState([]);
  const [matchedDbItems, setMatchedDbItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
  const [adminPass, setAdminPass] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('plex_requester_name');
    if (saved) setUserName(saved);
    fetchUserRequests();
  }, []);

  const fetchUserRequests = async () => {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .neq('requested_by', 'Plex Library')
      .order('created_at', { ascending: false });

    if (data) setUserRequests(data);
  };

  // Predictive search: pulls Pages 1, 2, and 3 (~40-60 titles)
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      setMatchedDbItems([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const query = encodeURIComponent(search);
        
        // Fetch 3 pages in parallel to give up to ~60 comprehensive results
        const [res1, res2, res3] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&page=1`).then(r => r.json()),
          fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&page=2`).then(r => r.json()),
          fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&page=3`).then(r => r.json()),
        ]);

        const rawList = [
          ...(res1.results || []),
          ...(res2.results || []),
          ...(res3.results || [])
        ];

        // Deduplicate and filter out items without posters
        const seenIds = new Set();
        const filtered = rawList.filter(item => {
          if (!item.poster_path) return false;
          if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
          if (seenIds.has(item.id)) return false;
          seenIds.add(item.id);
          return true;
        });

        setResults(filtered);

        // Targeted check against Supabase for all retrieved items
       if (filtered.length > 0) {
          const titlesToSearch = filtered.map(item => (item.title || item.name).trim());
          
          // Query Supabase for exact title matches OR titles matching the search word
          const { data: dbMatches } = await supabase
            .from('requests')
            .select('*')
            .or(`title.in.(${titlesToSearch.map(t => `"${t.replace(/"/g, '')}"`).join(',')}),title.ilike.%${search.trim()}%`);

          if (dbMatches) {
            setMatchedDbItems(dbMatches);
          }
        }
      } catch (err) {
        console.error('Search error:', err);
      }
      setLoading(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const saveName = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    localStorage.setItem('plex_requester_name', tempName.trim());
    setUserName(tempName.trim());
  };

  const handleResetHome = () => {
    setSearch('');
    setResults([]);
    setMatchedDbItems([]);
    setActiveTab('search');
  };

  const handleRequest = async (item) => {
    const title = item.title || item.name;
    const year = cleanYear(item.release_date || item.first_air_date || '');
    const tmdbId = String(item.id);

    const { error } = await supabase.from('requests').insert([{
      title,
      media_type: item.media_type,
      year,
      poster_path: item.poster_path,
      tmdb_id: tmdbId,
      requested_by: userName,
      status: 'pending'
    }]);

    if (error) {
      alert(`Database Error: ${error.message}`);
      return;
    }

    alert(`Requested "${title}" (${year})!`);
    await fetchUserRequests();
    
    // Add locally to instant matches
    setMatchedDbItems(prev => [...prev, { title, year, status: 'pending', tmdb_id: tmdbId }]);
  };

  const markDone = async (id) => {
    const { error } = await supabase.from('requests').update({ status: 'done' }).eq('id', id);
    if (!error) fetchUserRequests();
  };

  if (!userName) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <form onSubmit={saveName} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-4 text-center shadow-xl">
          <h1 className="text-2xl font-bold">What is your name?</h1>
          <p className="text-slate-400 text-sm">Enter your name so we know who requested the media.</p>
          <input
            type="text"
            required
            placeholder="e.g. Dad, Sarah, Alex"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 px-4 py-3 rounded-xl text-white outline-none focus:border-amber-500"
          />
          <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 font-semibold py-3 rounded-xl text-black transition">
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="max-w-xl mx-auto min-h-screen pb-24 p-4">
      {/* Top Header */}
      <header className="flex justify-between items-center py-4 mb-2">
        <button 
          onClick={handleResetHome} 
          className="text-left group cursor-pointer focus:outline-none"
        >
          <h1 className="text-xl font-bold tracking-tight text-amber-400 group-hover:text-amber-300 transition">
            Plex Requests
          </h1>
          <p className="text-xs text-slate-400">Hi, {userName}</p>
        </button>
      </header>

      {/* Tabs */}
      <div className="flex bg-slate-900 p-1 rounded-xl mb-6 border border-slate-800 text-sm">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex-1 py-2 rounded-lg font-medium transition ${activeTab === 'search' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
        >
          Search
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-2 rounded-lg font-medium transition ${activeTab === 'list' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
        >
          Requests ({userRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('admin')}
          className={`flex-1 py-2 rounded-lg font-medium transition ${activeTab === 'admin' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
        >
          Admin
        </button>
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <section className="space-y-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search movie or TV show..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl text-white outline-none focus:border-amber-500"
            />
            {loading && (
              <span className="absolute right-4 top-3.5 text-xs text-amber-400 animate-pulse">
                Searching...
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {results.map((item) => {
              const title = item.title || item.name;
              const year = cleanYear(item.release_date || item.first_air_date || '');
              const tmdbId = String(item.id);
              const cleanItemTitle = cleanString(title);

             const matchingRequest = matchedDbItems.find(r => {
                if (r.tmdb_id && r.tmdb_id === tmdbId) return true;

                const cleanDbTitle = cleanString(r.title);
                const cleanDbYear = cleanYear(r.year);

                // Check exact clean match OR check if one title contains the other (e.g. "Detective Pikachu" inside "Pokemon Detective Pikachu")
                const titlesMatch = cleanDbTitle === cleanItemTitle || 
                                    (cleanDbTitle.length > 5 && cleanItemTitle.includes(cleanDbTitle)) ||
                                    (cleanItemTitle.length > 5 && cleanDbTitle.includes(cleanItemTitle));

                if (titlesMatch) {
                  if (cleanDbYear && year) {
                    return cleanDbYear === year;
                  }
                  return true;
                }
                return false;
              });

              const requestStatus = matchingRequest?.status?.toLowerCase().trim();
              const isAlreadyAdded = requestStatus === 'done';
              const isPending = requestStatus === 'pending';

              return (
                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between">
                  <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={title} className="w-full aspect-[2/3] object-cover" />
                  <div className="p-3 flex flex-col flex-1 justify-between">
                    <div>
                      <p className="font-semibold text-sm line-clamp-1">{title}</p>
                      <p className="text-xs text-slate-400">{year || 'N/A'} • {item.media_type.toUpperCase()}</p>
                    </div>

                    {isAlreadyAdded ? (
                      <button
                        disabled
                        className="mt-3 w-full py-2 text-xs font-bold rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 cursor-default"
                      >
                        ✓ On Plex
                      </button>
                    ) : isPending ? (
                      <button
                        disabled
                        className="mt-3 w-full py-2 text-xs font-bold rounded-lg bg-slate-800 text-slate-500 cursor-not-allowed"
                      >
                        Requested
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRequest(item)}
                        className="mt-3 w-full py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
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

      {/* Requests List Tab */}
      {activeTab === 'list' && (
        <section className="space-y-3">
          {userRequests.length === 0 ? (
            <p className="text-center text-slate-500 py-10 text-sm">No new requests submitted yet.</p>
          ) : (
            userRequests.map((r) => (
              <div key={r.id} className="flex gap-3 bg-slate-900 border border-slate-800 p-2.5 rounded-xl items-center">
                {r.poster_path ? (
                  <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-12 h-16 rounded object-cover" />
                ) : (
                  <div className="w-12 h-16 bg-slate-800 rounded flex items-center justify-center text-slate-500 text-xs font-bold">
                    {r.media_type === 'tv' ? 'TV' : 'FILM'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.title} {r.year && <span className="text-slate-400 font-normal">({r.year})</span>}</p>
                  <p className="text-xs text-slate-400">By: {r.requested_by}</p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${r.status === 'done' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}>
                  {r.status === 'done' ? '✓ Added to Plex' : '⏳ Pending'}
                </span>
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
              className="space-y-3 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg"
            >
              <h2 className="text-base font-semibold text-white">Admin Access</h2>
              <p className="text-sm text-slate-300">Welcome Alfredo, please enter your PIN:</p>
              <input
                type="password"
                placeholder="Enter PIN"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 px-3 py-2.5 rounded-lg text-white outline-none focus:border-amber-500"
              />
              <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 rounded-lg text-sm transition">
                Unlock Admin
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-1">
                <h2 className="font-bold text-sm text-slate-300">Pending Requests to Add:</h2>
                <button 
                  onClick={() => setIsAdmin(false)} 
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Lock Admin
                </button>
              </div>
              {userRequests.filter(r => r.status === 'pending').map((r) => (
                <div key={r.id} className="flex gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl items-center">
                  {r.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-12 h-16 rounded object-cover" />
                  ) : (
                    <div className="w-12 h-16 bg-slate-800 rounded flex items-center justify-center text-slate-500 text-xs font-bold">
                      {r.media_type === 'tv' ? 'TV' : 'FILM'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{r.title} {r.year && <span className="text-slate-400 font-normal">({r.year})</span>}</p>
                    <p className="text-xs text-amber-400 font-medium">Requested by: {r.requested_by}</p>
                    <p className="text-[11px] text-slate-400 uppercase">{r.media_type}</p>
                  </div>
                  <button
                    onClick={() => markDone(r.id)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-2 rounded-lg shrink-0 transition"
                  >
                    Mark Done
                  </button>
                </div>
              ))}
              {userRequests.filter(r => r.status === 'pending').length === 0 && (
                <p className="text-slate-500 text-center py-6 text-sm">All requests are completed!</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
