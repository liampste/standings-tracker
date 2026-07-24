'use client'

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase-browser"

type Participant = {
    id: string
    name: string
}

type StageForm = {
    name: string
    format: 'round_robin' | 'single_elim' | 'double_elim'
    selectedParticipants: string[]
    rounds: number
    seeded: boolean
    seeds: Record<string, number>
    pointsWin: number
    pointsDraw: number
    pointsLoss: number
    overtimeEnabled: boolean
}

export default function NewStagePage() {
    const [currentStep, setCurrentStep] = useState(1)
    const [participants, setParticipants] = useState<Participant[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const router = useRouter()
    const params = useParams()
    const eventId = params.id as string
    const supabase = createClient()

    const [form, setForm] = useState<StageForm>({
        name: '',
        format: 'round_robin',
        selectedParticipants: [],
        rounds: 1,
        seeded: false,
        seeds: {},
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        overtimeEnabled: false
    })

    const totalSteps = form.format === 'round_robin' ? 6 : 5

    useEffect(() => {
        fetchParticipants()
    })

    const fetchParticipants = async () => {
        const { data, error } = await supabase
            .from('event_participants')
            .select('id, name')
            .eq('event_id', eventId)
            .order('created_at', { ascending: true })
        
        if (error) {
            setError(error.message)
        } else {
            setParticipants(data)
        }
        setLoading(false)
    }

    const updateForm = (updates: Partial<StageForm>) => {
        setForm(prev => ({ ...prev, ...updates }))
    }

    const toggleParticipant = (id: string) => {
        const selected = form.selectedParticipants
        if (selected.includes(id)) {
            updateForm({
                selectedParticipants: selected.filter(p => p !== id),
                seeds: Object.fromEntries(
                    Object.entries(form.seeds).filter(([key]) => key !== id)
                )
            })
        } else {
            updateForm({ selectedParticipants: [...selected, id] })
        }
    }

    const selectAll = () => {
        updateForm({ selectedParticipants: participants.map(p => p.id) })
    }

    const deselectAll = () => {
        updateForm({ selectedParticipants: [], seeds: {} })
    }

    const minRounds = () => {
        const n = form.selectedParticipants.length
        return n % 2 === 0 ? n - 1 : n
    }

    const canProceed = () => {
        if (currentStep === 1) return form.name.trim().length > 0
        if (currentStep === 2) return form.selectedParticipants.length >= 2
        if (currentStep === 3 && form.format === 'round_robin') {
            return form.rounds >= minRounds()
        }
        if (currentStep === 4 && form.seeded) {
            const assignedSeeds = Object.values(form.seeds)
            const n = form.selectedParticipants.length
            // Every participant has a seed
            const allAssigned = form.selectedParticipants.every(id => form.seeds[id] > 0)
            // No duplicate seeds
            const noDuplicates = new Set(assignedSeeds).size === assignedSeeds.length
            // Seeds are 1 through N
            const validRange = assignedSeeds.every(s => s >= 1 && s <= n)
            return allAssigned && noDuplicates && validRange
        }
        return true
    }

    const nextStep = () => {
        if (currentStep === 2 && form.format !== 'round_robin') {
            setCurrentStep(4) // skip rounds step for bracket formats
        } else {
            setCurrentStep(prev => prev + 1)
        }
    }

    const prevStep = () => {
        if (currentStep === 4 && form.format !== 'round_robin') {
            setCurrentStep(2) // skip rounds step going back
        } else {
            setCurrentStep(prev => prev - 1)
        }
    }

    const generateRoundRobinMatches = (
        stageId: string,
        participantIds: string[],
        rounds: number
    ) => {
        const matches = []
        const n = participantIds.length
        const ids = [...participantIds]

        // If odd number, add a bye
        if (n % 2 !== 0) ids.push('bye')

        const totalTeams = ids.length
        const roundsPerCycle = totalTeams - 1

        for (let round = 0; round < rounds; round++) {
            const cycleRound = round % roundsPerCycle
            const rotated = [ids[0], ...ids.slice(1).slice(cycleRound).concat(ids.slice(1).slice(0, cycleRound))]

            for (let i = 0; i < totalTeams / 2; i++) {
                const home = rotated[i]
                const away = rotated[totalTeams - 1 - i]

                if (home === 'bye' || away === 'bye') continue

                matches.push({
                    stage_id: stageId,
                    round: round + 1,
                    participant_a_id: home,
                    participant_b_id: away,
                    status: 'pending'
                })
            }
        }

        return matches
    }

    const generateSingleElim = async (stageId: string) => {
        const participantIds = form.selectedParticipants
        const n = participantIds.length
        const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(n)))
        const numRounds = Math.log2(nextPowerOf2)
        const numByes = nextPowerOf2 - n

        // Sort by seed or randomize
        let sorted = [...participantIds]
        if (form.seeded) {
            sorted.sort((a, b) => (form.seeds[a] || 999) - (form.seeds[b] || 999))
        } else {
            sorted.sort(() => Math.random() - 0.5)
        }

        // Add nulls (byes) at the end — top seeds get byes
        const withByes: (string | null)[] = [
            ...sorted,
            ...Array(numByes).fill(null)
        ]

        // Build bracket slots using standard seeding pattern
        // For 8 slots: positions map to [1,8,5,4,3,6,7,2] (seed order)
        const buildBracketOrder = (size: number): number[] => {
            if (size === 2) return [1, 2]
            const prev = buildBracketOrder(size / 2)
            const result: number[] = []
            for (const seed of prev) {
                result.push(seed)
                result.push(size + 1 - seed)
            }
            return result
        }

        const seedOrder = buildBracketOrder(nextPowerOf2)
        const bracketSlots: (string | null)[] = seedOrder.map(
            seed => withByes[seed - 1] ?? null
        )

        // Step 1: Insert ALL placeholder matches for all rounds
        const allMatchInserts = []
        for (let round = 1; round <= numRounds; round++) {
            const matchCount = nextPowerOf2 / Math.pow(2, round)
            for (let i = 0; i < matchCount; i++) {
                allMatchInserts.push({
                    stage_id: stageId,
                    round,
                    participant_a_id: null,
                    participant_b_id: null,
                    score_a: 0,
                    score_b: 0,
                    status: 'pending'
                })
            }
        }

        const { data: insertedMatches, error: matchError } = await supabase
            .from('matches')
            .insert(allMatchInserts)
            .select()

        if (matchError || !insertedMatches) return matchError

        // Step 2: Group matches by round
        const matchesByRound: Record<number, any[]> = {}
        insertedMatches.forEach(match => {
            if (!matchesByRound[match.round]) matchesByRound[match.round] = []
            matchesByRound[match.round].push(match)
        })

        // Sort each round's matches consistently
        Object.keys(matchesByRound).forEach(round => {
            matchesByRound[Number(round)].sort((a, b) => a.id.localeCompare(b.id))
        })

        // Step 3: Link next_match_id
        await Promise.all(
            Object.keys(matchesByRound)
                .map(Number)
                .filter(round => round < numRounds)
                .flatMap(round =>
                    matchesByRound[round].map((match, index) => {
                        const nextMatch = matchesByRound[round + 1][Math.floor(index / 2)]
                        return supabase
                            .from('matches')
                            .update({ next_match_id: nextMatch.id })
                            .eq('id', match.id)
                            .then()
                    })
                )
        )

        // Step 4: Fill Round 1 participants and handle byes
        const round1Matches = matchesByRound[1]

        await Promise.all(
            round1Matches.map(async (match, i) => {
                const participantA = bracketSlots[i * 2]
                const participantB = bracketSlots[i * 2 + 1]

                if (participantA !== null && participantB !== null) {
                    // Normal match
                    await supabase
                        .from('matches')
                        .update({
                            participant_a_id: participantA,
                            participant_b_id: participantB
                        })
                        .eq('id', match.id)
                } else if (participantA !== null && participantB === null) {
                    // Participant A gets a bye
                    const nextMatch = matchesByRound[2]?.[Math.floor(i / 2)]
                    const isTopSlot = i % 2 === 0
                    await supabase
                        .from('matches')
                        .update({
                            participant_a_id: participantA,
                            participant_b_id: null,
                            status: 'completed'
                        })
                        .eq('id', match.id)
                    if (nextMatch) {
                        await supabase
                            .from('matches')
                            .update({
                                [isTopSlot ? 'participant_a_id' : 'participant_b_id']: participantA
                            })
                            .eq('id', nextMatch.id)
                    }
                } else if (participantA === null && participantB !== null) {
                    // Participant B gets a bye
                    const nextMatch = matchesByRound[2]?.[Math.floor(i / 2)]
                    const isTopSlot = i % 2 === 0
                    await supabase
                        .from('matches')
                        .update({
                            participant_a_id: null,
                            participant_b_id: participantB,
                            status: 'completed'
                        })
                        .eq('id', match.id)
                    if (nextMatch) {
                        await supabase
                            .from('matches')
                            .update({
                                [isTopSlot ? 'participant_a_id' : 'participant_b_id']: participantB
                            })
                            .eq('id', nextMatch.id)
                    }
                }
            })
        )

        return null
    }

    const handleGenerate = async () => {
        setSubmitting(true)
        setError('')

        // 1. Create the stage
        const { data: stage, error: stageError } = await supabase
            .from('stages')
            .insert({
                event_id: eventId,
                name: form.name.trim(),
                format: form.format,
                rounds: form.format === 'round_robin' ? form.rounds : null,
                points_win: form.pointsWin,
                points_draw: form.pointsDraw,
                points_loss: form.pointsLoss,
                overtime_enabled: form.overtimeEnabled,
                seeded: form.seeded,
                generated: true,
                display_order: 0,
            })
            .select()
            .single()

        if (stageError) {
            setError(stageError.message)
            setSubmitting(false)
            return
        }

        // 2. Insert stage participants with seeds
        const stageParticipants = form.selectedParticipants.map((participantId) => ({
            stage_id: stage.id,
            participant_id: participantId,
            seed: form.seeded ? (form.seeds[participantId] || null) : null,
        }))

        const { error: participantsError } = await supabase
            .from('stage_participants')
            .insert(stageParticipants)

        if (participantsError) {
            setError(participantsError.message)
            setSubmitting(false)
            return
        }

        // 3. Generate matches based on format
        if (form.format === 'round_robin') {
            const matches = generateRoundRobinMatches(
                stage.id,
                form.selectedParticipants,
                form.rounds
            )
            const { error: matchesError } = await supabase
                .from('matches')
                .insert(matches)

            if (matchesError) {
                setError(matchesError.message)
                setSubmitting(false)
                return
            }
        } else if (form.format === 'single_elim') {
            const elimError = await generateSingleElim(stage.id)
            if (elimError) {
                setError(elimError.message)
                setSubmitting(false)
                return
            }
        }

        router.push(`/events/${eventId}/stages/${stage.id}`)
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
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push(`/events/${eventId}`)}
                        className="text-sm text-gray-500 hover:text-gray-900"
                    >
                        ← Back
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">
                        New Stage
                    </h1>
                </div>
            </nav>

            <div className="max-w-2xl mx-auto px-6 py-8">
                {/* Progress Indicator */}
                <div className="flex items-center justify-between mb-8">
                    {Array.from({ length: totalSteps }, (_, i) => (
                        <div key={i} className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                i + 1 === currentStep
                                    ? 'bg-blue-600 text-white'
                                    : i + 1 < currentStep
                                    ? 'bg-blue-200 text-blue-800'
                                    : 'bg-gray-200 text-gray-500'
                            }`}>
                                {i + 1}
                            </div>
                            {i < totalSteps - 1 && (
                                <div className={`h-1 w-full mx-1 ${
                                    i + 1 < currentStep ? 'bg-blue-200' : 'bg-gray-200'
                                }`} style={{ width: '40px' }} />
                            )}
                        </div>
                    ))}
                </div>

                {error && (
                    <p className="text-red-500 text-sm mb-4">{error}</p>
                )}

                <div className="bg-white rounded-lg shadow-sm p-6">

                    {/* Step 1: Basic Info */}
                    {currentStep === 1 && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-1">
                                Basic Info
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                Name your stage and choose a format
                            </p>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Stage Name
                                </label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => updateForm({ name: e.target.value })}
                                    placeholder="e.g. Group Stage, Playoffs"
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Format
                                </label>
                                <div className="grid gap-2">
                                    {[
                                        { value: 'round_robin', label: 'Round Robin', desc: 'Every participant plays every other participant' },
                                        { value: 'single_elim', label: 'Single Elimination', desc: 'Lose once and you are out' },
                                        { value: 'double_elim', label: 'Double Elimination', desc: 'You must lose twice to be eliminated' },
                                    ].map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => updateForm({ format: option.value as StageForm['format'] })}
                                            className={`text-left p-3 rounded-md border transition-colors ${
                                                form.format === option.value
                                                    ? 'border-blue-600 bg-blue-50'
                                                    : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            <p className="font-medium text-gray-900 text-sm">{option.label}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{option.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Participants */}
                    {currentStep === 2 && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-1">
                                Participants
                            </h2>
                            <p className="text-sm text-gray-500 mb-4">
                                Select who is in this stage ({form.selectedParticipants.length} selected)
                            </p>

                            <div className="flex gap-2 mb-4">
                                <button
                                    onClick={selectAll}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    Select All
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                    onClick={deselectAll}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    Deselect All
                                </button>
                            </div>

                            <div className="grid gap-2">
                                {participants.map((participant) => (
                                    <label
                                        key={participant.id}
                                        className="flex items-center gap-3 p-3 rounded-md border border-gray-200 hover:border-gray-300 cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={form.selectedParticipants.includes(participant.id)}
                                            onChange={() => toggleParticipant(participant.id)}
                                            className="w-4 h-4 text-blue-600"
                                        />
                                        <span className="text-sm font-medium text-gray-900">
                                            {participant.name}
                                        </span>
                                    </label>
                                ))}
                            </div>

                            {form.selectedParticipants.length < 2 && (
                                <p className="text-red-500 text-xs mt-3">
                                    Select at least 2 participants to continue
                                </p>
                            )}
                        </div>
                    )}

                    {/* Step 3: Rounds (Round Robin only) */}
                    {currentStep === 3 && form.format === 'round_robin' && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-1">
                                Rounds
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                How many matchdays should this stage have?
                            </p>

                            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                                <p className="text-blue-800 text-sm">
                                    With {form.selectedParticipants.length} participants, you need a minimum of <strong>{minRounds()}</strong> rounds for everyone to play each other once.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Number of Rounds
                                </label>
                                <input
                                    type="number"
                                    value={form.rounds}
                                    min={minRounds()}
                                    onChange={(e) => updateForm({ rounds: parseInt(e.target.value) || minRounds() })}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {form.rounds < minRounds() && (
                                    <p className="text-red-500 text-xs mt-1">
                                        Minimum {minRounds()} rounds required
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Seeding */}
                    {currentStep === 4 && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-1">
                                Seeding
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                Optionally assign seed numbers to participants
                            </p>

                            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-md mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Enable Seeding</p>
                                    <p className="text-xs text-gray-500">Assign seed numbers to participants</p>
                                </div>
                                <button
                                    onClick={() => updateForm({ seeded: !form.seeded, seeds: {} })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        form.seeded ? 'bg-blue-600' : 'bg-gray-200'
                                    }`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        form.seeded ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                                </button>
                            </div>

                            {form.seeded && (
                                <div className="grid gap-2">
                                    <p className="text-sm text-gray-500">
                                        Assign seeds 1 through {form.selectedParticipants.length} to all participants
                                    </p>
                                    {form.selectedParticipants.map((id) => {
                                        const participant = participants.find(p => p.id === id)
                                        const currentSeed = form.seeds[id]
                                        const isDuplicate = currentSeed > 0 && 
                                            Object.entries(form.seeds).some(
                                                ([otherId, otherSeed]) => otherId !== id && otherSeed === currentSeed
                                            )
                                        const isOutOfRange = currentSeed > form.selectedParticipants.length || currentSeed < 1

                                        return (
                                            <div key={id} className={`flex items-center gap-3 p-3 border rounded-md ${
                                                isDuplicate || isOutOfRange ? 'border-red-400 bg-red-50' : 'border-gray-200'
                                            }`}>
                                                <span className="flex-1 text-sm font-medium text-gray-900">
                                                    {participant?.name}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    {isDuplicate && (
                                                        <span className="text-xs text-red-500">Duplicate</span>
                                                    )}
                                                    {isOutOfRange && currentSeed > 0 && (
                                                        <span className="text-xs text-red-500">Out of range</span>
                                                    )}
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={form.selectedParticipants.length}
                                                        value={form.seeds[id] || ''}
                                                        onChange={(e) => updateForm({
                                                            seeds: {
                                                                ...form.seeds,
                                                                [id]: parseInt(e.target.value) || 0
                                                            }
                                                        })}
                                                        placeholder="Seed #"
                                                        className={`w-20 border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                                            isDuplicate || isOutOfRange ? 'border-red-400' : 'border-gray-300'
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Summary validation message */}
                                    {form.selectedParticipants.some(id => !form.seeds[id]) && (
                                        <p className="text-red-500 text-xs mt-1">
                                            All participants must be assigned a seed
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 5: Points */}
                    {currentStep === 5 && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-1">
                                Points
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                Set how many points are awarded for each result
                            </p>

                            <div className="grid gap-4">
                                {[
                                    { label: 'Win', key: 'pointsWin', default: 3 },
                                    { label: 'Draw / Tie', key: 'pointsDraw', default: 1 },
                                    { label: 'Loss', key: 'pointsLoss', default: 0 },
                                ].map((item) => (
                                    <div key={item.key} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                                        <label className="text-sm font-medium text-gray-900">
                                            {item.label}
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={form[item.key as keyof StageForm] as number}
                                            onChange={(e) => updateForm({
                                                [item.key]: parseInt(e.target.value) || 0
                                            })}
                                            className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 6: Overtime */}
                    {currentStep === 6 && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-1">
                                Overtime
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                Allow matches to have an overtime score to determine a winner in the event of a draw
                            </p>

                            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Enable Overtime</p>
                                    <p className="text-xs text-gray-500">Adds an overtime score field to each match</p>
                                </div>
                                <button
                                    onClick={() => updateForm({ overtimeEnabled: !form.overtimeEnabled })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        form.overtimeEnabled ? 'bg-blue-600' : 'bg-gray-200'
                                    }`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        form.overtimeEnabled ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex justify-between mt-8">
                        <button
                            onClick={prevStep}
                            disabled={currentStep === 1}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30"
                        >
                            ← Back
                        </button>

                        {currentStep < totalSteps ? (
                            <button
                                onClick={nextStep}
                                disabled={!canProceed()}
                                className="bg-blue-600 text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                                Next →
                            </button>
                        ) : (
                            <button
                                onClick={handleGenerate}
                                disabled={submitting}
                                className="bg-green-600 text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                                {submitting ? 'Generating...' : 'Generate Schedule'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
