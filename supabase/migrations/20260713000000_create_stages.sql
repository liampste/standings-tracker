CREATE TYPE stage_format AS ENUM ('round_robin', 'single_elim', 'double_elim');

CREATE TABLE stages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    format stage_format NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stages"
ON stages FOR SELECT
USING (
    event_id IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can create stages"
ON stages FOR INSERT
WITH CHECK (
    event_id IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update stages"
ON stages FOR UPDATE
USING (
    event_id IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete stages"
ON stages FOR DELETE
USING (
    event_id IN (
        SELECT id FROM events WHERE user_id = auth.uid()
    )
);