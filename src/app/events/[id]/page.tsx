'use client'

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase-browser"
import { useStyleRegistry } from "styled-jsx"

type Participant = {
    id: string
    event_id: string
    name: string
    seed: number | null
    created_at: string
}

type Stage = {
    id: string
    event_id: string
    name: string
    format: 'round_robin' | 'single_elim' | 'double_elim'
    display_order: number
    rounds: number | null
    points_win: number
    points_draw: number
    points_loss: number
    overtime_enabled: boolean
    seeded: boolean
    generated: boolean
    created_string: string
}

export default function EventPage() {
    const [event, setEvent] = useState<{ id: string; name: string } | null>(null)
    const [participants, setParticipants] = useState<Participant[]>([])
    const [stages, setStages] = useState<Stage[]>([])
    const [activeTab, setActiveTab] = useState<'participants' | 'stages'>('participants')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [newParticipantName, setNewParticipantName] = useState('')
    const [addingParticipant, setAddingParticipant] = useState(false)
    const [showParticipantForm, setShowParticipantForm] = useState(false)
    const [deletingStageId, setDeletingStageId] = useState<string | null>(null)
    const router = useRouter()
    const params = useParams()
    const eventId = params.id as string
    const supabase = createClient()

    useEffect(() => {
        fetchAll()
    }, [])

    const fetchAll = async () => {
        setLoading(true)
        await Promise.all([fetchEvent(), fetchParticipants(), fetchStages()])
        setLoading(false)
    }

    const fetchEvent = async () => {
        const { data, error } = await supabase
            .from('events')
            .select('id, name')
            .eq('id', eventId)
            .single()
        
        if (error) {
            setError(error.message)
        } else {
            setEvent(data)
        }
    }

    const fetchParticipants = async () => {
        const { data, error } = await supabase
            .from('event_participants')
            .select('*')
            .eq('event_id', eventId)
            .order('created_at', { ascending: true })

        if (error) {
            setError(error.message)
        } else {
            setParticipants(data)
        }
    }

    const fetchStages = async () => {
        const { data, error } = await supabase
            .from('stages')
            .select('*')
            .eq('event_id', eventId)
            .order('display_order', { ascending: true })
        
        if (error) {
            setError(error.message)
        } else {
            setStages(data)
        }
    }

    const handleAddParticipant = async () => {
        if (!newParticipantName.trim()) return
        setAddingParticipant(true)

        const { error } = await supabase
            .from('event_participants')
            .insert({ event_id: eventId, name: newParticipantName.trim() })
        
        if (error) {
            setError(error.message)
        } else {
            setNewParticipantName('')
            setAddingParticipant(false)
            fetchParticipants()
        }
        setAddingParticipant(false)
    }

    const handleDeleteParticipant = async (id: string) => {
        const { error } = await supabase
            .from('event_participants')
            .delete()
            .eq('id', id)
        
        if (error) {
            setError(error.message)
        } else {
            fetchParticipants()
        }
    }

    const handleDeleteStage = async (id: string) => {
        setDeletingStageId(id)
        const { error } = await supabase
            .from('stages')
            .delete()
            .eq('id', id)

        if (error) setError(error.message)
        else fetchStages()
        setDeletingStageId(null)
    }

    const hasStages = stages.length > 0

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
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/events')}
                        className="text-sm text-gray-500 hover:text-gray-900"
                    >
                        ← Back
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">
                        {event?.name}
                    </h1>
                </div>
            </nav>

            <div className="max-w-4xl mx-auto px-6 py-8">
                {error && (
                    <p className="text-red-500 text-sm mb-4">{error}</p>
                )}

                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6">
                    <button
                        onClick={() => setActiveTab('participants')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'participants'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Participants ({participants.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('stages')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'stages'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Stages ({stages.length})
                    </button>
                </div>

                {/* Participants Tab */}
                {activeTab === 'participants' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">
                                Participants
                            </h2>
                            {!hasStages && (
                                <button
                                    onClick={() => setShowParticipantForm(!showParticipantForm)}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                                >
                                    + Add Participant
                                </button>
                            )}
                        </div>

                        {hasStages && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                                <p className="text-yellow-800 text-sm">
                                    Participants are locked once stages have been created. Delete all stages to make changes.
                                </p>
                            </div>
                        )}

                        {showParticipantForm && !hasStages && (
                            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={newParticipantName}
                                        onChange={(e) => setNewParticipantName(e.target.value)}
                                        placeholder="Participant name"
                                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        onClick={handleAddParticipant}
                                        disabled={addingParticipant}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {addingParticipant ? 'Adding...' : 'Add'}
                                    </button>
                                    <button
                                        onClick={() => setShowParticipantForm(false)}
                                        className="text-gray-500 px-4 py-2 rounded-md text-sm hover:text-gray-700"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {participants.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                <p className="text-lg mb-2">No participants yet</p>
                                <p className="text-sm">Add participants before creating stages</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {participants.map((participant, index) => (
                                    <div
                                        key={participant.id}
                                        className="bg-white rounded-lg shadow-sm p-4 flex justify-between items-center"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm text-gray-400 w-6">
                                                {index + 1}
                                            </span>
                                            <span className="font-medium text-gray-900">
                                                {participant.name}
                                            </span>
                                        </div>
                                        {!hasStages && (
                                            <button
                                                onClick={() => handleDeleteParticipant(participant.id)}
                                                className="text-red-500 hover:text-red-700 text-sm px-3 py-1 rounded hover:bg-red-50"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Stages Tab */}
                {activeTab === 'stages' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">
                                Stages
                            </h2>
                            {participants.length >= 2 && (
                                <button
                                    onClick={() => router.push(`/events/${eventId}/stages/new`)}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                                >
                                    + New Stage
                                </button>
                            )}
                        </div>

                        {participants.length < 2 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                                <p className="text-yellow-800 text-sm">
                                    You need at least 2 participants before creating a stage.
                                </p>
                            </div>
                        )}

                        {stages.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                <p className="text-lg mb-2">No stages yet</p>
                                <p className="text-sm">Create a stage to generate a schedule or bracket</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {stages.map((stageItem) => (
                                    <div
                                        key={stageItem.id}
                                        className={`bg-white rounded-lg shadow-sm p-5 flex justify-between items-center transition-shadow ${
                                            deletingStageId === stageItem.id
                                                ? 'opacity-50 cursor-default'
                                                : 'hover:shadow-md cursor-pointer'
                                        }`}
                                        onClick={() => {
                                            if (deletingStageId !== stageItem.id) {
                                                router.push(`/events/${eventId}/stages/${stageItem.id}`)
                                            }
                                        }}
                                    >
                                        <div>
                                            <h3 className="font-semibold text-gray-900">
                                                {stageItem.name}
                                            </h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {stageItem.format === 'round_robin' ? 'Round Robin' :
                                                stageItem.format === 'single_elim' ? 'Single Elimination' :
                                                'Double Elimination'}
                                                {stageItem.rounds ? ` • ${stageItem.rounds} rounds` : ''}
                                                {' • '}
                                                {stageItem.generated ? 'Generated' : 'Not generated'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDeleteStage(stageItem.id)
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
                )}
            </div>
        </div>
    )
}