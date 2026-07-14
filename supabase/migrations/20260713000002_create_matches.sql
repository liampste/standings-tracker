CREATE TYPE match_status AS ENUM ('pending', 'completed');

CREATE TABLE matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stage_id UUID REFERENCES stages(id) ON DELETE CASCADE NOT NULL,
    round INTEGER NOT NULL,
    participant_a_id UUID REFERENCES event_participants(id) ON DELETE SET NULL,
    participant_b_id UUID REFERENCES event_participants(id) ON DELETE SET NULL,
    score_a INTEGER DEFAULT 0,
    score_b INTEGER DEFAULT 0,
    status match_status DEFAULT 'pending' NOT NULL,
    next_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own matches"
ON matches FOR SELECT
USING (
    (SELECT event_id FROM stages WHERE id = matches.stage_id) IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can create matches"
ON matches FOR INSERT
WITH CHECK (
    (SELECT event_id FROM stages WHERE id = matches.stage_id) IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update matches"
ON matches FOR UPDATE
USING (
    (SELECT event_id FROM stages WHERE id = matches.stage_id) IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete matches"
ON matches FOR DELETE
USING (
    (SELECT event_id FROM stages WHERE id = matches.stage_id) IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);