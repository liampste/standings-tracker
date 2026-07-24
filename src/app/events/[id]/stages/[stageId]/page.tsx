'use client'

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase-browser"

type Participant = {
    id: string
    name: string
    seed: number | null
}

type Match = {
    id: string
    stage_id: string
    round: number
    participant_a_id: string | null
    participant_b_id: string | null
    score_a: number
    score_b: number
    overtime_score_a: number | null
    overtime_score_b: number | null
    status: 'pending' | 'completed'
    next_match_id: string | null
}

type Stage = {
    id: string
    name: string
    format: 'round_robin' | 'single_elim' | 'double_elim'
    rounds: number | null
    points_win: number
    points_draw: number
    points_loss: number
    overtime_enabled: boolean
    seeded: boolean
    generated: boolean
}

type StandingRow = {
    participant: Participant
    played: number
    won: number
    drew: number
    lost: number
    overtimeWins: number
    pointsFor: number
    pointsAgainst: number
    goalDifference: number
    points: number
    form: ('W' | 'D' | 'L')[]
}

export default function StagePage() {
    const [stage, setStage] = useState<Stage | null>(null)
    const [matches, setMatches] = useState<Match[]>([])
    const [participants, setParticipants] = useState<Participant[]>([])
    const [activeTab, setActiveTab] = useState<'schedule' | 'standings' | 'stats'>('schedule')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
    const [scoreA, setScoreA] = useState('')
    const [scoreB, setScoreB] = useState('')
    const [overtimeScoreA, setOvertimeScoreA] = useState('')
    const [overtimeScoreB, setOvertimeScoreB] = useState('')
    const [savingScore, setSavingScore] = useState(false)
    const [openLeaderboard, setOpenLeaderboard] = useState<string | null>(null)
    const router = useRouter()
    const params = useParams()
    const eventId = params.id as string
    const stageId = params.stageId as string
    const supabase = createClient()

    useEffect(() => {
        if (stage?.format !== 'round_robin' && activeTab === 'standings') {
            setActiveTab('schedule')
        }
    }, [stage])

    useEffect(() => {
        fetchAll()
    }, [])

    const fetchAll = async () => {
        setLoading(true)
        await Promise.all([fetchStage(), fetchMatches(), fetchParticipants()])
        setLoading(false)
    }

    const fetchStage = async () => {
        const { data, error } = await supabase
            .from('stages')
            .select('*')
            .eq('id', stageId)
            .single()
        if (error) {
            setError(error.message)
        } else {
            setStage(data)
        }
    } 

    const fetchMatches = async () => {
        const { data, error } = await supabase
            .from('matches')
            .select('*')
            .eq('stage_id', stageId)
            .order('round', { ascending: true })
        if (error) {
            setError(error.message)
        } else {
            setMatches(data)
        }
    }

    const fetchParticipants = async () => {
        const { data, error } = await supabase
            .from('stage_participants')
            .select('seed, event_participants(id, name)')
            .eq('stage_id', stageId)
        if (error) {
            setError(error.message)
        } else {
            const mapped = data.map((row: any) => ({
                ...row.event_participants,
                seed: row.seed
            }))
            setParticipants(mapped)
        }
    }

    const getParticipantName = (id: string | null) => {
        if (!id) return 'TBD'
        const participant = participants.find(p => p.id === id)
        if (!participant) return 'Unknown'
        if (stage?.seeded && participant.seed) {
            return `(${participant.seed}) ${participant.name}`
        }
        return participant.name
    }

    const completedMatches = matches.filter(m => m.status === 'completed').length
    const totalMatches = matches.length

    const openScorePopup = (match: Match) => {
        setSelectedMatch(match)
        setScoreA(match.score_a?.toString() || '0')
        setScoreB(match.score_b?.toString() || '0')
        setOvertimeScoreA(match.overtime_score_a?.toString() || '')
        setOvertimeScoreB(match.overtime_score_b?.toString() || '')
    }
    
    const closeScorePopup = () => {
        setSelectedMatch(null)
        setScoreA('')
        setScoreB('')
        setOvertimeScoreA('')
        setOvertimeScoreB('')
    }

    const handleSaveScore = async () => {
        if (!selectedMatch) return
        setSavingScore(true)

        const sA = parseInt(scoreA) || 0
        const sB = parseInt(scoreB) || 0
        const otA = overtimeScoreA !== '' ? parseInt(overtimeScoreA) || 0 : null
        const otB = overtimeScoreB !== '' ? parseInt(overtimeScoreB) || 0 : null

        const { error } = await supabase
            .from('matches')
            .update({
                score_a: sA,
                score_b: sB,
                overtime_score_a: otA,
                overtime_score_b: otB,
                status: 'completed'
            })
            .eq('id', selectedMatch.id)

        if (error) {
            setError(error.message)
            setSavingScore(false)
            return
        }

        // Advance winner for single elimination
        if (stage?.format === 'single_elim' && selectedMatch.next_match_id) {
            // Determine winner
            let winnerId: string | null = null
            if (otA !== null && otB !== null) {
                winnerId = otA > otB ? selectedMatch.participant_a_id : selectedMatch.participant_b_id
            } else {
                winnerId = sA > sB ? selectedMatch.participant_a_id : selectedMatch.participant_b_id
            }

            if (winnerId) {
                // Find the next match and determine which slot to fill
                const { data: nextMatch } = await supabase
                    .from('matches')
                    .select('*')
                    .eq('id', selectedMatch.next_match_id)
                    .single()

                if (nextMatch) {
                    // Determine slot based on current match position
                    const currentRoundMatches = matches
                        .filter(m => m.round === selectedMatch.round)
                        .sort((a, b) => a.id.localeCompare(b.id))
                    const matchIndex = currentRoundMatches.findIndex(m => m.id === selectedMatch.id)
                    const isTopSlot = matchIndex % 2 === 0

                    await supabase
                        .from('matches')
                        .update({
                            [isTopSlot ? 'participant_a_id' : 'participant_b_id']: winnerId
                        })
                        .eq('id', selectedMatch.next_match_id)
                }
            }
        }

        await fetchMatches()
        closeScorePopup()
        setSavingScore(false)
    }

    const calculateStandings = (): StandingRow[] => {
        if (!stage) return []
        
        return participants.map(participant => {
            const participantMatches = matches.filter(
                m => m.status === 'completed' &&
                (m.participant_a_id === participant.id || m.participant_b_id === participant.id)
            )

            let won = 0, drew = 0, lost = 0, overtimeWins = 0
            let pointsFor = 0, pointsAgainst = 0
            const form: ('W' | 'D' | 'L')[] = []

            participantMatches.forEach(match => {
                const isA = match.participant_a_id === participant.id
                const myScore = isA ? match.score_a : match.score_b
                const theirScore = isA ? match.score_b : match.score_a
                const myOT = isA ? match.overtime_score_a : match.overtime_score_b
                const theirOT = isA ? match.overtime_score_b : match.overtime_score_a

                pointsFor += myScore
                pointsAgainst += theirScore

                // Determine result
                if (myOT !== null && theirOT !== null) {
                    // Overtime was played
                    if (myOT > theirOT) {
                        won++ 
                        overtimeWins++
                        form.push('W')
                    } else {
                        lost++
                        form.push('L')
                    }
                } else if (myScore > theirScore) {
                    won++
                    form.push('W')
                } else if (myScore === theirScore) {
                    drew++
                    form.push('D')
                } else {
                    lost++
                    form.push('L')
                }
            })

            const points = (won * stage.points_win) + (drew * stage.points_draw) + (lost * stage.points_loss)
            const goalDifference = pointsFor - pointsAgainst

            return {
                participant,
                played: participantMatches.length,
                won,
                drew,
                lost,
                overtimeWins,
                pointsFor,
                pointsAgainst,
                goalDifference,
                points,
                form: form.slice(-5)
            }
        }).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points
            return b.goalDifference - a.goalDifference
        })
    }

    const standings = calculateStandings()

    // stats calculations
    const biggestWin = () => {
        let biggest = { margin: 0, match: null as Match | null }
        matches.filter(m => m.status === 'completed').forEach(match => {
            const margin = Math.abs(match.score_a - match.score_b)
            if (margin > biggest.margin) {
                biggest = { margin, match }
            }
        })
        return biggest
    }

    const biggestWinData = biggestWin()

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Loading...</p>
            </div>
        )
    }

    // Group matches by round
    const matchesByRound = matches.reduce((acc, match) => {
        if (!acc[match.round]) acc[match.round] = []
        acc[match.round].push(match)
        return acc
    }, {} as Record<number, Match[]>)

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
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">
                            {stage?.name}
                        </h1>
                        <p className="text-xs text-gray-500">
                            {completedMatches} of {totalMatches} matches completed
                        </p>
                    </div>
                </div>
            </nav>

            <div className="max-w-4xl mx-auto px-6 py-8">
                {error && (
                    <p className="text-red-500 text-sm mb-4">{error}</p>
                )}

                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6">
                    {(['schedule', ...(stage?.format === 'round_robin' ? ['standings'] : []), 'stats'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as 'schedule' | 'standings' | 'stats')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                                activeTab === tab
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Schedule Tab */}
                {activeTab === 'schedule' && (
                    <div className="grid gap-6">
                        {Object.entries(matchesByRound).map(([round, roundMatches]) => (
                            <div key={round}>
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                    Round {round}
                                </h3>
                                <div className="grid gap-2">
                                    {roundMatches.map(match => (
                                        <div
                                            key={match.id}
                                            onClick={() => {
                                                if (match.participant_a_id && match.participant_b_id) {
                                                    openScorePopup(match)
                                                }
                                            }}
                                            className={`bg-white rounded-lg shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow ${
                                                match.participant_a_id && match.participant_b_id ? 'cursor-pointer' : 'cursor-default opacity-60'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4 flex-1">
                                                <span className="font-medium text-gray-900 text-right flex-1">
                                                    {getParticipantName(match.participant_a_id)}
                                                </span>
                                                <div className="text-center min-w-16">
                                                    {match.status === 'completed' ? (
                                                        <div>
                                                            <span className="font-bold text-gray-900">
                                                                {match.score_a} - {match.score_b}
                                                            </span>
                                                            {match.overtime_score_a !== null && (
                                                                <p className="text-xs text-gray-400">
                                                                    OT: {match.overtime_score_a} - {match.overtime_score_b}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 text-sm">vs</span>
                                                    )}
                                                </div>
                                                <span className="font-medium text-gray-900 flex-1">
                                                    {getParticipantName(match.participant_b_id)}
                                                </span>
                                            </div>
                                            <div className="ml-4">
                                                <span className={`text-xs px-2 py-1 rounded-full ${
                                                    match.status === 'completed'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                    {match.status === 'completed' ? 'Final' : 'Pending'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Standings Tab */}
                {activeTab === 'standings' && (
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-4 py-3 font-medium text-gray-500">#</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-500">Participant</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">P</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">W</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">D</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">L</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">PF</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">PA</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">GD</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">Pts</th>
                                    <th className="text-center px-4 py-3 font-medium text-gray-500">Form</th>
                                </tr>
                            </thead>
                            <tbody>
                                {standings.map((row, index) => (
                                    <tr key={row.participant.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            {row.participant.name}
                                            {row.participant.seed && (
                                                <span className="ml-2 text-xs text-gray-400">
                                                    #{row.participant.seed}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center text-gray-700">{row.played}</td>
                                        <td className="px-4 py-3 text-center text-gray-700">{row.won}</td>
                                        <td className="px-4 py-3 text-center text-gray-700">{row.drew}</td>
                                        <td className="px-4 py-3 text-center text-gray-700">{row.lost}</td>
                                        <td className="px-4 py-3 text-center text-gray-700">{row.pointsFor}</td>
                                        <td className="px-4 py-3 text-center text-gray-700">{row.pointsAgainst}</td>
                                        <td className="px-4 py-3 text-center text-gray-700">
                                            {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-gray-900">{row.points}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1 justify-center">
                                                {row.form.map((result, i) => (
                                                    <span
                                                        key={i}
                                                        className={`w-5 h-5 rounded-full text-xs flex items-center justify-center text-white font-medium ${
                                                            result === 'W' ? 'bg-green-500' :
                                                            result === 'D' ? 'bg-gray-400' :
                                                            'bg-red-500'
                                                        }`}
                                                    >
                                                        {result}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Stats Tab */}
                {activeTab === 'stats' && (
                    <div className="grid gap-6">
                        {[
                            {
                                id: 'pointsFor',
                                title: 'Most Points Scored',
                                getValue: (row: StandingRow) => row.pointsFor,
                                format: (val: number) => val.toString()
                            },
                            {
                                id: 'pointsAgainst',
                                title: 'Most Points Conceded',
                                getValue: (row: StandingRow) => row.pointsAgainst,
                                format: (val: number) => val.toString()
                            },
                            {
                                id: 'goalDifference',
                                title: 'Best Goal Difference',
                                getValue: (row: StandingRow) => row.goalDifference,
                                format: (val: number) => val > 0 ? `+${val}` : val.toString()
                            },
                            {
                                id: 'overtimeWins',
                                title: 'Most Overtime Wins',
                                getValue: (row: StandingRow) => row.overtimeWins,
                                format: (val: number) => val.toString()
                            },
                        ].map(stat => {
                            const sorted = [...standings].sort(
                                (a, b) => stat.getValue(b) - stat.getValue(a)
                            )
                            const top3 = sorted.slice(0, 3)

                            return (
                                <div key={stat.id} className="bg-white rounded-lg shadow-sm p-5">
                                    <h3 className="font-semibold text-gray-900 mb-4">{stat.title}</h3>
                                    <div className="grid gap-2">
                                        {top3.map((row, index) => (
                                            <div key={row.participant.id} className="flex items-center gap-3">
                                                <span className={`text-sm font-bold w-6 ${
                                                    index === 0 ? 'text-yellow-500' :
                                                    index === 1 ? 'text-gray-400' :
                                                    'text-orange-400'
                                                }`}>
                                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                                </span>
                                                <span className="flex-1 text-sm font-medium text-gray-900">
                                                    {row.participant.name}
                                                </span>
                                                <span className="text-sm font-bold text-gray-900">
                                                    {stat.format(stat.getValue(row))}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {standings.length > 3 && (
                                        <button
                                            onClick={() => setOpenLeaderboard(stat.id)}
                                            className="mt-4 w-full text-sm text-blue-600 hover:text-blue-700 text-center py-1 border-t border-gray-100 pt-3"
                                        >
                                            View Full Leaderboard ({standings.length} participants)
                                        </button>
                                    )}
                                </div>
                            )
                        })}

                        {/* Biggest Win */}
                        <div className="bg-white rounded-lg shadow-sm p-5">
                            <h3 className="font-semibold text-gray-900 mb-4">Biggest Win</h3>
                            {biggestWinData.match ? (
                                <div className="flex items-center gap-4">
                                    <span className="font-medium text-gray-900">
                                        {getParticipantName(biggestWinData.match.score_a > biggestWinData.match.score_b
                                            ? biggestWinData.match.participant_a_id
                                            : biggestWinData.match.participant_b_id
                                        )}
                                    </span>
                                    <span className="font-bold text-gray-900">
                                        {biggestWinData.match.score_a} - {biggestWinData.match.score_b}
                                    </span>
                                    <span className="text-gray-500">vs</span>
                                    <span className="font-medium text-gray-900">
                                        {getParticipantName(biggestWinData.match.score_a > biggestWinData.match.score_b
                                            ? biggestWinData.match.participant_b_id
                                            : biggestWinData.match.participant_a_id
                                        )}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        (Round {biggestWinData.match.round})
                                    </span>
                                </div>
                            ) : (
                                <p className="text-gray-400 text-sm">No completed matches yet</p>
                            )}
                        </div>
                    </div>
                )}
            {/* Full Leaderboard Popup */}
            {openLeaderboard && (() => {
                const stat = [
                    {
                        id: 'pointsFor',
                        title: 'Most Points Scored',
                        getValue: (row: StandingRow) => row.pointsFor,
                        format: (val: number) => val.toString()
                    },
                    {
                        id: 'pointsAgainst',
                        title: 'Most Points Conceded',
                        getValue: (row: StandingRow) => row.pointsAgainst,
                        format: (val: number) => val.toString()
                    },
                    {
                        id: 'goalDifference',
                        title: 'Best Goal Difference',
                        getValue: (row: StandingRow) => row.goalDifference,
                        format: (val: number) => val > 0 ? `+${val}` : val.toString()
                    },
                    {
                        id: 'overtimeWins',
                        title: 'Most Overtime Wins',
                        getValue: (row: StandingRow) => row.overtimeWins,
                        format: (val: number) => val.toString()
                    },
                ].find(s => s.id === openLeaderboard)

                if (!stat) return null

                const sorted = [...standings].sort(
                    (a, b) => stat.getValue(b) - stat.getValue(a)
                )

                return (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    {stat.title}
                                </h3>
                                <button
                                    onClick={() => setOpenLeaderboard(null)}
                                    className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="overflow-y-auto flex-1 grid gap-2">
                                {sorted.map((row, index) => (
                                    <div
                                        key={row.participant.id}
                                        className={`flex items-center gap-3 p-2 rounded-md ${
                                            index < 3 ? 'bg-gray-50' : ''
                                        }`}
                                    >
                                        <span className="text-sm w-8 text-center">
                                            {index === 0 ? '🥇' :
                                            index === 1 ? '🥈' :
                                            index === 2 ? '🥉' :
                                            <span className="text-gray-400">{index + 1}</span>}
                                        </span>
                                        <span className="flex-1 text-sm font-medium text-gray-900">
                                            {row.participant.name}
                                        </span>
                                        <span className="text-sm font-bold text-gray-900">
                                            {stat.format(stat.getValue(row))}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            })()}
            </div>

            {/* Score Entry Popup */}
            {selectedMatch && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">
                            Enter Score
                        </h3>

                        <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1 text-center">
                                <p className="text-sm font-medium text-gray-700 mb-2">
                                    {getParticipantName(selectedMatch.participant_a_id)}
                                </p>
                                <input
                                    type="number"
                                    min={0}
                                    value={scoreA}
                                    onChange={(e) => setScoreA(e.target.value)}
                                    className="w-full text-center text-2xl font-bold border border-gray-300 rounded-md px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <span className="text-gray-400 font-bold text-xl">—</span>
                            <div className="flex-1 text-center">
                                <p className="text-sm font-medium text-gray-700 mb-2">
                                    {getParticipantName(selectedMatch.participant_b_id)}
                                </p>
                                <input
                                    type="number"
                                    min={0}
                                    value={scoreB}
                                    onChange={(e) => setScoreB(e.target.value)}
                                    className="w-full text-center text-2xl font-bold border border-gray-300 rounded-md px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Overtime section */}
                        {stage?.overtime_enabled && (
                            <div className="border-t border-gray-100 pt-4 mb-6">
                                <p className="text-sm font-medium text-gray-700 mb-3 text-center">
                                    Overtime (optional)
                                </p>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="number"
                                        min={0}
                                        value={overtimeScoreA}
                                        onChange={(e) => setOvertimeScoreA(e.target.value)}
                                        placeholder="—"
                                        className="flex-1 text-center text-xl font-bold border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-400 font-bold">—</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={overtimeScoreB}
                                        onChange={(e) => setOvertimeScoreB(e.target.value)}
                                        placeholder="—"
                                        className="flex-1 text-center text-xl font-bold border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <p className="text-xs text-gray-400 text-center mt-2">
                                    Only fill in if the match went to overtime
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={closeScorePopup}
                                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveScore}
                                disabled={savingScore}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {savingScore ? 'Saving...' : 'Save Score'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}