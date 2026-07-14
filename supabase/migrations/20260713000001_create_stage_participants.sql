CREATE TABLE stage_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stage_id UUID REFERENCES stages(id) ON DELETE CASCADE NOT NULL,
    participant_id UUID REFERENCES event_participants(id) ON DELETE CASCADE NOT NULL,
    UNIQUE(stage_id, participant_id)
);

ALTER TABLE stage_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stage participants"
ON stage_participants FOR SELECT
USING (
    stage_id IN (
        SELECT id FROM stages WHERE event_id IN (
            SELECT id FROM events WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Users can create stage participants"
ON stage_participants FOR INSERT
WITH CHECK (
    stage_id IN (
        SELECT id FROM stages WHERE event_id IN (
            SELECT id FROM events WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Users can update stage participants"
ON stage_participants FOR UPDATE
USING (
    stage_id IN (
        SELECT id FROM stages WHERE event_id IN (
            SELECT id FROM events WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Users can delete stage participants"
ON stage_participants FOR DELETE
USING (
    stage_id IN (
        SELECT id FROM stages WHERE event_id IN (
            SELECT id FROM events WHERE user_id = auth.uid()
        )
    )
);