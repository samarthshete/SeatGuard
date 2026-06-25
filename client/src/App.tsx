import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import Visualizer from './components/Visualizer';
import AuthPanel, { type AuthUser } from './components/AuthPanel';
import './App.css';

// Connect to API Server
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const socket = io(API_URL);

const TOKEN_KEY = 'sg_token';
const USER_KEY = 'sg_user';

type SeatStatus = 'AVAILABLE' | 'BOOKED' | 'LOCKED' | 'PENDING';

interface Seat {
  id: number;
  status: SeatStatus;
}

function App() {
  const [seats, setSeats] = useState<Seat[]>(
    Array.from({ length: 100 }, (_, i) => ({ id: i + 1, status: 'AVAILABLE' }))
  );

  // Auth state (persisted in localStorage)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  const handleAuth = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };
  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  };

  // Track "optimistic" booking attempts to show spinner/yellow state
  const [pendingSeats, setPendingSeats] = useState<Set<number>>(new Set());

  const [metrics, setMetrics] = useState({ booked: 0, available: 100 });

  // Real stats from the API's GET /api/stats endpoint (server-computed, not
  // fabricated client-side) plus the latest human-readable event message.
  const [stats, setStats] = useState({ booked: 0, available: 100, conflicts: 0 });
  const [lastMessage, setLastMessage] = useState('System Ready');

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stats`);
      if (!res.ok) return;
      const data: {
        seats: { total: number; booked: number; available: number };
        bookings: { total: number; conflicts: number };
      } = await res.json();
      setStats({
        booked: data.seats.booked,
        available: data.seats.available,
        conflicts: data.bookings.conflicts,
      });
    } catch {
      // Stats are best-effort; ignore transient failures.
    }
  };

  useEffect(() => {
    // 0. Initial Data Fetch
    const fetchSeats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/seats`);
        if (!res.ok) throw new Error('Failed to fetch seats');
        const data: Array<{ number: number; status: string }> = await res.json();
        // Map DB "number" to Frontend "id"
        const mappedSeats: Seat[] = data.map((s) => ({
          id: s.number,
          status: s.status as SeatStatus
        }));
        setSeats(mappedSeats);
        setLastMessage('System Synchronized');
      } catch (err) {
        console.error("Failed to sync seats:", err);
      }
    };
    fetchSeats();
    fetchStats();

    // Refresh real stats periodically so the dashboard stays accurate.
    const statsInterval = setInterval(fetchStats, 5000);
    return () => clearInterval(statsInterval);
  }, []);

  useEffect(() => {
    // Listen for real-time seat updates broadcast by the API.
    const onSeatUpdate = (data: { seatNumber: number; status: SeatStatus }) => {
      setSeats(prev => prev.map(seat => {
        if (seat.id === data.seatNumber) {
          // Remove from pending if it was pending
          if (pendingSeats.has(seat.id)) {
            const newPending = new Set(pendingSeats);
            newPending.delete(seat.id);
            setPendingSeats(newPending);
          }
          return { ...seat, status: data.status };
        }
        return seat;
      }));
      setLastMessage(`Confirmed: Seat ${data.seatNumber} booked`);
      // Pull fresh server-side numbers for the stats panel.
      fetchStats();
    };

    socket.on('seat-update', onSeatUpdate);
    return () => {
      socket.off('seat-update', onSeatUpdate);
    };
  }, [pendingSeats]);

  useEffect(() => {
    const bookedCount = seats.filter(s => s.status === 'BOOKED').length;
    setMetrics({
      booked: bookedCount,
      available: seats.length - bookedCount
    });
  }, [seats]);

  const handleSeatClick = async (seat: Seat) => {
    if (seat.status !== 'AVAILABLE') return;

    // Booking requires authentication.
    if (!token) {
      setLastMessage('Please log in to book a seat');
      return;
    }

    // 1. Optimistic UI Update (Yellow/Pending)
    setPendingSeats(prev => new Set(prev).add(seat.id));
    setSeats(prev => prev.map(s =>
      s.id === seat.id ? { ...s, status: 'PENDING' } : s
    ));
    setLastMessage(`Booking Seat ${seat.id}…`);

    try {
      const res = await fetch(`${API_URL}/api/book-async`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ seatNumber: seat.id })
      });

      if (res.status === 401) {
        // Token expired/invalid — force re-login and revert the seat.
        handleLogout();
        setSeats(prev => prev.map(s => (s.id === seat.id ? { ...s, status: 'AVAILABLE' } : s)));
        setPendingSeats(prev => {
          const n = new Set(prev);
          n.delete(seat.id);
          return n;
        });
        setLastMessage('Session expired — please log in again');
        return;
      }

      if (res.status === 409) {
        // Seat was actually already booked (lost the race) — correct the UI.
        setSeats(prev => prev.map(s =>
          s.id === seat.id ? { ...s, status: 'BOOKED' } : s
        ));
        setPendingSeats(prev => {
          const newSet = new Set(prev);
          newSet.delete(seat.id);
          return newSet;
        });
        setLastMessage(`Seat ${seat.id} already taken (409)`);
        fetchStats();
      } else if (!res.ok) {
        // Other errors (500, etc) - Revert
        setSeats(prev => prev.map(s =>
          s.id === seat.id ? { ...s, status: 'AVAILABLE' } : s
        ));
        setPendingSeats(prev => {
          const newSet = new Set(prev);
          newSet.delete(seat.id);
          return newSet;
        });
        setLastMessage(`Booking failed for Seat ${seat.id}`);
      }

      // If 200 OK, we wait for the socket 'seat-update' event to confirm.

    } catch (err) {
      console.error("Booking request failed", err);
      setSeats(prev => prev.map(s =>
        s.id === seat.id ? { ...s, status: 'AVAILABLE' } : s
      ));
      setPendingSeats(prev => {
        const newSet = new Set(prev);
        newSet.delete(seat.id);
        return newSet;
      });
      setLastMessage(`Booking request failed for Seat ${seat.id}`);
    }
  };

  return (
    <div className="container">
      <h1>TicketBlitz Live ⚡</h1>

      <AuthPanel apiUrl={API_URL} user={user} onAuth={handleAuth} onLogout={handleLogout} />
      {!user && (
        <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '-0.5rem' }}>
          Log in or create an account to book seats.
        </p>
      )}

      <div className="metrics">
        <div className="card">
          <h3>Available</h3>
          <span className="green">{metrics.available}</span>
        </div>
        <div className="card">
          <h3>Sold Out</h3>
          <span className="red">{metrics.booked}</span>
        </div>
      </div>

      <div className="grid">
        {seats.map(seat => (
          <div
            key={seat.id}
            onClick={() => handleSeatClick(seat)}
            className={`seat ${seat.status.toLowerCase()}`}
            title={`Seat ${seat.id}`}
          >
            {seat.status === 'PENDING' ? '...' : seat.id}
          </div>
        ))}
      </div>

      <Visualizer stats={{ ...stats, lastMessage }} />

      <p style={{ marginTop: '2rem', color: '#666', fontSize: '0.8rem' }}>
        Backend: Node.js + Fastify + Prisma + PostgreSQL | Real-time: Socket.io | Frontend: React + Vite
      </p>
    </div>
  );
}

export default App;
