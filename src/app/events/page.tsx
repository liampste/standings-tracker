'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Event = {
    id: string
    user_id: string
    name: string
    created_at: string
}

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [newEventName, setNewEventName] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [error, setError] = useState('')
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        fetchEvents()
    }, [])

    const fetchEvents = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            setError(error.message)
        } else {
            setEvents(data)
        }
        setLoading(false)
    }

    const handleCreateEvent = async () => {
        if (!newEventName.trim()) return
        setCreating(true)

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            setError('You must be logged in to create an event')
            setCreating(false)
            return
        }

        const { error } = await supabase
            .from('events')
            .insert({ name: newEventName.trim(), user_id: user.id })

        if (error) {
            setError(error.message)
        } else {
            setNewEventName('')
            setShowForm(false)
            fetchEvents()
        }
        setCreating(false)
    }

    const handleDeleteEvent = async (id: string) => {
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', id)

        if (error) {
            setError(error.message)
        } else {
            fetchEvents()
        }
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Loading...</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-900">
                    Tournament Tracker
                </h1>
                <button
                    onClick={handleLogout}
                    className="text-sm text-gray-600 hover:text-gray-900"
                >
                    Sign out
                </button>
            </nav>

            <div className="max-w-4xl mx-auto px-6 py-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">
                        My Events
                    </h2>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                    >
                        + New Event
                    </button>
                </div>

                {error && (
                    <p className="text-red-500 text-sm mb-4">{error}</p>
                )}

                {showForm && (
                    <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                        <h3 className="text-sm font-medium text-gray-700 mb-3">
                            Create New Event
                        </h3>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={newEventName}
                                onChange={(e) => setNewEventName(e.target.value)}
                                placeholder="Event name"
                                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleCreateEvent}
                                disabled={creating}
                                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                            <button
                                onClick={() => setShowForm(false)}
                                className="text-gray-500 px-4 py-2 rounded-md text-sm hover:text-gray-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {events.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <p className="text-lg mb-2">No events yet</p>
                        <p className="text-sm">Create your first event to get started</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {events.map((event) => (
                            <div
                                key={event.id}
                                className="bg-white rounded-lg shadow-sm p-5 flex justify-between items-center hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => router.push(`/events/${event.id}`)}
                            >
                                <div>
                                    <h3 className="font-semibold text-gray-900">
                                        {event.name}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Created {new Date(event.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleDeleteEvent(event.id)
                                    }}
                                    className="text-red-500 hover:text-red-700 text-sm px-3 py-1 rounded hover:bg-red-50"
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}