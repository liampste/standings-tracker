CREATE TABLE event_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    seed INTEGER,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own event participants"
ON event_participants FOR SELECT
USING (
    event_id IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can create event participants"
ON event_participants FOR INSERT
WITH CHECK (
    event_id IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update event participants"
ON event_participants FOR UPDATE
USING (
    event_id IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete event participants"
ON event_participants FOR DELETE
USING (
    event_id IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);